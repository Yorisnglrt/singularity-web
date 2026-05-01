import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { capturePayment } from '@/lib/vipps';
import { issueTicketsForOrder } from '@/lib/tickets/issueTicketsForOrder';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * Vipps Webhook Authentication (HMAC-SHA256)
 * Based on Vipps Webhooks API documentation.
 */
function verifyVippsSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
  path: string
): boolean {
  try {
    const msDate = headers.get('x-ms-date');
    const msContentSha256 = headers.get('x-ms-content-sha256');
    const authHeader = headers.get('Authorization');
    const host = headers.get('host');

    if (!msDate || !msContentSha256 || !authHeader || !host) return false;

    // 1. Verify Body Hash
    const computedContentHash = crypto
      .createHash('sha256')
      .update(rawBody)
      .digest('base64');
    
    if (computedContentHash !== msContentSha256) {
      console.error('[vipps/webhook] Content hash mismatch');
      return false;
    }

    // 2. Extract Signature from Authorization header
    // Format: HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=...
    const signatureMatch = authHeader.match(/Signature=([^&]+)/);
    if (!signatureMatch) return false;
    const providedSignature = signatureMatch[1];

    // 3. Construct String to Sign
    // Format: <HTTP_METHOD>\n<PATH>\n<SIGNED_HEADERS_VALUES>
    const stringToSign = `POST\n${path}\n${msDate};${host};${msContentSha256}`;

    // 4. Compute HMAC
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(stringToSign)
      .digest('base64');

    return computedSignature === providedSignature;
  } catch (err) {
    console.error('[vipps/webhook] Signature verification error:', err);
    return false;
  }
}

/**
 * Map Vipps webhook event name to local ticket_orders.payment_status.
 */
function mapVippsEventToLocal(eventName: string): string | null {
  switch (eventName) {
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
    case 'REFUNDED':
      return 'refunded';
    case 'PARTIALLY_REFUNDED':
      return 'partially_refunded';
    default:
      return null;
  }
}

export async function POST(request: Request) {
  try {
    const webhookSecret = process.env.VIPPS_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[vipps/webhook] Configuration error: Missing VIPPS_WEBHOOK_SECRET');
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const rawBody = await request.text();
    const url = new URL(request.url);

    if (!verifyVippsSignature(rawBody, request.headers, webhookSecret, url.pathname)) {
      console.warn('[vipps/webhook] Unauthorized/Invalid HMAC signature');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      console.error('[vipps/webhook] Failed to parse request body');
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    console.log('[vipps/webhook] Received payload:', JSON.stringify(body, null, 2));

    // Vipps ePayment webhook payload shape:
    // {
    //   "msn": "...",
    //   "reference": "SG-...",
    //   "pspReference": "...",
    //   "name": "AUTHORIZED" | "CHARGED" | "CANCELLED" | ...,
    //   "amount": { "value": 15000, "currency": "NOK" },
    //   "timestamp": "..."
    // }
    const { reference, pspReference, name: eventName } = body;

    if (!reference) {
      console.error('[vipps/webhook] Missing reference in payload');
      return NextResponse.json({ error: 'Missing reference' }, { status: 400 });
    }

    if (!eventName) {
      console.error('[vipps/webhook] Missing event name in payload');
      return NextResponse.json({ error: 'Missing event name' }, { status: 400 });
    }

    // 1. Find the order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('ticket_orders')
      .select('id, order_reference, total_amount_nok, payment_status, vipps_reference')
      .or(`order_reference.eq.${reference},vipps_reference.eq.${reference}`)
      .single();

    if (orderError || !order) {
      console.error('[vipps/webhook] Order not found for reference:', reference, orderError);
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // 2. Map event to local status
    const localStatus = mapVippsEventToLocal(eventName);

    if (!localStatus) {
      console.log('[vipps/webhook] Unhandled event name:', eventName);
      // Return 200 to Vipps so it doesn't retry, but log for debugging
      return NextResponse.json({ ok: true, ignored: true });
    }

    // 3. Skip if order is already in a terminal paid/refunded state
    //    (avoid downgrading from paid → authorized on duplicate webhooks)
    const terminalStates = ['paid', 'refunded', 'partially_refunded'];
    if (terminalStates.includes(order.payment_status) && !terminalStates.includes(localStatus)) {
      console.log(`[vipps/webhook] Skipping: order ${order.id} already ${order.payment_status}, ignoring ${localStatus}`);
      return NextResponse.json({ ok: true, skipped: true });
    }

    // 4. Build update
    const updatePayload: Record<string, any> = {
      payment_status: localStatus,
      updated_at: new Date().toISOString(),
    };

    if (pspReference) {
      updatePayload.vipps_payment_id = pspReference;
    }

    if (localStatus === 'paid') {
      updatePayload.paid_at = new Date().toISOString();
    }

    if (localStatus === 'cancelled') {
      updatePayload.cancelled_at = new Date().toISOString();
    }

    if (localStatus === 'refunded' || localStatus === 'partially_refunded') {
      updatePayload.refunded_at = new Date().toISOString();
    }

    // 5. Update ticket_orders
    const { error: updateError } = await supabaseAdmin
      .from('ticket_orders')
      .update(updatePayload)
      .eq('id', order.id);

    if (updateError) {
      console.error('[vipps/webhook] Failed to update order:', updateError);
      return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
    }

    console.log(`[vipps/webhook] Order ${order.id} updated to ${localStatus}`);

    // If AUTHORIZED, initiate capture (reserve-capture flow)
    // Uses same stable idempotency key as status route for safe deduplication
    if (localStatus === 'authorized' && order.total_amount_nok) {
      const amountOre = order.total_amount_nok * 100;
      const vippsRef = order.vipps_reference || order.order_reference;
      const captureIdempotencyKey = `capture-${order.order_reference}`;
      try {
        await capturePayment(vippsRef, amountOre, captureIdempotencyKey);
        console.log(`[vipps/webhook] Capture initiated for order ${order.order_reference}`);
      } catch (captureErr: any) {
        // Log but do not fail the webhook response — status polling will retry
        console.error('[vipps/webhook] Capture attempt failed:', captureErr.message);
      }
    }

    // 3. If PAID, issue tickets (idempotent)
    if (localStatus === 'paid') {
      try {
        await issueTicketsForOrder(order.id);
      } catch (issueErr: any) {
        console.error('[vipps/webhook] Ticket issuance failed:', issueErr.message);
      }
    }

    return NextResponse.json({ ok: true });

  } catch (error: any) {
    // Do NOT silently swallow errors — log them for debugging
    console.error('[vipps/webhook] Unexpected error:', error.message, error.stack);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
