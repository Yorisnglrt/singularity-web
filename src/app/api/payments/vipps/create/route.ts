import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPayment } from '@/lib/vipps';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderReference, orderId } = body;

    if (!orderReference && !orderId) {
      return NextResponse.json({ error: 'Missing orderReference or orderId' }, { status: 400 });
    }

    // 1. Load the existing pending order from ticket_orders
    let query = supabaseAdmin
      .from('ticket_orders')
      .select('id, order_reference, total_amount_nok, currency, payment_status, vipps_reference, customer_name');

    if (orderReference) {
      query = query.eq('order_reference', orderReference);
    } else {
      query = query.eq('id', orderId);
    }

    const { data: order, error: orderError } = await query.single();

    if (orderError || !order) {
      console.error('[vipps/create] Order not found:', orderError);
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // 2. Validate the order is still pending
    if (order.payment_status !== 'pending') {
      return NextResponse.json(
        { error: `Order is not pending (current status: ${order.payment_status})` },
        { status: 409 }
      );
    }

    // 3. Validate amount
    if (!order.total_amount_nok || order.total_amount_nok <= 0) {
      return NextResponse.json({ error: 'Order has no valid amount' }, { status: 400 });
    }

    // 4. If Vipps payment was already created for this order, reuse the reference
    if (order.vipps_reference) {
      return NextResponse.json(
        { error: 'Vipps payment already initiated for this order' },
        { status: 409 }
      );
    }

    // 5. Generate Vipps reference and idempotency key
    const vippsReference = order.order_reference;
    const idempotencyKey = crypto.randomUUID();

    // 6. Convert NOK to øre for Vipps (total_amount_nok is in whole NOK)
    const amountOre = order.total_amount_nok * 100;

    // 7. Build return URL
    const returnUrl = `${BASE_URL}/tickets/complete?reference=${encodeURIComponent(vippsReference)}`;

    // 8. Create Vipps ePayment
    const redirectUrl = await createPayment(
      vippsReference,
      amountOre,
      returnUrl,
      idempotencyKey,
    );

    // 9. Update ticket_orders with Vipps metadata
    const { error: updateError } = await supabaseAdmin
      .from('ticket_orders')
      .update({
        vipps_reference: vippsReference,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    if (updateError) {
      console.error('[vipps/create] Failed to update order with Vipps reference:', updateError);
      // Payment was already created at Vipps, so we still return the redirect
    }

    return NextResponse.json({ redirectUrl, reference: vippsReference });

  } catch (error: any) {
    console.error('[vipps/create] Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to create Vipps payment' },
      { status: 500 }
    );
  }
}
