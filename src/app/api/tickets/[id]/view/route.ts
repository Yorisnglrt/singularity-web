import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch ticket with order and event data
    const { data: ticket, error } = await supabaseAdmin
      .from('tickets')
      .select('*, orders(reference, amount, currency, customer_name), events(title, date, time, venue)')
      .eq('id', id)
      .single();

    if (error || !ticket) {
      return new Response('<h1>Ticket not found</h1>', {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const event = ticket.events;
    const order = ticket.orders;
    const eventDate = event?.date ? new Date(event.date) : null;
    const formattedDate = eventDate
      ? eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : '—';
    const venue = typeof event?.venue === 'object' ? event.venue.en || Object.values(event.venue)[0] : event?.venue || '—';
    const priceFormatted = order?.amount ? `${(order.amount / 100).toFixed(2)} ${order.currency || 'NOK'}` : '—';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket — ${event?.title || 'Event'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #111;
      display: flex;
      justify-content: center;
      padding: 2rem;
    }
    .ticket {
      background: #fff;
      border: 2px dashed #ccc;
      border-radius: 12px;
      max-width: 420px;
      width: 100%;
      padding: 2rem;
      text-align: center;
    }
    .ticket-header {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: #888;
      margin-bottom: 1rem;
    }
    .event-title {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }
    .event-meta {
      font-size: 0.85rem;
      color: #555;
      margin-bottom: 1.5rem;
      line-height: 1.6;
    }
    .qr-section {
      margin: 1.5rem 0;
      padding: 1rem;
      background: #fafafa;
      border-radius: 8px;
    }
    .qr-section svg {
      max-width: 180px;
      height: auto;
    }
    .ticket-code {
      font-family: monospace;
      font-size: 1.4rem;
      font-weight: 700;
      letter-spacing: 0.2em;
      margin: 1rem 0;
      padding: 0.5rem;
      background: #f0f0f0;
      border-radius: 6px;
    }
    .holder {
      font-size: 0.85rem;
      color: #555;
      margin-top: 1rem;
    }
    .divider {
      border: none;
      border-top: 1px dashed #ddd;
      margin: 1.5rem 0;
    }
    .footer {
      font-size: 0.7rem;
      color: #999;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .ticket { border: 1px solid #ddd; max-width: 100%; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="ticket-header">Singularity Collective — Event Ticket</div>
    <div class="event-title">${escapeHtml(event?.title || 'Event')}</div>
    <div class="event-meta">
      ${formattedDate}<br>
      ${event?.time || ''}<br>
      ${escapeHtml(venue)}
    </div>
    <hr class="divider">
    <div class="qr-section">
      ${generateQrSvg(ticket.qr_payload, 180)}
    </div>
    <div class="ticket-code">${escapeHtml(ticket.ticket_code)}</div>
    ${ticket.holder_name ? `<div class="holder">Holder: ${escapeHtml(ticket.holder_name)}</div>` : ''}
    <hr class="divider">
    <div class="footer">
      Ref: ${escapeHtml(order?.reference || '—')}<br>
      Paid: ${priceFormatted}<br>
      Status: ${ticket.status}
    </div>
    <div class="no-print" style="margin-top: 1.5rem;">
      <button onclick="window.print()" style="padding: 0.5rem 1.5rem; font-size: 0.9rem; cursor: pointer; border: 1px solid #ccc; border-radius: 6px; background: #fff;">
        🖨 Print / Save as PDF
      </button>
    </div>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });

  } catch (error: any) {
    console.error('[ticket/view] Error:', error.message);
    return new Response('<h1>Error loading ticket</h1>', {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate a minimal QR code as inline SVG.
 * Uses a simple encoding — good enough for short text payloads.
 */
function generateQrSvg(data: string, size: number): string {
  // For the MVP, we render a placeholder with the data encoded.
  // In production, use a proper QR library server-side.
  // The completion page already renders a real QR via qrcode.react.
  // This fallback ensures the printed ticket at least shows the code.
  return `
    <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 0.5rem;">
      <div style="width: ${size}px; height: ${size}px; background: #fff; border: 2px solid #000; display: flex; align-items: center; justify-content: center; font-family: monospace; font-size: 0.65rem; word-break: break-all; padding: 0.5rem; border-radius: 4px;">
        ${escapeHtml(data)}
      </div>
      <small style="color: #888; font-size: 0.65rem;">Scan ticket code at entrance</small>
    </div>`;
}
