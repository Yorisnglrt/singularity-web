'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import styles from './page.module.css';

interface TicketData {
  id: string;
  ticketCode: string;
  qrPayload: string;
  holderName?: string;
  eventTitle?: string;
  eventDate?: string;
  eventTime?: string;
  eventVenue?: any;
}

type PageState = 'loading' | 'success' | 'failed' | 'cancelled' | 'timeout' | 'error';

function TicketCompleteContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get('reference');
  const [state, setState] = useState<PageState>('loading');
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const pollCount = useRef(0);
  const maxPolls = 15; // 15 × 2s = 30s

  useEffect(() => {
    if (!reference) {
      setState('error');
      setErrorMsg('No payment reference found.');
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/payments/vipps/status?reference=${encodeURIComponent(reference)}`);
        const data = await res.json();

        if (data.status === 'PAID' && data.ticket) {
          setTicket(data.ticket);
          setState('success');
          return;
        }

        if (data.status === 'FAILED') {
          setState('failed');
          return;
        }

        if (data.status === 'CANCELLED') {
          setState('cancelled');
          return;
        }

        // Still PENDING
        pollCount.current++;
        if (pollCount.current >= maxPolls) {
          setState('timeout');
          return;
        }

        // Poll again in 2s
        setTimeout(poll, 2000);
      } catch (err: any) {
        console.error('Polling error:', err);
        setState('error');
        setErrorMsg('Could not verify payment status.');
      }
    };

    poll();
  }, [reference]);

  const venue = ticket?.eventVenue
    ? (typeof ticket.eventVenue === 'object' ? ticket.eventVenue.en || Object.values(ticket.eventVenue)[0] : ticket.eventVenue)
    : null;

  const eventDate = ticket?.eventDate ? new Date(ticket.eventDate) : null;
  const formattedDate = eventDate
    ? eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.card}>
          {state === 'loading' && (
            <div className={styles.center}>
              <div className={styles.spinner}>◈</div>
              <h2 className={styles.heading}>Verifying your payment…</h2>
              <p className={styles.sub}>This usually takes a few seconds.</p>
            </div>
          )}

          {state === 'success' && ticket && (
            <div className={styles.center}>
              <div className={styles.successIcon}>✓</div>
              <h2 className={styles.heading}>Payment successful!</h2>
              <p className={styles.sub}>Your ticket is ready.</p>

              <div className={styles.ticketCard}>
                <div className={styles.ticketHeader}>
                  <span className={styles.ticketLabel}>SINGULARITY COLLECTIVE</span>
                </div>
                <h3 className={styles.eventTitle}>{ticket.eventTitle}</h3>
                <div className={styles.eventMeta}>
                  {formattedDate && <span>{formattedDate}</span>}
                  {ticket.eventTime && <span>{ticket.eventTime}</span>}
                  {venue && <span>{venue as string}</span>}
                </div>

                <div className={styles.qrSection}>
                  <QRCodeSVG
                    value={ticket.qrPayload}
                    size={180}
                    level="M"
                    bgColor="transparent"
                    fgColor="#ffffff"
                  />
                </div>

                <div className={styles.ticketCode}>{ticket.ticketCode}</div>

                {ticket.holderName && (
                  <p className={styles.holderName}>{ticket.holderName}</p>
                )}
              </div>

              <div className={styles.actions}>
                <a
                  href={`/api/tickets/${ticket.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                >
                  View / Print Ticket
                </a>
                <a href="/events" className="btn" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                  Back to Events
                </a>
              </div>
            </div>
          )}

          {state === 'failed' && (
            <div className={styles.center}>
              <div className={styles.failIcon}>✕</div>
              <h2 className={styles.heading}>Payment was not completed</h2>
              <p className={styles.sub}>The payment was not successful. You have not been charged.</p>
              <a href="/events" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
                Back to Events
              </a>
            </div>
          )}

          {state === 'cancelled' && (
            <div className={styles.center}>
              <div className={styles.failIcon}>—</div>
              <h2 className={styles.heading}>Payment cancelled</h2>
              <p className={styles.sub}>You cancelled the payment. No charges were made.</p>
              <a href="/events" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
                Back to Events
              </a>
            </div>
          )}

          {state === 'timeout' && (
            <div className={styles.center}>
              <div className={styles.warnIcon}>⏳</div>
              <h2 className={styles.heading}>Still processing</h2>
              <p className={styles.sub}>
                Your payment may still be processing.<br />
                You can reopen this page later with the same link to check your ticket status.
              </p>
              {reference && (
                <p className={styles.ref}>Reference: <code>{reference}</code></p>
              )}
              <a href="/events" className="btn" style={{ marginTop: '1.5rem', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                Back to Events
              </a>
            </div>
          )}

          {state === 'error' && (
            <div className={styles.center}>
              <div className={styles.failIcon}>!</div>
              <h2 className={styles.heading}>Something went wrong</h2>
              <p className={styles.sub}>{errorMsg || 'An unexpected error occurred.'}</p>
              <a href="/events" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
                Back to Events
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TicketCompletePage() {
  return (
    <Suspense fallback={
      <div className={styles.page}>
        <div className="container">
          <div className={styles.card}>
            <div className={styles.center}>
              <div className={styles.spinner}>◈</div>
              <h2 className={styles.heading}>Connecting…</h2>
            </div>
          </div>
        </div>
      </div>
    }>
      <TicketCompleteContent />
    </Suspense>
  );
}
