import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { createPayment } from '@/lib/vipps';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

function generateOrderReference(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `SG-GST-${ts}-${rand}`;
}

/**
 * POST /api/guest/reserve
 * Public endpoint to start Vipps checkout for a paid guest code allocation.
 * Atomically creates a pending reservation order and initializes Vipps ePayment.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { code, email, name, paymentMethodType } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Guest code is required' }, { status: 400 });
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
    }

    const normalizedCode = code.trim().toUpperCase();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = typeof name === 'string' ? name.trim() : '';

    const orderReference = generateOrderReference();
    const claimToken = crypto.randomUUID();
    const methodType = (paymentMethodType === 'CARD' || paymentMethodType === 'WALLET') ? paymentMethodType : 'WALLET';

    // 1. Execute atomic PostgreSQL reservation RPC
    const { data: reserveResult, error: rpcError } = await supabaseAdmin.rpc('reserve_guest_ticket_order', {
      p_code: normalizedCode,
      p_email: normalizedEmail,
      p_name: normalizedName || null,
      p_payment_method: methodType,
      p_order_reference: orderReference,
      p_claim_token: claimToken,
    });

    if (rpcError) {
      console.error('[guest reserve RPC error]', rpcError);
      return NextResponse.json({ error: rpcError.message || 'Database error reserving slot' }, { status: 500 });
    }

    if (!reserveResult || reserveResult.success === false) {
      if (reserveResult?.error_code === 'ALREADY_CLAIMED') {
        return NextResponse.json({
          success: false,
          alreadyClaimed: true,
          message: 'You have already claimed a guest ticket with this code.',
          ticketCode: reserveResult.ticket_code,
          shortCode: reserveResult.short_code,
          accessToken: reserveResult.access_token,
          eventTitle: reserveResult.event_title,
          djName: reserveResult.dj_name,
        }, { status: 200 });
      }

      return NextResponse.json({
        error: reserveResult?.message || 'Unable to reserve guest ticket',
        errorCode: reserveResult?.error_code,
      }, { status: 400 });
    }

    const effectiveOrderRef = reserveResult.orderReference || orderReference;
    const effectiveOrderId = reserveResult.orderId;

    // 2. If resumed existing reservation with a valid payment URL, reuse it
    if (reserveResult.resumed && reserveResult.paymentUrl) {
      return NextResponse.json({
        success: true,
        resumed: true,
        redirectUrl: reserveResult.paymentUrl,
        orderReference: effectiveOrderRef,
      });
    }

    // 3. Initiate Vipps payment
    const amountOre = reserveResult.priceOre || (reserveResult.totalAmountNok * 100);
    const returnUrl = `${BASE_URL}/tickets/complete?reference=${encodeURIComponent(effectiveOrderRef)}`;
    const idempotencyKey = crypto.randomUUID();

    const redirectUrl = await createPayment(
      effectiveOrderRef,
      amountOre,
      returnUrl,
      idempotencyKey,
      methodType as 'WALLET' | 'CARD'
    );

    // 4. Update order with Vipps reference and payment URL
    await supabaseAdmin
      .from('ticket_orders')
      .update({
        vipps_reference: effectiveOrderRef,
        payment_url: redirectUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', effectiveOrderId);

    return NextResponse.json({
      success: true,
      redirectUrl,
      orderReference: effectiveOrderRef,
      totalAmountNok: reserveResult.totalAmountNok,
    });
  } catch (err: any) {
    console.error('[guest reserve unexpected error]', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
