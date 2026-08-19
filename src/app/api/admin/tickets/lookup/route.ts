import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const TICKET_SELECT = `
  id,
  ticket_code,
  short_code,
  qr_payload,
  status,
  used_at,
  holder_name,
  holder_email,
  ticket_type,
  event_id,
  order_id,
  events (
    title,
    date,
    venue
  ),
  event_ticket_types (
    name
  ),
  ticket_orders (
    order_reference,
    customer_email
  )
`;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query');
    const mode = searchParams.get('mode'); // 'search' for email search
    const eventId = searchParams.get('eventId');

    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }

    // Admin Auth Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'No auth header' }, { status: 401 });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Email Search Mode ──
    if (mode === 'search') {
      if (!eventId) {
        return NextResponse.json({ error: 'eventId required for email search' }, { status: 400 });
      }

      const searchTerm = `%${query.trim()}%`;

      // 1. Search by holder_email on the ticket
      const { data: byHolder, error: holderErr } = await supabaseAdmin
        .from('tickets')
        .select(TICKET_SELECT)
        .eq('event_id', eventId)
        .ilike('holder_email', searchTerm);

      if (holderErr) {
        console.error('[Ticket Search] holder_email error:', holderErr);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      }

      // 2. Search by ticket_orders.customer_email (for paid tickets)
      const { data: matchingOrders } = await supabaseAdmin
        .from('ticket_orders')
        .select('id')
        .ilike('customer_email', searchTerm);

      let byOrder: any[] = [];
      if (matchingOrders && matchingOrders.length > 0) {
        const orderIds = matchingOrders.map((o: any) => o.id);
        const { data: orderTickets, error: orderErr } = await supabaseAdmin
          .from('tickets')
          .select(TICKET_SELECT)
          .eq('event_id', eventId)
          .in('order_id', orderIds);

        if (orderErr) {
          console.error('[Ticket Search] order email error:', orderErr);
        } else {
          byOrder = orderTickets || [];
        }
      }

      // 3. Merge and deduplicate by ticket id
      const allResults = [...(byHolder || [])];
      const existingIds = new Set(allResults.map((t: any) => t.id));
      for (const t of byOrder) {
        if (!existingIds.has(t.id)) {
          allResults.push(t);
          existingIds.add(t.id);
        }
      }

      return NextResponse.json(allResults);
    }

    // ── Direct Ticket Lookup (scan or manual code entry) ──
    const trimmed = query.trim();
    // Normalize for short_code matching: uppercase, strip SG- prefix
    const shortCodeQuery = trimmed.toUpperCase().replace(/^SG-/, '');

    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('tickets')
      .select(TICKET_SELECT)
      .or(`short_code.eq.${shortCodeQuery},qr_payload.eq.${trimmed},ticket_code.eq.${trimmed}`)
      .maybeSingle();

    if (ticketError) {
      console.error('[Ticket Lookup] DB Error:', ticketError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // If event filter is active and ticket belongs to a different event, flag it
    if (eventId && ticket.event_id !== eventId) {
      return NextResponse.json({
        ...ticket,
        wrongEvent: true,
      });
    }

    return NextResponse.json(ticket);
  } catch (err) {
    console.error('[Ticket Lookup] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
