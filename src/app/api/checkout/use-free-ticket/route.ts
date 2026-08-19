import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { issueTicketsForOrder } from '@/lib/tickets/issueTicketsForOrder';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: Request) {
  try {
    // 1. Get auth token from header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];

    // 2. Initialize user Supabase client to preserve auth.uid() context
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // 3. Authenticate user session
    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 4. Parse request body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { eventId, ticketTypeId, customerEmail, customerName, customerPhone } = body;

    // 5. Input validation
    if (!eventId || typeof eventId !== 'string' || !isUuidLike(eventId)) {
      return NextResponse.json({ error: 'eventId is required and must be a valid UUID' }, { status: 400 });
    }
    if (!ticketTypeId || typeof ticketTypeId !== 'string' || !isUuidLike(ticketTypeId)) {
      return NextResponse.json({ error: 'ticketTypeId is required and must be a valid UUID' }, { status: 400 });
    }
    if (!customerEmail || typeof customerEmail !== 'string' || !isValidEmail(customerEmail)) {
      return NextResponse.json({ error: 'customerEmail is required and must be a valid email address' }, { status: 400 });
    }

    // 5b. Validate test event restriction
    const { data: event, error: eventErr } = await userSupabase
      .from('events')
      .select('id, is_test_event')
      .eq('id', eventId)
      .single();

    if (eventErr || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (event.is_test_event) {
      const { data: profile } = await userSupabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (!profile?.is_admin) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }
    }

    // 6. Call use_free_ticket_reward RPC
    const { data: orderId, error: rpcError } = await userSupabase.rpc('use_free_ticket_reward', {
      p_event_id: eventId,
      p_ticket_type_id: ticketTypeId,
      p_customer_email: customerEmail.trim().toLowerCase(),
      p_customer_name: customerName?.trim() || null,
      p_customer_phone: customerPhone?.trim() || null,
    });

    if (rpcError) {
      console.error('[api/checkout/use-free-ticket] RPC use_free_ticket_reward failed:', rpcError);
      return NextResponse.json({ 
        error: rpcError.message || 'Failed to process free ticket reward claim' 
      }, { status: 400 });
    }

    if (!orderId) {
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }

    // 7. Atomic transaction complete, now issue tickets synchronously/automatically
    try {
      const issueResult = await issueTicketsForOrder(orderId);
      console.log('[api/checkout/use-free-ticket] Issued tickets result:', issueResult);
    } catch (ticketError: any) {
      console.error('[api/checkout/use-free-ticket] Ticket issuance failed, but order is paid:', ticketError);
      // We don't fail the request since the DB transaction was successful and order is paid
    }

    return NextResponse.json({
      ok: true,
      orderId,
      paymentStatus: 'paid',
    });

  } catch (err: any) {
    console.error('[api/checkout/use-free-ticket] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
