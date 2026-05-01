import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

/**
 * GET /api/tickets/guest-view?ticketCode=...&accessToken=...
 * Fetches ticket details for unauthenticated users using a secure token.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ticketCode = searchParams.get('ticketCode');
    const accessToken = searchParams.get('accessToken');

    if (!ticketCode || !accessToken) {
      return NextResponse.json({ error: 'Missing ticketCode or accessToken' }, { status: 400 });
    }

    const { data: ticket, error } = await supabaseAdmin
      .from('tickets')
      .select(`
        *,
        events (
          title,
          date,
          venue
        ),
        event_ticket_types (
          name
        ),
        ticket_orders (
          order_reference
        )
      `)
      .eq('ticket_code', ticketCode)
      .eq('access_token', accessToken)
      .single();

    if (error || !ticket) {
      console.error('[guest-view] Ticket not found or token invalid:', error);
      return NextResponse.json({ error: 'Ticket not found or access denied' }, { status: 404 });
    }

    return NextResponse.json(ticket);
  } catch (err: any) {
    console.error('[guest-view] Error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
