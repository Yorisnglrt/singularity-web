import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPaymentStatus, capturePayment } from '@/lib/vipps';
import { issueTicketsForOrder } from '@/lib/tickets/issueTicketsForOrder';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * Map Vipps payment state to local ticket_orders.payment_status.
 *
 * payment_status CHECK constraint allows:
 *   'pending', 'authorized', 'paid', 'cancelled', 'failed', 'refunded', 'partially_refunded'
 */
function mapVippsStateToLocal(vippsState: string): string | null {
  switch (vippsState) {
    case 'AUTHORIZED':
      return 'authorized';
    case 'CHARGED':
    case 'CAPTURED':
      return 'paid';
    case 'CANCELLED':
      return 'cancelled';
    case 'FAILED':
    case 'EXPIRED':
    case 'TERMINATED':
    case 'ABORTED':
      return 'failed';
    default:
      return null; // Unknown or still pending — do not update
  }
}

/**
 * Determine effective local status by checking both Vipps state AND aggregate captured amount.
 *
 * Vipps may report state=AUTHORIZED even after a successful capture.
 * The captured amount in the aggregate is the authoritative signal that funds were captured.
 */
function resolveEffectiveStatus(
  vippsState: string,
  aggregate: any,
  totalAmountOre: number,
): { localStatus: string | null; fullyCaptured: boolean } {
  const capturedValue: number = aggregate?.capturedAmount?.value ?? 0;
  const fullyCaptured = capturedValue >= totalAmountOre && totalAmountOre > 0;

  // Captured amount takes priority over state
  if (fullyCaptured) {
    return { localStatus: 'paid', fullyCaptured: true };
  }

  // Fall back to state-based mapping
  const localStatus = mapVippsStateToLocal(vippsState);
  return { localStatus, fullyCaptured: false };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get('reference');

    if (!reference) {
      return NextResponse.json({ error: 'Missing reference' }, { status: 400 });
    }

    // 1. Find order in ticket_orders by order_reference or vipps_reference
    const { data: order, error: orderError } = await supabaseAdmin
      .from('ticket_orders')
      .select('id, order_reference, total_amount_nok, currency, payment_status, vipps_reference, customer_name, customer_email, paid_at, tickets_issued')
      .or(`order_reference.eq.${reference},vipps_reference.eq.${reference}`)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // 2. If already in a terminal state, return immediately
    if (order.payment_status === 'paid') {
      console.log(`[vipps/status] Order ${order.order_reference} already paid, triggering idempotent issuance/email...`);
      try {
        await issueTicketsForOrder(order.id);
      } catch (issueErr: any) {
        console.error('[vipps/status] Ticket/Email fallback failed:', issueErr.message);
      }
      return NextResponse.json({
        status: 'paid',
        orderReference: order.order_reference,
      });
    }

    if (order.payment_status === 'cancelled') {
      return NextResponse.json({ status: 'cancelled', orderReference: order.order_reference });
    }

    if (order.payment_status === 'failed') {
      return NextResponse.json({ status: 'failed', orderReference: order.order_reference });
    }

    // 3. Query Vipps for current payment state
    const vippsRef = order.vipps_reference || order.order_reference;
    const vippsStatus = await getPaymentStatus(vippsRef);
    const vippsState = vippsStatus.state;
    const totalAmountOre = order.total_amount_nok * 100;

    // 4. Resolve effective status using both state and captured amount
    const { localStatus, fullyCaptured } = resolveEffectiveStatus(
      vippsState,
      vippsStatus.aggregate,
      totalAmountOre,
    );

    if (!localStatus) {
      // Still in a pending/unknown state at Vipps
      return NextResponse.json({ status: 'pending', orderReference: order.order_reference });
    }

    // 5. Build update payload using only existing ticket_orders columns
    const updatePayload: Record<string, any> = {
      payment_status: localStatus,
      updated_at: new Date().toISOString(),
    };

    if (localStatus === 'paid') {
      updatePayload.paid_at = new Date().toISOString();
    }

    if (localStatus === 'cancelled') {
      updatePayload.cancelled_at = new Date().toISOString();
    }

    // 6. Update ticket_orders
    const { error: updateError } = await supabaseAdmin
      .from('ticket_orders')
      .update(updatePayload)
      .eq('id', order.id);

    if (updateError) {
      console.error('[vipps/status] Failed to update order:', updateError);
      // Still return the status even if DB update failed
    }

    // 7. If status is PAID, issue tickets (idempotent)
    if (localStatus === 'paid') {
      try {
        await issueTicketsForOrder(order.id);
      } catch (issueErr: any) {
        console.error('[vipps/status] Ticket issuance failed:', issueErr.message);
        // Do not fail the status response, we can retry issuance later
      }
    }

    // 8. If AUTHORIZED and NOT fully captured, initiate capture (reserve-capture flow)
    //    Skip capture if full amount is already captured (avoids unnecessary API calls).
    //    Uses stable idempotency key so duplicate calls are safe.
    if (localStatus === 'authorized' && !fullyCaptured) {
      const captureIdempotencyKey = `capture-${order.order_reference}`;
      try {
        await capturePayment(vippsRef, totalAmountOre, captureIdempotencyKey);
        console.log(`[vipps/status] Capture initiated for order ${order.order_reference}`);
      } catch (captureErr: any) {
        // Log but do not fail the status response — next poll will retry
        console.error('[vipps/status] Capture attempt failed (will retry on next poll):', captureErr.message);
      }
    }

    // 9. Return status to frontend
    return NextResponse.json({
      status: localStatus,
      orderReference: order.order_reference,
    });

  } catch (error: any) {
    console.error('[vipps/status] Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to check payment status' },
      { status: 500 }
    );
  }
}
