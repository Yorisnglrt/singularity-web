'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './page.module.css';

type PageState = 'loading' | 'authorized' | 'paid' | 'failed' | 'cancelled' | 'timeout' | 'error';

function TicketCompleteContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get('reference');
  const [state, setState] = useState<PageState>('loading');
  const [orderRef, setOrderRef] = useState<string | null>(null);
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

        if (data.orderReference) {
          setOrderRef(data.orderReference);
        }

        if (data.status === 'paid') {
          setState('paid');
          return;
        }

        if (data.status === 'authorized') {
          setState('authorized');
          return;
        }

        if (data.status === 'failed') {
          setState('failed');
          return;
        }

        if (data.status === 'cancelled') {
          setState('cancelled');
          return;
        }

        // Still pending
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

          {state === 'paid' && (
            <div className={styles.center}>
              <div className={styles.successIcon}>✓</div>
              <h2 className={styles.heading}>Payment confirmed!</h2>
              <p className={styles.sub}>
                Your payment has been successfully processed.
              </p>
              {orderRef && (
                <p className={styles.ref}>Order reference: <code>{orderRef}</code></p>
              )}
              {/* TODO: Show ticket details once the tickets table is created and ticket issuance is implemented */}
              <div className={styles.actions}>
                <a href="/events" className="btn btn-primary">
                  Back to Events
                </a>
              </div>
            </div>
          )}

          {state === 'authorized' && (
            <div className={styles.center}>
              <div className={styles.successIcon}>✓</div>
              <h2 className={styles.heading}>Payment authorized</h2>
              <p className={styles.sub}>
                Your payment has been authorized. Final confirmation is pending.
                <br />
                You will receive a confirmation once the payment is fully captured.
              </p>
              {orderRef && (
                <p className={styles.ref}>Order reference: <code>{orderRef}</code></p>
              )}
              <div className={styles.actions}>
                <a href="/events" className="btn btn-primary">
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
                You can reopen this page later with the same link to check your payment status.
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
