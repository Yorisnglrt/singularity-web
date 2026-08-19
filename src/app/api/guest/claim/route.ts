import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { generateShortCode } from '@/lib/tickets/shortCode';
import { sendGuestTicketEmail } from '@/lib/email/sendTicketEmail';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

/**
 * POST /api/guest/claim
 * Public endpoint to claim a free guest ticket using a DJ guest code.
 * Executes atomic capacity check and reservation via PostgreSQL RPC.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { code, email, name } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Guest code is required' }, { status: 400 });
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
    }

    const normalizedCode = code.trim().toUpperCase();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = typeof name === 'string' ? name.trim() : '';

    // Generate ticket identifiers
    const shortCode = generateShortCode();
    const ticketCode = `GST-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const nonce = crypto.randomBytes(3).toString('hex').toUpperCase();
    const accessToken = crypto.randomUUID();
    const qrPayload = shortCode; // Uses short code as primary QR content, backwards compatible

    // Execute atomic claim RPC
    const { data: claimResult, error: rpcError } = await supabaseAdmin.rpc('claim_guest_ticket', {
      p_code: normalizedCode,
      p_email: normalizedEmail,
      p_name: normalizedName || null,
      p_short_code: shortCode,
      p_ticket_code: ticketCode,
      p_qr_payload: qrPayload,
      p_access_token: accessToken,
    });

    if (rpcError) {
      console.error('[guest claim RPC error]', rpcError);
      return NextResponse.json({ error: rpcError.message || 'Database claim error' }, { status: 500 });
    }

    // Handle business rule failure (already claimed, capacity reached, invalid/expired code)
    if (!claimResult || claimResult.success === false) {
      if (claimResult?.error_code === 'ALREADY_CLAIMED') {
        // Try to trigger email resend in background for the already claimed ticket
        if (claimResult.ticket_id) {
          sendGuestTicketEmail([claimResult.ticket_id]).catch(e => {
            console.error('[guest claim resend email error]', e);
          });
        }

        return NextResponse.json({
          success: false,
          alreadyClaimed: true,
          message: 'You have already claimed a guest ticket with this code. We have resent your ticket details to your email.',
          ticketCode: claimResult.ticket_code,
          shortCode: claimResult.short_code,
          accessToken: claimResult.access_token,
          eventTitle: claimResult.event_title,
          djName: claimResult.dj_name,
        }, { status: 200 });
      }

      return NextResponse.json({
        error: claimResult?.message || 'Unable to claim guest ticket',
        errorCode: claimResult?.error_code,
      }, { status: 400 });
    }

    // Ticket successfully created!
    const ticketId = claimResult.ticket_id;

    // Send guest ticket email (non-blocking so email delivery failure never loses a valid ticket)
    let emailSent = false;
    try {
      await sendGuestTicketEmail([ticketId]);
      emailSent = true;
    } catch (emailErr: any) {
      console.error('[guest claim email delivery error]', emailErr?.message || emailErr);
    }

    return NextResponse.json({
      success: true,
      ticketCode: claimResult.ticket_code,
      shortCode: claimResult.short_code,
      accessToken: claimResult.access_token,
      eventTitle: claimResult.event_title,
      eventDate: claimResult.event_date,
      djName: claimResult.dj_name,
      isTestEvent: claimResult.is_test_event,
      emailSent,
    });
  } catch (err: any) {
    console.error('[guest claim unexpected error]', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
