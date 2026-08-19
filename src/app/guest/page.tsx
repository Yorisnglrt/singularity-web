'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';

interface ValidatedCode {
  valid: boolean;
  code: string;
  djName: string;
  eventTitle: string;
  eventDate: string | null;
  priceOre: number;
  priceNok: number;
  isPaid: boolean;
  isTestEvent?: boolean;
}

interface ClaimSuccess {
  ticketCode: string;
  shortCode: string;
  accessToken: string;
  eventTitle: string;
  djName: string;
  email: string;
  isTestEvent?: boolean;
  alreadyClaimed?: boolean;
  emailSent?: boolean;
}

function GuestClaimContent() {
  const searchParams = useSearchParams();
  const initialCode = (searchParams.get('code') || '').trim().toUpperCase();

  const [code, setCode] = useState(initialCode);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const [validating, setValidating] = useState(false);
  const [validatedCode, setValidatedCode] = useState<ValidatedCode | null>(null);
  const [validateError, setValidateError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<ClaimSuccess | null>(null);

  // Validate code on mount if present in URL, or on code change blur
  useEffect(() => {
    if (initialCode) {
      validateGuestCode(initialCode);
    }
  }, [initialCode]);

  const validateGuestCode = async (codeToValidate: string) => {
    const trimmed = codeToValidate.trim().toUpperCase();
    if (!trimmed) {
      setValidatedCode(null);
      setValidateError(null);
      return;
    }

    setValidating(true);
    setValidateError(null);

    try {
      const res = await fetch(`/api/guest/validate?code=${encodeURIComponent(trimmed)}`);
      const data = await res.json();

      if (res.ok && data.valid) {
        setValidatedCode(data);
        setValidateError(null);
      } else {
        setValidatedCode(null);
        setValidateError(data.error || 'Invalid or expired guest code');
      }
    } catch {
      setValidatedCode(null);
      setValidateError('Network error validating guest code');
    } finally {
      setValidating(false);
    }
  };

  const handleCodeBlur = () => {
    if (code.trim() && (!validatedCode || validatedCode.code !== code.trim().toUpperCase())) {
      validateGuestCode(code);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setClaimError('Please enter a guest code');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setClaimError('Please enter a valid email address');
      return;
    }

    setSubmitting(true);
    setClaimError(null);

    try {
      const isPaid = validatedCode?.isPaid || (validatedCode?.priceOre && validatedCode.priceOre > 0);

      if (isPaid) {
        // Paid guest code -> Reserve and redirect to Vipps
        const res = await fetch('/api/guest/reserve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: code.trim().toUpperCase(),
            email: email.trim().toLowerCase(),
            name: name.trim(),
            paymentMethodType: 'WALLET',
          }),
        });

        const data = await res.json();

        if (res.ok && (data.success || data.alreadyClaimed)) {
          if (data.alreadyClaimed) {
            setClaimSuccess({
              ticketCode: data.ticketCode,
              shortCode: data.shortCode,
              accessToken: data.accessToken,
              eventTitle: data.eventTitle || validatedCode?.eventTitle || 'Singularity Event',
              djName: data.djName || validatedCode?.djName || '',
              email: email.trim().toLowerCase(),
              alreadyClaimed: true,
            });
            return;
          }

          if (data.redirectUrl) {
            window.location.href = data.redirectUrl;
            return;
          }
        }

        setClaimError(data.error || 'Failed to start payment reservation');
      } else {
        // Free guest code -> Instant atomic claim
        const res = await fetch('/api/guest/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: code.trim().toUpperCase(),
            email: email.trim().toLowerCase(),
            name: name.trim(),
          }),
        });

        const data = await res.json();

        if (res.ok && (data.success || data.alreadyClaimed)) {
          setClaimSuccess({
            ticketCode: data.ticketCode,
            shortCode: data.shortCode,
            accessToken: data.accessToken,
            eventTitle: data.eventTitle || validatedCode?.eventTitle || 'Singularity Event',
            djName: data.djName || validatedCode?.djName || '',
            email: email.trim().toLowerCase(),
            isTestEvent: data.isTestEvent || validatedCode?.isTestEvent,
            alreadyClaimed: data.alreadyClaimed,
            emailSent: data.emailSent,
          });
        } else {
          setClaimError(data.error || 'Failed to claim guest ticket');
        }
      }
    } catch (err: any) {
      console.error('Submission error:', err);
      setClaimError(err.message || 'Connection error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── 1. Success State (for free claims / recovery) ──
  if (claimSuccess) {
    const digitalTicketUrl = `/tickets/${encodeURIComponent(claimSuccess.ticketCode)}?access=${claimSuccess.accessToken}`;

    return (
      <div className={styles.card}>
        <div className={styles.successContainer}>
          <div className={styles.successIcon}>✓</div>
          <h2 className={styles.successTitle}>
            {claimSuccess.alreadyClaimed ? 'Guest Pass Already Claimed' : 'Guest Pass Confirmed!'}
          </h2>
          <p className={styles.successSubtitle}>
            {claimSuccess.alreadyClaimed
              ? 'You already have a valid ticket for this guest code. Your pass details are shown below.'
              : `You are on the guest list for ${claimSuccess.eventTitle}.`}
          </p>

          <div className={styles.ticketSummaryCard}>
            {claimSuccess.isTestEvent && (
              <div style={{
                background: '#ff8c00',
                color: '#000',
                fontWeight: 900,
                fontSize: '0.75rem',
                padding: '0.3rem 0.6rem',
                borderRadius: '4px',
                textAlign: 'center',
                marginBottom: '0.75rem',
                letterSpacing: '1px'
              }}>
                ⚠ TEST EVENT GUEST PASS
              </div>
            )}
            <div className={styles.ticketSummaryEvent}>{claimSuccess.eventTitle}</div>
            <div className={styles.ticketSummaryDj}>Guest List: {claimSuccess.djName}</div>

            <div className={styles.ticketCodeBox}>
              <div className={styles.ticketCodeLabel}>Your Ticket Code</div>
              <div className={styles.ticketCodeValue}>{claimSuccess.shortCode}</div>
            </div>
          </div>

          <Link href={digitalTicketUrl} className={styles.viewTicketBtn}>
            View Digital Ticket
          </Link>

          <p className={styles.successNotice}>
            A confirmation email with your QR code has been sent to <strong>{claimSuccess.email}</strong>. 
            Please have your code or QR code ready at the entrance.
          </p>
        </div>
      </div>
    );
  }

  // ── 2. Claim Form State ──
  const isPaidCode = validatedCode?.isPaid || (validatedCode?.priceOre && validatedCode.priceOre > 0);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h1 className={styles.title}>Guest List</h1>
        <p className={styles.subtitle}>
          {isPaidCode
            ? 'Enter your guest code and proceed to payment'
            : 'Enter your guest code to claim your event ticket'}
        </p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className={styles.label}>Guest Code *</label>
          <input
            type="text"
            className={`${styles.input} ${styles.codeInput}`}
            value={code}
            onChange={e => {
              setCode(e.target.value.toUpperCase());
              setValidateError(null);
            }}
            onBlur={handleCodeBlur}
            placeholder="e.g. XCSTNZ25"
            maxLength={30}
            required
            autoFocus
          />
        </div>

        {validating && (
          <div style={{ fontSize: '0.8rem', color: '#888', textAlign: 'center' }}>
            Checking guest code...
          </div>
        )}

        {validatedCode && (
          <div className={styles.eventBadge}>
            <div className={styles.eventBadgeTitle}>{validatedCode.eventTitle}</div>
            <div className={styles.eventBadgeMeta}>
              <span>✓ Verified</span>
              <span>·</span>
              <span>Guest list: {validatedCode.djName}</span>
              {validatedCode.isTestEvent && (
                <span style={{ background: '#ff8c00', color: '#000', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 900 }}>
                  TEST
                </span>
              )}
            </div>
            {isPaidCode && (
              <div style={{
                marginTop: '0.35rem',
                fontSize: '0.9rem',
                fontWeight: 800,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, fontSize: '0.8rem' }}>Guest ticket price:</span>
                <span style={{ color: '#00ffb2' }}>{validatedCode.priceNok} NOK</span>
              </div>
            )}
          </div>
        )}

        {validateError && (
          <div className={styles.errorBanner}>
            ⚠ {validateError}
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label}>Email Address *</label>
          <input
            type="email"
            className={styles.input}
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your.email@example.com"
            required
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>
            <span>Full Name</span>
            <span className={styles.optional}>optional</span>
          </label>
          <input
            type="text"
            className={styles.input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="First and last name"
          />
        </div>

        {claimError && (
          <div className={styles.errorBanner}>
            ⚠ {claimError}
          </div>
        )}

        <button
          type="submit"
          className={styles.claimBtn}
          disabled={submitting || validating || !code.trim() || !email.trim()}
        >
          {submitting
            ? 'Processing...'
            : isPaidCode
            ? `Continue to Vipps — ${validatedCode?.priceNok} NOK`
            : 'Claim Free Guest Ticket'}
        </button>
      </form>
    </div>
  );
}

export default function GuestClaimPage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Suspense fallback={
          <div className={styles.card} style={{ textAlign: 'center', color: '#888' }}>
            Loading guest list...
          </div>
        }>
          <GuestClaimContent />
        </Suspense>
      </div>
    </div>
  );
}
