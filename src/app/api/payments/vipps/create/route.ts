import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPayment } from '@/lib/vipps';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

export async function POST(request: Request) {
  try {
    const { eventId, customerName } = await request.json();

    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
    }

    // 1. Fetch event from DB — never trust frontend for price/title
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('id, title, ticket_provider, ticket_price_ore')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (event.ticket_provider !== 'vipps') {
      return NextResponse.json({ error: 'Event does not use Vipps tickets' }, { status: 400 });
    }

    if (!event.ticket_price_ore || event.ticket_price_ore <= 0) {
      return NextResponse.json({ error: 'Event has no valid ticket price' }, { status: 400 });
    }

    // 2. Generate unique reference
    const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
    const reference = `SNG-${Date.now()}-${randomPart}`;
    const idempotencyKey = crypto.randomUUID();

    // 3. Create order in DB before calling Vipps  
    const { error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        reference,
        event_id: event.id,
        amount: event.ticket_price_ore,
        currency: 'NOK',
        status: 'CREATED',
        customer_name: customerName || null,
      });

    if (orderError) {
      console.error('[vipps/create] Order insert failed:', orderError);
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }

    // 4. Call Vipps to create payment
    const returnUrl = `${BASE_URL}/tickets/complete?reference=${reference}`;

    const redirectUrl = await createPayment(
      reference,
      event.ticket_price_ore,
      returnUrl,
      idempotencyKey,
    );

    return NextResponse.json({ redirectUrl });

  } catch (error: any) {
    console.error('[vipps/create] Error:', error.message);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
