import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPaymentStatus } from '@/lib/vipps';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Vipps states we consider valid for ticket issuance
const PAID_STATES = ['AUTHORIZED', 'CHARGED'];
const FAILED_STATES = ['FAILED', 'ABORTED', 'EXPIRED', 'TERMINATED'];
const CANCELLED_STATES = ['CANCELLED'];

/**
 * Generate a collision-safe 8-char uppercase alphanumeric ticket code.
 * Retries up to 5 times on collision.
 */
async function generateTicketCode(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  for (let attempt = 0; attempt < 5; attempt++) {
    let code = '';
    const bytes = crypto.randomBytes(8);
    for (let i = 0; i < 8; i++) {
      code += chars[bytes[i] % chars.length];
    }
    // Check uniqueness
    const { data } = await supabaseAdmin
      .from('tickets')
      .select('id')
      .eq('ticket_code', code)
      .maybeSingle();
    if (!data) return code;
  }
  throw new Error('Failed to generate unique ticket code after 5 attempts');
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get('reference');

    if (!reference) {
      return NextResponse.json({ error: 'Missing reference' }, { status: 400 });
    }

    // 1. Find order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*, events(id, title, date, time, venue)')
      .eq('reference', reference)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // 2. Idempotency: if already PAID and ticket exists, return it
    if (order.status === 'PAID') {
      const { data: existingTicket } = await supabaseAdmin
        .from('tickets')
        .select('*')
        .eq('order_id', order.id)
        .single();

      if (existingTicket) {
        return NextResponse.json({
          status: 'PAID',
          ticket: {
            id: existingTicket.id,
            ticketCode: existingTicket.ticket_code,
            qrPayload: existingTicket.qr_payload,
            holderName: existingTicket.holder_name,
            eventTitle: order.events?.title,
            eventDate: order.events?.date,
            eventTime: order.events?.time,
            eventVenue: order.events?.venue,
          },
        });
      }
    }

    // 3. Check with Vipps
    const vippsStatus = await getPaymentStatus(reference);
    const vippsState = vippsStatus.state;

    // 4. Handle states
    if (PAID_STATES.includes(vippsState)) {
      // Update order
      await supabaseAdmin
        .from('orders')
        .update({
          status: 'PAID',
          vipps_state: vippsState,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      // Check if ticket already exists (race condition guard)
      const { data: existingTicket } = await supabaseAdmin
        .from('tickets')
        .select('*')
        .eq('order_id', order.id)
        .maybeSingle();

      if (existingTicket) {
        return NextResponse.json({
          status: 'PAID',
          ticket: {
            id: existingTicket.id,
            ticketCode: existingTicket.ticket_code,
            qrPayload: existingTicket.qr_payload,
            holderName: existingTicket.holder_name,
            eventTitle: order.events?.title,
            eventDate: order.events?.date,
            eventTime: order.events?.time,
            eventVenue: order.events?.venue,
          },
        });
      }

      // Create ticket
      const ticketCode = await generateTicketCode();
      const ticketId = crypto.randomUUID();
      const qrPayload = `SNG-TICKET:${ticketCode}`;

      const { data: newTicket, error: ticketError } = await supabaseAdmin
        .from('tickets')
        .insert({
          id: ticketId,
          order_id: order.id,
          event_id: order.event_id,
          ticket_code: ticketCode,
          qr_payload: qrPayload,
          holder_name: order.customer_name || null,
          status: 'VALID',
        })
        .select()
        .single();

      if (ticketError) {
        // If unique constraint violation on order_id, ticket was created by concurrent request
        if (ticketError.code === '23505') {
          const { data: raceTicket } = await supabaseAdmin
            .from('tickets')
            .select('*')
            .eq('order_id', order.id)
            .single();
          if (raceTicket) {
            return NextResponse.json({
              status: 'PAID',
              ticket: {
                id: raceTicket.id,
                ticketCode: raceTicket.ticket_code,
                qrPayload: raceTicket.qr_payload,
                holderName: raceTicket.holder_name,
                eventTitle: order.events?.title,
                eventDate: order.events?.date,
                eventTime: order.events?.time,
                eventVenue: order.events?.venue,
              },
            });
          }
        }
        console.error('[vipps/status] Ticket insert failed:', ticketError);
        return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
      }

      return NextResponse.json({
        status: 'PAID',
        ticket: {
          id: newTicket.id,
          ticketCode: newTicket.ticket_code,
          qrPayload: newTicket.qr_payload,
          holderName: newTicket.holder_name,
          eventTitle: order.events?.title,
          eventDate: order.events?.date,
          eventTime: order.events?.time,
          eventVenue: order.events?.venue,
        },
      });
    }

    if (FAILED_STATES.includes(vippsState)) {
      await supabaseAdmin
        .from('orders')
        .update({ status: 'FAILED', vipps_state: vippsState, updated_at: new Date().toISOString() })
        .eq('id', order.id);
      return NextResponse.json({ status: 'FAILED' });
    }

    if (CANCELLED_STATES.includes(vippsState)) {
      await supabaseAdmin
        .from('orders')
        .update({ status: 'CANCELLED', vipps_state: vippsState, updated_at: new Date().toISOString() })
        .eq('id', order.id);
      return NextResponse.json({ status: 'CANCELLED' });
    }

    // Still pending
    return NextResponse.json({ status: 'PENDING' });

  } catch (error: any) {
    console.error('[vipps/status] Error:', error.message);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
