import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ── Server-only Supabase client (service role) ──────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// ── Constants ───────────────────────────────────────────────────────
const RAVE_POINTS_PER_TICKET = 150;
const MAX_QUANTITY = 10;

// ── Helpers ─────────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function generateOrderReference(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `SG-${ts}-${rand}`;
}

// ── POST handler ────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    // ── Parse body ──
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { eventId, ticketTypeId, quantity, customerEmail, customerName, customerPhone } = body;

    // ── Input validation ──
    if (!eventId || typeof eventId !== 'string' || !isUuidLike(eventId)) {
      return NextResponse.json({ error: 'eventId is required and must be a valid UUID' }, { status: 400 });
    }
    if (!ticketTypeId || typeof ticketTypeId !== 'string' || !isUuidLike(ticketTypeId)) {
      return NextResponse.json({ error: 'ticketTypeId is required and must be a valid UUID' }, { status: 400 });
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return NextResponse.json({ error: `quantity must be an integer between 1 and ${MAX_QUANTITY}` }, { status: 400 });
    }
    if (!customerEmail || typeof customerEmail !== 'string' || !isValidEmail(customerEmail)) {
      return NextResponse.json({ error: 'customerEmail is required and must be a valid email address' }, { status: 400 });
    }

    // ── Optional auth: resolve profile_id if logged in ──
    let profileId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        profileId = user.id;
      }
      // If token is invalid, we silently treat as guest — no error
    }

    // ── Fetch ticket type ──
    const { data: ticketType, error: ttError } = await supabase
      .from('event_ticket_types')
      .select('*')
      .eq('id', ticketTypeId)
      .single();

    if (ttError || !ticketType) {
      return NextResponse.json({ error: 'Ticket type not found' }, { status: 404 });
    }

    // ── Validate ticket type belongs to the event ──
    if (ticketType.event_id !== eventId) {
      return NextResponse.json({ error: 'Ticket type does not belong to this event' }, { status: 400 });
    }

    // ── Check active ──
    if (!ticketType.is_active) {
      return NextResponse.json({ error: 'This ticket type is not currently active' }, { status: 409 });
    }

    // ── Check sale window ──
    const now = new Date();

    if (ticketType.sale_starts_at) {
      const saleStart = new Date(ticketType.sale_starts_at);
      if (now < saleStart) {
        return NextResponse.json({
          error: `Ticket sales have not started yet. Sales open at ${saleStart.toISOString()}`,
        }, { status: 409 });
      }
    }

    if (ticketType.sale_ends_at) {
      const saleEnd = new Date(ticketType.sale_ends_at);
      if (now > saleEnd) {
        return NextResponse.json({ error: 'Ticket sales have ended for this ticket type' }, { status: 409 });
      }
    }

    // ── Check availability ──
    if (ticketType.total_quantity != null) {
      const available = ticketType.total_quantity - (ticketType.sold_quantity || 0);
      if (available < quantity) {
        return NextResponse.json({
          error: `Not enough tickets available. ${available} remaining, ${quantity} requested`,
        }, { status: 409 });
      }
    }

    // ── Check price ──
    const unitPrice: number = ticketType.price_nok ?? 0;
    if (unitPrice < 0) {
      return NextResponse.json({ error: 'Invalid ticket price' }, { status: 500 });
    }

    // ── Build order ──
    const orderReference = generateOrderReference();
    const claimToken = crypto.randomUUID();
    const totalAmountNok = unitPrice * quantity;
    const ravePointsEarned = quantity * RAVE_POINTS_PER_TICKET;

    const orderRow = {
      order_reference: orderReference,
      customer_email: customerEmail.trim().toLowerCase(),
      customer_name: customerName?.trim() || null,
      customer_phone: customerPhone?.trim() || null,
      total_amount_nok: totalAmountNok,
      currency: 'NOK',
      sales_channel: 'online',
      payment_provider: 'vipps',
      payment_status: 'pending',
      profile_id: profileId,
      rave_points_earned: ravePointsEarned,
      points_awarded: false,
      claim_token: claimToken,
      metadata: {},
    };

    // ── Insert order ──
    const { data: order, error: orderError } = await supabase
      .from('ticket_orders')
      .insert(orderRow)
      .select('id')
      .single();

    if (orderError || !order) {
      console.error('[create-pending-order] Order insert failed:', orderError);
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }

    // ── Insert order item ──
    const itemRow = {
      order_id: order.id,
      event_id: eventId,
      ticket_type_id: ticketTypeId,
      ticket_type_name: ticketType.name,
      quantity,
      unit_price_nok: unitPrice,
      line_total_nok: totalAmountNok,
    };

    const { error: itemError } = await supabase
      .from('ticket_order_items')
      .insert(itemRow);

    if (itemError) {
      console.error('[create-pending-order] Item insert failed, cleaning up order:', itemError);
      // Cleanup: delete the orphaned order
      await supabase.from('ticket_orders').delete().eq('id', order.id);
      return NextResponse.json({ error: 'Failed to create order items' }, { status: 500 });
    }

    // ── Success ──
    return NextResponse.json({
      ok: true,
      orderId: order.id,
      orderReference,
      totalAmountNok,
      currency: 'NOK',
      ravePointsEarned,
      paymentStatus: 'pending',
    });

  } catch (err) {
    console.error('[create-pending-order] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
