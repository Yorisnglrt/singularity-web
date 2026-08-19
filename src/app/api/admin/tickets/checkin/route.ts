import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function POST(req: Request) {
  try {
    const { ticketId } = await req.json();

    if (!ticketId) {
      return NextResponse.json({ error: 'Missing ticketId' }, { status: 400 });
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

    // Atomic Check-in: only update if status is currently 'valid'
    // This prevents two staff devices from both getting a success result.
    const now = new Date().toISOString();
    const { data: ticket, error: checkError } = await supabaseAdmin
      .from('tickets')
      .update({
        status: 'used',
        used_at: now,
        updated_at: now
      })
      .eq('id', ticketId)
      .eq('status', 'valid')
      .select()
      .maybeSingle();

    if (checkError) {
      console.error('[Ticket Check-in] Update Error:', checkError);
      return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 });
    }

    // If no rows were updated, the ticket was not in 'valid' state
    if (!ticket) {
      // Fetch current state to return meaningful info
      const { data: current } = await supabaseAdmin
        .from('tickets')
        .select('id, status, used_at')
        .eq('id', ticketId)
        .maybeSingle();

      if (!current) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }

      return NextResponse.json({
        success: false,
        status: 'already_used',
        used_at: current.used_at,
        message: 'Ticket has already been checked in'
      }, { status: 409 });
    }

    return NextResponse.json({ success: true, ticket });
  } catch (err) {
    console.error('[Ticket Check-in] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
