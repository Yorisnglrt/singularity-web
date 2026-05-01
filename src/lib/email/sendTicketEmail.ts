/**
 * Server-side only email utility using Resend.
 * This file must never be imported from client components.
 */

import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://www.singularity-oslo.no').replace(/\/$/, '');

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Missing env var: RESEND_API_KEY');
  }
  return new Resend(apiKey);
}

function getFromAddress(): string {
  const from = process.env.TICKET_EMAIL_FROM;
  if (!from) {
    throw new Error('Missing env var: TICKET_EMAIL_FROM');
  }
  return from;
}

function getReplyTo(): string {
  const replyTo = process.env.TICKET_EMAIL_REPLY_TO;
  if (!replyTo) {
    throw new Error('Missing env var: TICKET_EMAIL_REPLY_TO');
  }
  return replyTo;
}

export interface SendResult {
  id: string;
  from: string;
  to: string;
  replyTo: string;
  sentAt: string;
}

/**
 * Sends a ticket confirmation email for a paid order.
 * This function is idempotent: if email_status is 'sent', it skips sending.
 */
export async function sendOrderTicketsEmail(
  orderId: string, 
  options?: { force?: boolean }
): Promise<{ sent: boolean; alreadySent: boolean; messageId?: string }> {
  const force = options?.force === true;
  const resend = getResendClient();
  const from = getFromAddress();
  const replyTo = getReplyTo();

  // 1. Load order and check status
  const { data: order, error: orderError } = await supabaseAdmin
    .from('ticket_orders')
    .select('id, order_reference, customer_email, customer_name, email_status, payment_status')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw new Error(`Order not found for email: ${orderId}`);
  }

  if (order.email_status === 'sent' && !force) {
    return { sent: false, alreadySent: true };
  }

  // 2. Load tickets with event details
  const { data: tickets, error: ticketsError } = await supabaseAdmin
    .from('tickets')
    .select(`
      ticket_code,
      qr_payload,
      event_id,
      events (
        title,
        date,
        venue
      )
    `)
    .eq('order_id', orderId);

  if (ticketsError || !tickets || tickets.length === 0) {
    throw new Error(`No tickets found for order ${order.order_reference}`);
  }

  const event = (tickets[0] as any).events;
  const eventTitle = event?.title || 'Singularity Event';
  const eventDate = event?.date ? new Date(event.date).toLocaleDateString('no-NO') : 'TBA';

  // Helper for robust venue extraction from JSONB or legacy fields
  const getEventVenue = (ev: any): string => {
    const v = ev?.venue;
    if (typeof v === 'string' && v.trim() !== '') return v;
    if (v && typeof v === 'object') {
      if (v.en && v.en !== 'TB') return v.en;
      if (v.no && v.no !== 'TB') return v.no;
      if (v.cs && v.cs !== 'TB') return v.cs;
      const firstValid = Object.values(v).find(val => val && val !== 'TB' && typeof val === 'string');
      if (firstValid) return firstValid as string;
    }
    return ev?.venue_legacy || 'Oslo';
  };

  const eventVenue = getEventVenue(event);

  // 3. Generate QR codes and construct email content
  const attachments: any[] = [];
  const ticketListHtml = await Promise.all(tickets.map(async (t) => {
    const qrBuffer = await QRCode.toBuffer(t.qr_payload, {
      margin: 1,
      width: 400,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    const cid = `qr-${t.ticket_code}`;
    attachments.push({
      filename: `${t.ticket_code}.png`,
      content: qrBuffer,
      cid: cid,
      contentId: cid, // Some clients prefer contentId
    });

    const ticketUrl = `${BASE_URL}/tickets/${encodeURIComponent(t.ticket_code)}`;

    return `
      <div style="margin-bottom: 24px; padding: 16px; border: 1px solid #333; border-radius: 8px; background: #111; text-align: center;">
        <div style="color: #00ffb2; font-size: 1.1rem; font-weight: bold; margin-bottom: 16px;">Ticket: ${t.ticket_code}</div>
        
        <div style="margin-bottom: 16px;">
          <img src="cid:${cid}" alt="QR Code" style="width: 200px; height: 200px; border-radius: 4px; display: block; margin: 0 auto;" />
        </div>

        <div style="margin-bottom: 20px;">
          <p style="color: #aaa; font-size: 0.8rem; margin-bottom: 12px;">If the QR code is not visible, open your ticket here:</p>
          <a href="${ticketUrl}" 
             style="display: inline-block; padding: 12px 24px; background: #00ffb2; color: #000; text-decoration: none; font-weight: bold; border-radius: 4px; text-transform: uppercase; font-size: 0.85rem;">
             View Ticket
          </a>
        </div>

        <div style="color: #fff; font-size: 0.9rem; font-weight: bold; margin-bottom: 4px;">Show this QR at the entrance</div>
        <div style="color: #888; font-size: 0.7rem; word-break: break-all; opacity: 0.5;">${t.qr_payload}</div>
      </div>
    `;
  })).then(htmls => htmls.join(''));

  const ticketListText = tickets.map(t => {
    const ticketUrl = `${BASE_URL}/tickets/${encodeURIComponent(t.ticket_code)}`;
    return `Ticket Code: ${t.ticket_code}\nView Online: ${ticketUrl}\nQR Payload: ${t.qr_payload}`;
  }).join('\n\n');

  // 4. Send via Resend
  const { data, error: sendError } = await resend.emails.send({
    from,
    to: [order.customer_email],
    replyTo,
    subject: `Your Tickets: ${eventTitle} (${order.order_reference})`,
    attachments,
    html: `
      <div style="font-family: sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 32px; max-width: 600px; margin: 0 auto; border-radius: 8px;">
        <h1 style="color: #00ffb2; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 16px;">Singularity</h1>
        <h2 style="color: #fff; margin: 0 0 24px;">Order Confirmation</h2>
        
        <div style="background: #1a1a1a; padding: 20px; border-radius: 4px; margin-bottom: 32px;">
          <div style="margin-bottom: 8px;"><strong style="color: #888;">Order Ref:</strong> ${order.order_reference}</div>
          <div style="margin-bottom: 8px;"><strong style="color: #888;">Event:</strong> ${eventTitle}</div>
          <div style="margin-bottom: 8px;"><strong style="color: #888;">Date:</strong> ${eventDate}</div>
          <div style="margin-bottom: 8px;"><strong style="color: #888;">Venue:</strong> ${eventVenue}</div>
        </div>

        <h3 style="color: #fff; margin: 0 0 16px;">Your Tickets</h3>
        ${ticketListHtml}

        <p style="color: #aaa; font-size: 0.9rem; margin-top: 32px; border-top: 1px solid #222; padding-top: 24px;">
          Thank you for your purchase. Please have your ticket codes ready at the entrance.
        </p>
      </div>
    `,
    text: `
Singularity — Order Confirmation

Order Ref: ${order.order_reference}
Event:     ${eventTitle}
Date:      ${eventDate}
Venue:     ${eventVenue}

YOUR TICKETS:
${ticketListText}

Thank you for your purchase. Please have your ticket codes ready at the entrance.
    `.trim(),
  });

  // 5. Log and Update status
  const logEntry = {
    order_id: orderId,
    email_type: 'ticket_confirmation',
    recipient_email: order.customer_email,
    status: sendError ? 'failed' : 'sent',
    resend_message_id: data?.id || null,
    error_message: sendError?.message || null,
    sent_at: new Date().toISOString(),
  };

  await supabaseAdmin.from('ticket_email_log').insert(logEntry);

  if (sendError) {
    await supabaseAdmin.from('ticket_orders').update({ email_status: 'failed' }).eq('id', orderId);
    console.error(`[email] Failed to send tickets for ${order.order_reference}:`, sendError);
    return { sent: false, alreadySent: false };
  }

  await supabaseAdmin.from('ticket_orders').update({
    email_status: 'sent',
    email_sent_at: new Date().toISOString()
  }).eq('id', orderId);

  console.log(`[email] Tickets sent for order ${order.order_reference} (ID: ${data?.id})`);
  return { sent: true, alreadySent: false, messageId: data?.id };
}

/**
 * Sends a test email to verify Resend configuration.
 */
export async function sendTicketTestEmail(to: string): Promise<SendResult> {
  const resend = getResendClient();
  const from = getFromAddress();
  const replyTo = getReplyTo();
  const sentAt = new Date().toISOString();

  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    replyTo: replyTo,
    subject: 'Singularity ticket email test',
    html: `<p>Singularity test email sent at ${sentAt}</p>`,
    text: `Singularity test email sent at ${sentAt}`,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
  if (!data?.id) throw new Error('Resend returned no message ID');

  return { id: data.id, from, to, replyTo, sentAt };
}
