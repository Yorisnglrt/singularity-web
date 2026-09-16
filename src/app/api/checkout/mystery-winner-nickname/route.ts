import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// Basic cleanup: trim, collapse whitespace, cap length. The DB CHECK
// constraint (1–24 chars after btrim) is the real backstop; this just
// avoids obviously bad input reaching it with a clean error message.
function sanitizeNickname(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 1 || cleaned.length > 24) return null;
  return cleaned;
}

export async function POST(req: Request) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { orderId, claimToken, nickname } = body;

    if (!orderId || typeof orderId !== 'string' || !isUuidLike(orderId)) {
      return NextResponse.json({ error: 'orderId is required and must be a valid UUID' }, { status: 400 });
    }
    if (!nickname || typeof nickname !== 'string') {
      return NextResponse.json({ error: 'nickname is required' }, { status: 400 });
    }
    const cleanNickname = sanitizeNickname(nickname);
    if (!cleanNickname) {
      return NextResponse.json({ error: 'Nickname must be between 1 and 24 characters' }, { status: 400 });
    }

    // ── Fetch the order ──
    const { data: order, error: orderError } = await supabase
      .from('ticket_orders')
      .select('id, payment_status, profile_id, claim_token, metadata')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // ── Ownership check: logged-in orders via JWT, guest orders via claimToken ──
    const authHeader = req.headers.get('Authorization');
    let ownershipVerified = false;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length);
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user && order.profile_id === user.id) {
        ownershipVerified = true;
      }
    }
    if (!ownershipVerified && claimToken && order.claim_token === claimToken) {
      ownershipVerified = true;
    }

    if (!ownershipVerified) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Must actually be a mystery win, and must be paid ──
    // This is what stops someone claiming a nickname for a mixed order
    // (quantity>1) they won but never finished paying for.
    if (order.metadata?.mystery_ticket_won !== true) {
      return NextResponse.json({ error: 'This order did not win a mystery ticket' }, { status: 400 });
    }
    if (order.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Order is not paid yet' }, { status: 409 });
    }

    // ── Fetch event_id / ticket_type_id from the order's free-unit item ──
    const { data: item, error: itemError } = await supabase
      .from('ticket_order_items')
      .select('event_id, ticket_type_id')
      .eq('order_id', orderId)
      .eq('unit_price_nok', 0)
      .limit(1)
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: 'Could not resolve the winning ticket type' }, { status: 500 });
    }

    // ── Insert (unique on order_id — a second submission for the same
    // order will fail cleanly instead of overwriting silently) ──
    const { error: insertError } = await supabase
      .from('mystery_ticket_winners')
      .insert({
        event_id: item.event_id,
        ticket_type_id: item.ticket_type_id,
        order_id: orderId,
        nickname: cleanNickname,
      });

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'A nickname has already been submitted for this win' }, { status: 409 });
      }
      console.error('[mystery-winner-nickname] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save nickname' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, nickname: cleanNickname });

  } catch (err) {
    console.error('[mystery-winner-nickname] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
