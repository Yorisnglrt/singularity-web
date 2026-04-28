import { NextResponse } from 'next/server';
import { sendTicketTestEmail } from '@/lib/email/sendTicketEmail';

/**
 * POST /api/test-email
 * Body: { "to": "email@example.com" }
 *
 * Disabled in production unless TEST_EMAIL_ENABLED=true.
 * RESEND_API_KEY is never exposed to the client — this is a server route only.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  // Production guard
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.TEST_EMAIL_ENABLED !== 'true'
  ) {
    return NextResponse.json(
      { error: 'Test email route is disabled in production.' },
      { status: 403 }
    );
  }

  // Parse body
  let body: { to?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  const to = body?.to;

  // Validate "to"
  if (!to || typeof to !== 'string' || !EMAIL_RE.test(to.trim())) {
    return NextResponse.json(
      { error: '"to" must be a valid email address.' },
      { status: 400 }
    );
  }

  // Send
  try {
    const result = await sendTicketTestEmail(to.trim());
    return NextResponse.json({
      ok: true,
      message: 'Test email sent successfully.',
      ...result,
    });
  } catch (err: any) {
    console.error('[test-email] Send error:', err?.message ?? err);
    return NextResponse.json(
      { error: err?.message ?? 'Failed to send test email.' },
      { status: 500 }
    );
  }
}

// Reject non-POST methods explicitly
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
