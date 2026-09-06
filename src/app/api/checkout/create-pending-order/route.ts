import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ── Server-only Supabase client (service role) ──────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// ── Constants ───────────────────────────────────────────────────────
const MAX_QUANTITY = 10;
/** Must stay in sync with the TTL constant inside reserve_pending_order RPC. */
import { PENDING_ORDER_TTL_MINUTES } from '@/lib/checkout';

// ── Helpers ─────────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function parseUtcDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  let sanitized = dateStr;
  if (!/[Zz]|[+-]\d{2}(:\d{2})?$/.test(sanitized)) {
    sanitized += 'Z';
  }
  return new Date(sanitized);
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

    const { eventId, ticketTypeId, quantity, customerEmail, customerName, customerPhone, paymentMethodType } = body;

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

    // ── Validate payment method ──
    const validMethods = ['WALLET', 'CARD'];
    const finalMethod = (paymentMethodType && validMethods.includes(paymentMethodType)) ? paymentMethodType : 'WALLET';

    // ── Optional auth: resolve profile_id if logged in ──
    let profileId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        profileId = user.id;
      }
      // If token is invalid, silently treat as guest — no error
    }

    // ── Fetch ticket type and event ──
    const [ticketTypeRes, eventRes] = await Promise.all([
      supabase.from('event_ticket_types').select('*').eq('id', ticketTypeId).single(),
      supabase.from('events').select('id, is_test_event').eq('id', eventId).single(),
    ]);

    const ticketType = ticketTypeRes.data;
    const event = eventRes.data;

    if (ticketTypeRes.error || !ticketType || eventRes.error || !event) {
      return NextResponse.json({ error: 'Ticket type or event not found' }, { status: 404 });
    }

    // ── If test event: strictly require authenticated admin ──
    if (event.is_test_event) {
      if (!profileId) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }
      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', profileId)
        .single();

      if (!adminProfile?.is_admin) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }
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
    const now = Date.now();

    if (ticketType.sale_starts_at) {
      const saleStart = parseUtcDate(ticketType.sale_starts_at);
      if (saleStart) {
        if (now < saleStart.getTime()) {
          const formattedStart = saleStart.toLocaleString('en-GB', {
            timeZone: 'Europe/Oslo',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).replace(',', '');
          return NextResponse.json({
            error: `Ticket sales have not started yet. Sales open at ${formattedStart}`,
          }, { status: 409 });
        }
      }
    }

    if (ticketType.sale_ends_at) {
      const saleEnd = parseUtcDate(ticketType.sale_ends_at);
      if (saleEnd && now > saleEnd.getTime()) {
        return NextResponse.json({ error: 'Ticket sales have ended for this ticket type' }, { status: 409 });
      }
    }

    // ── Supporter validation ──
    if (ticketType.is_supporter && (!customerName || customerName.trim().length < 2)) {
      return NextResponse.json({ error: 'A name is required for Supporter tickets.' }, { status: 400 });
    }

    // ── Check price ──
    const unitPrice: number = ticketType.price_nok ?? 0;
    if (unitPrice < 0) {
      return NextResponse.json({ error: 'Invalid ticket price' }, { status: 500 });
    }

    // ── Build order parameters ──
    const orderReference = generateOrderReference();
    const claimToken = crypto.randomUUID();
    const totalAmountNok = unitPrice * quantity;
    const pointsPerTicket = ticketType.is_supporter ? 200 : 150;
    const ravePointsEarned = quantity * pointsPerTicket;

    // ── Atomically reserve stock and create order ──
    // The RPC handles: expired reservation cleanup, capacity check, insert, reserved_quantity increment.
    const { data: rpcResult, error: rpcError } = await supabase.rpc('reserve_pending_order', {
      p_ticket_type_id:     ticketTypeId,
      p_event_id:           eventId,
      p_quantity:           quantity,
      p_customer_email:     customerEmail.trim().toLowerCase(),
      p_customer_name:      customerName?.trim() || null,
      p_customer_phone:     customerPhone?.trim() || null,
      p_total_amount_nok:   totalAmountNok,
      p_order_reference:    orderReference,
      p_claim_token:        claimToken,
      p_profile_id:         profileId,
      p_payment_method:     finalMethod,
      p_rave_points_earned: ravePointsEarned,
      p_ticket_type_name:   ticketType.name,
      p_unit_price_nok:     unitPrice,
      p_is_supporter:       !!ticketType.is_supporter,
    });

    if (rpcError) {
      console.error('[create-pending-order] RPC error:', rpcError);
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }

    if (!rpcResult?.success) {
      const code = rpcResult?.error_code;
      if (code === 'CAPACITY_REACHED') {
        const available = rpcResult?.available ?? 0;
        return NextResponse.json({
          error: `Not enough tickets available. ${available} remaining, ${quantity} requested`,
        }, { status: 409 });
      }
      if (code === 'TICKET_TYPE_NOT_FOUND') {
        return NextResponse.json({ error: 'Ticket type not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }

    // ── Success ──
    const response: Record<string, any> = {
      ok: true,
      orderId: rpcResult.order_id,
      orderReference: rpcResult.order_reference,
      totalAmountNok: rpcResult.total_amount_nok,
      currency: 'NOK',
      ravePointsEarned: rpcResult.rave_points_earned,
      paymentStatus: 'pending',
    };

    // Return claimToken only for guest orders — logged-in orders use profile_id as ownership proof.
    if (!profileId) {
      response.claimToken = rpcResult.claim_token;
    }

    return NextResponse.json(response);

  } catch (err) {
    console.error('[create-pending-order] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
