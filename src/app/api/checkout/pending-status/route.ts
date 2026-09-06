import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cancelPayment } from '@/lib/vipps';
import { PENDING_ORDER_TTL_MINUTES } from '@/app/api/checkout/create-pending-order/route';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const TTL_MS = PENDING_ORDER_TTL_MINUTES * 60 * 1000;

/** Shared order fields selected in all lookup paths. */
const ORDER_SELECT = `
  id,
  order_reference,
  total_amount_nok,
  payment_status,
  payment_url,
  created_at,
  vipps_reference,
  reservation_released,
  ticket_order_items!inner (
    event_id,
    ticket_type_name,
    quantity
  )
`;

/**
 * Lazily expire a pending order that has exceeded the TTL:
 * - Marks it cancelled in the DB.
 * - Releases the reserved stock (idempotent).
 * - Non-blocking: attempts to cancel the Vipps payment session (defense-in-depth).
 */
async function expireOrder(order: { id: string; vipps_reference: string | null; order_reference: string }) {
  await supabase
    .from('ticket_orders')
    .update({ payment_status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', order.id);

  await supabase.rpc('release_order_reservation', { p_order_id: order.id });

  // Non-blocking: attempt to cancel the Vipps session.
  // If Vipps already authorized/captured, that's OK — the webhook backstop handles it.
  const vippsRef = order.vipps_reference || order.order_reference;
  cancelPayment(vippsRef).catch(err => {
    console.warn('[pending-status] Vipps cancel attempt failed for', order.order_reference, err?.message);
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');
    const orderReference = searchParams.get('orderReference');
    const claimToken = searchParams.get('claimToken');

    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
    }

    const authHeader = req.headers.get('Authorization');
    const isAuthenticated = authHeader && authHeader.startsWith('Bearer ');

    // ── Guest path: lookup by orderReference + claimToken ──────────────
    if (!isAuthenticated) {
      if (!orderReference || !claimToken) {
        // No auth and no guest params — no pending order for this visitor
        return NextResponse.json({ hasPending: false });
      }

      const { data: orders, error: ordersError } = await supabase
        .from('ticket_orders')
        .select(ORDER_SELECT)
        .eq('order_reference', orderReference)
        .eq('claim_token', claimToken)
        .eq('payment_status', 'pending')
        .eq('ticket_order_items.event_id', eventId)
        .limit(1);

      if (ordersError) {
        console.error('[pending-status] Guest DB Error:', ordersError);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      }

      if (!orders || orders.length === 0) {
        return NextResponse.json({ hasPending: false });
      }

      const order = orders[0];

      // Lazy expiry check
      if (Date.now() - new Date(order.created_at).getTime() > TTL_MS) {
        await expireOrder(order);
        return NextResponse.json({ hasPending: false });
      }

      const item = (order.ticket_order_items as any[])[0];
      return NextResponse.json({
        hasPending: true,
        order: {
          orderReference: order.order_reference,
          totalAmountNok: order.total_amount_nok,
          ticketTypeName: item.ticket_type_name,
          quantity: item.quantity,
          paymentUrl: order.payment_url,
          createdAt: order.created_at,
        }
      });
    }

    // ── Authenticated path: lookup by profile_id ──────────────────────
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ hasPending: false });
    }

    const { data: orders, error: ordersError } = await supabase
      .from('ticket_orders')
      .select(ORDER_SELECT)
      .eq('profile_id', user.id)
      .eq('payment_status', 'pending')
      .eq('ticket_order_items.event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (ordersError) {
      console.error('[pending-status] DB Error:', ordersError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ hasPending: false });
    }

    const order = orders[0];

    // Lazy expiry check
    if (Date.now() - new Date(order.created_at).getTime() > TTL_MS) {
      await expireOrder(order);
      return NextResponse.json({ hasPending: false });
    }

    const item = (order.ticket_order_items as any[])[0];
    return NextResponse.json({
      hasPending: true,
      order: {
        orderReference: order.order_reference,
        totalAmountNok: order.total_amount_nok,
        ticketTypeName: item.ticket_type_name,
        quantity: item.quantity,
        paymentUrl: order.payment_url,
        createdAt: order.created_at,
      }
    });

  } catch (err) {
    console.error('[pending-status] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
