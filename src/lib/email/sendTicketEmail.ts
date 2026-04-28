/**
 * Server-side only email utility using Resend.
 * This file must never be imported from client components.
 * All env vars are read at call time so missing vars throw clearly.
 */

import { Resend } from 'resend';

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
 * Sends a test email to verify Resend configuration.
 * Throws if any required env var is missing or Resend returns an error.
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
    html: `
      <div style="font-family: monospace; background: #0a0a0a; color: #e0e0e0; padding: 32px; border-radius: 8px; max-width: 600px;">
        <h2 style="color: #00ffb2; letter-spacing: 0.1em; text-transform: uppercase; margin: 0 0 24px;">
          Singularity — Email Test
        </h2>
        <p style="color: #aaa; margin: 0 0 8px;">This is a test email from Singularity.</p>
        <p style="color: #aaa; margin: 0 0 24px;">
          If you received this, the email delivery pipeline is working correctly.
        </p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #555; font-size: 0.85rem;">Sent from</td>
            <td style="padding: 8px 0; color: #e0e0e0;">${from}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #555; font-size: 0.85rem;">Reply-To</td>
            <td style="padding: 8px 0; color: #e0e0e0;">${replyTo}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #555; font-size: 0.85rem;">Delivered to</td>
            <td style="padding: 8px 0; color: #e0e0e0;">${to}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #555; font-size: 0.85rem;">Timestamp</td>
            <td style="padding: 8px 0; color: #e0e0e0;">${sentAt}</td>
          </tr>
        </table>
        <p style="margin: 24px 0 0; color: #444; font-size: 0.75rem;">
          This is an automated test message. No action is required.
        </p>
      </div>
    `,
    text: [
      'Singularity — Email Test',
      '',
      'This is a test email from Singularity.',
      'If you received this, the email delivery pipeline is working correctly.',
      '',
      `Sent from:  ${from}`,
      `Reply-To:   ${replyTo}`,
      `Delivered to: ${to}`,
      `Timestamp:  ${sentAt}`,
      '',
      'This is an automated test message. No action is required.',
    ].join('\n'),
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error('Resend returned no message ID');
  }

  return { id: data.id, from, to, replyTo, sentAt };
}
