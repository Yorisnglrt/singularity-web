import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { sendGuestTicketEmail } from '@/lib/email/sendTicketEmail';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

/**
 * POST /api/admin/guest-tickets
 * Create free guest tickets for an event.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'No auth header' }, { status: 401 });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { event_id, guest_name, guest_email, quantity, note } = body;

    if (!event_id || !guest_name || !guest_email || !quantity) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1 || qty > 20) {
      return NextResponse.json({ error: 'Quantity must be between 1 and 20' }, { status: 400 });
    }

    // Generate unique tickets
    const ticketInserts = [];
    for (let i = 0; i < qty; i++) {
      // GST- prefix + 8 random hex chars
      const ticketCode = `GST-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const nonce = crypto.randomBytes(3).toString('hex').toUpperCase();
      // Payload format: SG:GST:<event_id>:<ticket_code>:<nonce>
      const qrPayload = `SG:GST:${event_id}:${ticketCode}:${nonce}`;
      
      ticketInserts.push({
        event_id,
        holder_name: guest_name,
        holder_email: guest_email,
        ticket_code: ticketCode,
        qr_payload: qrPayload,
        ticket_type: 'guest',
        status: 'valid',
        created_by_admin: user.id,
        note: note || null,
        access_token: crypto.randomUUID()
      });
    }

    const { data: createdTickets, error: insertError } = await supabaseAdmin
      .from('tickets')
      .insert(ticketInserts)
      .select();

    if (insertError) {
      console.error('[guest-tickets] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create guest tickets' }, { status: 500 });
    }

    // Trigger email (non-blocking)
    let emailSent = false;
    try {
      await sendGuestTicketEmail(createdTickets.map(t => t.id));
      emailSent = true;
    } catch (emailErr: any) {
      console.error('[guest-tickets] Email error:', emailErr.message);
    }

    return NextResponse.json({ 
      success: true, 
      count: createdTickets.length,
      emailSent 
    });

  } catch (err: any) {
    console.error('[guest-tickets] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/admin/guest-tickets?event_id=...
 * Fetch guest list for a specific event.
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'No auth header' }, { status: 401 });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const event_id = searchParams.get('event_id');

    if (!event_id) {
      return NextResponse.json({ error: 'Missing event_id' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('tickets')
      .select('*')
      .eq('event_id', event_id)
      .eq('ticket_type', 'guest')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[guest-tickets] Fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch guest list' }, { status: 500 });
    }

    return NextResponse.json(data || []);

  } catch (err: any) {
    console.error('[guest-tickets] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
