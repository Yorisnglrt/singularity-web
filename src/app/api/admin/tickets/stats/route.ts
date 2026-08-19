import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

/**
 * GET /api/admin/tickets/stats?eventId=...
 * Returns ticket counts and the ticket list for a specific event.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
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

    // Fetch all tickets for this event
    const { data: tickets, error: ticketsError } = await supabaseAdmin
      .from('tickets')
      .select(`
        id,
        ticket_code,
        short_code,
        status,
        used_at,
        holder_name,
        holder_email,
        ticket_type,
        event_ticket_types (
          name
        )
      `)
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    if (ticketsError) {
      console.error('[Ticket Stats] DB Error:', ticketsError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const allTickets = tickets || [];
    const total = allTickets.length;
    const checkedIn = allTickets.filter((t: any) => t.status === 'used').length;
    const remaining = total - checkedIn;

    return NextResponse.json({
      total,
      checkedIn,
      remaining,
      tickets: allTickets,
    });
  } catch (err) {
    console.error('[Ticket Stats] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
