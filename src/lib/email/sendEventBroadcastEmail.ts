import { Resend } from 'resend';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface BroadcastRecipient {
  email: string;
  name?: string | null;
}

export interface SendEventBroadcastEmailParams {
  subject: string;
  message: string;
  recipients: BroadcastRecipient[];
}

export interface SendEventBroadcastEmailResult {
  sentCount: number;
  error?: any;
}

/**
 * Shared helper to render the premium dark Singularity email template
 * and send one email per recipient in batches of 100 via Resend.
 */
export async function sendEventBroadcastEmail({
  subject,
  message,
  recipients,
}: SendEventBroadcastEmailParams): Promise<SendEventBroadcastEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.TICKET_EMAIL_FROM;
  const replyTo = process.env.TICKET_EMAIL_REPLY_TO;

  if (!apiKey || !fromAddress || !replyTo) {
    throw new Error('Resend environment variables (RESEND_API_KEY, TICKET_EMAIL_FROM, TICKET_EMAIL_REPLY_TO) are missing');
  }

  if (recipients.length === 0) {
    return { sentCount: 0 };
  }

  const resend = new Resend(apiKey);

  // Escape HTML characters in user inputs and format linebreaks
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

  const batchSize = 100;
  let sentCount = 0;

  for (let i = 0; i < recipients.length; i += batchSize) {
    const chunk = recipients.slice(i, i + batchSize);
    const batchPayload = chunk.map(r => ({
      from: fromAddress,
      to: [r.email],
      replyTo: replyTo,
      subject: subject,
      html: emailHtml,
      text: emailText,
    }));

    const res = await resend.batch.send(batchPayload);

    if (res.error) {
      console.error('[sendEventBroadcastEmail] Resend batch API error:', res.error);
      return {
        sentCount,
        error: res.error,
      };
    }

    sentCount += chunk.length;
  }

  return { sentCount };
}
