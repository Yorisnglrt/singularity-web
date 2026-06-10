import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function POST(req: Request) {
  try {
    // 1. Admin Authentication Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No auth header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin via profiles table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 2. Request Validation
    const body = await req.json();
    const { eventId, subject, message } = body;

    if (!eventId || !subject || !message) {
      return NextResponse.json({ error: 'eventId, subject, and message are required' }, { status: 400 });
    }

    if (typeof eventId !== 'string' || typeof subject !== 'string' || typeof message !== 'string') {
      return NextResponse.json({ error: 'All fields must be strings' }, { status: 400 });
    }

    if (!eventId.trim() || !subject.trim() || !message.trim()) {
      return NextResponse.json({ error: 'Required fields cannot be empty' }, { status: 400 });
    }

    // 3. Query Ticket Holders
    const { data: tickets, error: ticketsError } = await supabaseAdmin
      .from('tickets')
      .select('holder_email, holder_name, order_id')
      .eq('event_id', eventId)
      .in('status', ['valid', 'used'])
      .not('holder_email', 'is', null);

    if (ticketsError) {
      console.error('[email-attendees] Database error fetching tickets:', ticketsError);
      return NextResponse.json({ error: 'Database error fetching tickets' }, { status: 500 });
    }

    if (!tickets || tickets.length === 0) {
      return NextResponse.json({ ok: true, sentCount: 0 });
    }

    // 4. Deduplicate Recipients in memory (case-insensitive & trimmed emails)
    const uniqueRecipients = new Map<string, { email: string; name: string | null; orderId: string | null }>();

    for (const t of tickets) {
      if (!t.holder_email) continue;
      const emailKey = t.holder_email.trim().toLowerCase();
      
      const existing = uniqueRecipients.get(emailKey);
      // If not present, or if the current ticket has an order_id (paid) whereas existing does not, update it
      // this ensures we associate an order_id for logging if the attendee has both a guest and a paid ticket.
      if (!existing || (t.order_id && !existing.orderId)) {
        uniqueRecipients.set(emailKey, {
          email: t.holder_email.trim(),
          name: t.holder_name || null,
          orderId: t.order_id || null
        });
      }
    }

    const recipients = Array.from(uniqueRecipients.values());
    if (recipients.length === 0) {
      return NextResponse.json({ ok: true, sentCount: 0 });
    }

    // 5. Initialize Resend Client
    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.TICKET_EMAIL_FROM;
    const replyTo = process.env.TICKET_EMAIL_REPLY_TO;

    if (!apiKey || !fromAddress || !replyTo) {
      console.error('[email-attendees] Missing Resend env vars');
      return NextResponse.json({ error: 'Email configuration is missing on the server' }, { status: 500 });
    }

    const resend = new Resend(apiKey);

    // Prepare Email Content with Premium Styling and Sanitized Message
    const escapedMessage = escapeHtml(message).replace(/\n/g, '<br />');
    
    const emailHtml = `
      <div style="font-family: sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 32px; max-width: 600px; margin: 0 auto; border-radius: 8px; border: 1px solid #222;">
        <h1 style="color: #00ffb2; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 16px; border-bottom: 1px solid #222; padding-bottom: 16px;">Singularity</h1>
        <h2 style="color: #fff; margin: 0 0 20px; font-size: 1.3rem;">${escapeHtml(subject)}</h2>
        
        <div style="background: #111; padding: 24px; border-radius: 6px; border: 1px solid #222; line-height: 1.6; color: #d0d0d0; font-size: 1rem;">
          ${escapedMessage}
        </div>
        
        <p style="color: #666; font-size: 0.8rem; margin-top: 32px; text-align: center;">
          This is an event update from Singularity. Please do not reply directly to this automated email.
        </p>
      </div>
    `;

    const emailText = `Singularity — Event Update\n\n${subject}\n\n${message}`;

    // 6. Batch send via Resend in chunks of 100 to avoid timeouts
    const batchSize = 100;
    let sentCount = 0;
    let loggedCount = 0;
    let skippedLogCount = 0;

    for (let i = 0; i < recipients.length; i += batchSize) {
      const chunk = recipients.slice(i, i + batchSize);
      
      const batchPayload = chunk.map(r => ({
        from: fromAddress,
        to: [r.email],
        replyTo: replyTo,
        subject: subject,
        html: emailHtml,
        text: emailText
      }));

      const res = await resend.batch.send(batchPayload);

      if (res.error) {
        console.error('[email-attendees] Resend batch API error:', res.error);
        return NextResponse.json({ error: res.error.message || 'Resend API error' }, { status: 500 });
      }

      // 7. Log to ticket_email_log for paid tickets only (where orderId is NOT NULL)
      const logInserts = [];
      for (let idx = 0; idx < chunk.length; idx++) {
        const item = chunk[idx];
        if (item.orderId) {
          logInserts.push({
            order_id: item.orderId,
            email_type: 'event_update',
            recipient_email: item.email,
            status: 'sent',
            resend_message_id: res.data?.data?.[idx]?.id || null,
            sent_at: new Date().toISOString()
          });
          loggedCount++;
        } else {
          skippedLogCount++;
        }
      }

      if (logInserts.length > 0) {
        const { error: logError } = await supabaseAdmin
          .from('ticket_email_log')
          .insert(logInserts);

        if (logError) {
          // Log the error but do not fail the request since the emails were sent successfully
          console.error('[email-attendees] Failed to log email events in database:', logError);
        }
      }

      sentCount += chunk.length;
    }

    return NextResponse.json({
      ok: true,
      sentCount,
      loggedCount,
      skippedLogCount
    });

  } catch (err: any) {
    console.error('[email-attendees] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
