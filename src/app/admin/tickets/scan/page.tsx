'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';

type ScanState = 'scanning' | 'loading' | 'result';

export default function TicketScannerPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [query, setQuery] = useState('');
  const [ticket, setTicket] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [success, setSuccess] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const scannerRef = useRef<any>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const lastScannedRef = useRef<string>('');

  useEffect(() => {
    if (!isLoading && (!user || !user.isAdmin)) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  // Auto-scroll to top of result when result state is entered
  useEffect(() => {
    if (scanState === 'result') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [scanState]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) {
          await scannerRef.current.stop();
        }
      } catch (e) {
        // Scanner may already be stopped
      }
      try {
        scannerRef.current.clear();
      } catch (e) {
        // Ignore clear errors
      }
      scannerRef.current = null;
    }
  }, []);

  const lookupTicket = useCallback(async (value: string) => {
    if (!value.trim()) return;

    setScanState('loading');
    setError(null);
    setTicket(null);
    setSuccess(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/tickets/lookup?query=${encodeURIComponent(value.trim())}`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        setTicket(data);
        setScanState('result');
      } else {
        const err = await res.json();
        setError(err.error || 'Ticket not found');
        setScanState('result');
      }
    } catch (err) {
      console.error('Lookup error:', err);
      setError('Connection error');
      setScanState('result');
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (!scannerContainerRef.current) return;
    setCameraError(null);

    try {
      const { Html5Qrcode } = await import('html5-qrcode');

      await stopScanner();

      if (scannerContainerRef.current) {
        scannerContainerRef.current.innerHTML = '';
      }

      const scannerId = 'qr-scanner-viewport';
      const div = document.createElement('div');
      div.id = scannerId;
      scannerContainerRef.current?.appendChild(div);

      const html5QrCode = new Html5Qrcode(scannerId);
      scannerRef.current = html5QrCode;

      const containerWidth = scannerContainerRef.current?.clientWidth || 300;
      const qrBoxSize = Math.min(200, Math.floor(containerWidth * 0.55));

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: qrBoxSize, height: qrBoxSize },
          aspectRatio: 4 / 3,
        },
        (decodedText: string) => {
          if (decodedText === lastScannedRef.current) return;
          lastScannedRef.current = decodedText;
          html5QrCode.stop().catch(() => {});
          lookupTicket(decodedText);
        },
        () => {}
      );
    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError(
        err?.message?.includes('NotAllowedError') || err?.message?.includes('Permission')
          ? 'Camera access denied. Allow camera and reload.'
          : 'Camera not available. Use manual input below.'
      );
    }
  }, [stopScanner, lookupTicket]);

  useEffect(() => {
    if (scanState === 'scanning' && user?.isAdmin) {
      const timer = setTimeout(() => startScanner(), 300);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    }
  }, [scanState, user?.isAdmin, startScanner, stopScanner]);

  useEffect(() => {
    return () => { stopScanner(); };
  }, [stopScanner]);

  const handleManualLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    stopScanner();
    lookupTicket(query.trim());
    setQuery('');
  };

  const handleCheckIn = async () => {
    if (!ticket || ticket.status !== 'valid') return;

    setCheckingIn(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/tickets/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ ticketId: ticket.id })
      });

      if (res.ok) {
        setSuccess(true);
        setTicket({
          ...ticket,
          status: 'used',
          used_at: new Date().toISOString()
        });
      } else {
        const err = await res.json();
        setError(err.error || 'Check-in failed');
      }
    } catch (err) {
      console.error('Check-in error:', err);
      setError('Connection error');
    } finally {
      setCheckingIn(false);
    }
  };

  const handleScanAnother = () => {
    lastScannedRef.current = '';
    setTicket(null);
    setError(null);
    setSuccess(false);
    setQuery('');
    setScanState('scanning');
  };

  if (isLoading || !user || !user.isAdmin) {
    return <div className={styles.page}><div className={styles.loadingState}>Authenticating...</div></div>;
  }

  const resolveVenue = (venue: any): string => {
    if (!venue) return 'TBA';
    if (typeof venue === 'string') return venue;
    if (typeof venue === 'object') return venue.en || venue.no || Object.values(venue)[0] as string || 'TBA';
    return 'TBA';
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>

        {/* Compact Header */}
        <header className={styles.header}>
          <Link href="/admin" className={styles.backLink}>← Admin</Link>
          <h1 className={styles.title}>Scanner</h1>
          <div className={styles.adminBadge}>
            <span className={styles.adminDot} />
          </div>
        </header>

        {/* ── SCANNING STATE ── */}
        {scanState === 'scanning' && (
          <>
            <div className={styles.cameraSection}>
              <div ref={scannerContainerRef} className={styles.viewfinder} />
              {cameraError && (
                <div className={styles.cameraErrorMsg}>{cameraError}</div>
              )}
              <p className={styles.scanHint}>Point camera at QR code</p>
            </div>

            <div className={styles.divider}><span>or type code</span></div>

            <form onSubmit={handleManualLookup} className={styles.manualForm}>
              <input
                ref={inputRef}
                type="text"
                className={styles.manualInput}
                placeholder="Ticket code..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
              <button type="submit" className={styles.manualBtn} disabled={!query.trim()}>
                Go
              </button>
            </form>
          </>
        )}

        {/* ── LOADING STATE ── */}
        {scanState === 'loading' && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Looking up...</p>
          </div>
        )}

        {/* ── RESULT STATE ── */}
        {scanState === 'result' && (
          <div className={styles.resultSection} ref={resultRef}>

            {/* ── INVALID ── */}
            {error && !ticket && (
              <>
                <div className={`${styles.bigBadge} ${styles.badgeInvalid}`}>INVALID</div>
                <p className={styles.resultMessage}>{error}</p>
              </>
            )}

            {/* ── SUCCESS CHECK-IN ── */}
            {success && (
              <>
                <div className={`${styles.bigBadge} ${styles.badgeCheckedIn}`}>✓ CHECKED IN</div>
                <p className={styles.resultMessage}>Entry granted</p>
              </>
            )}

            {/* ── VALID ticket: badge → CHECK IN → details ── */}
            {ticket && ticket.status === 'valid' && !success && (
              <>
                <div className={`${styles.bigBadge} ${styles.badgeValid}`}>VALID</div>
                <button
                  className={styles.checkInBtn}
                  onClick={handleCheckIn}
                  disabled={checkingIn}
                >
                  {checkingIn ? 'Processing...' : 'CHECK IN'}
                </button>
              </>
            )}

            {/* ── ALREADY USED ── */}
            {ticket && ticket.status === 'used' && !success && (
              <>
                <div className={`${styles.bigBadge} ${styles.badgeUsed}`}>ALREADY USED</div>
                <p className={styles.resultMessage}>
                  Scanned {new Date(ticket.used_at).toLocaleString('en-GB')}
                </p>
              </>
            )}

            {/* ── VOID ── */}
            {ticket && ticket.status === 'void' && !success && (
              <>
                <div className={`${styles.bigBadge} ${styles.badgeVoid}`}>VOID</div>
                <p className={styles.resultMessage}>Entry denied</p>
              </>
            )}

            {/* ── Compact Details ── */}
            {ticket && (
              <div className={styles.detailsCard}>
                <div className={styles.detailsGrid}>
                  <div className={styles.detailCell}>
                    <span className={styles.detailLabel}>Event</span>
                    <span className={styles.detailVal}>{ticket.events?.title || '—'}</span>
                  </div>
                  <div className={styles.detailCell}>
                    <span className={styles.detailLabel}>Type</span>
                    <span className={styles.detailVal}>{ticket.event_ticket_types?.name || '—'}</span>
                  </div>
                  <div className={styles.detailCell}>
                    <span className={styles.detailLabel}>Code</span>
                    <span className={`${styles.detailVal} ${styles.mono}`}>{ticket.ticket_code}</span>
                  </div>
                  <div className={styles.detailCell}>
                    <span className={styles.detailLabel}>Holder</span>
                    <span className={styles.detailVal}>{ticket.holder_name || ticket.holder_email || '—'}</span>
                  </div>
                </div>
                <div className={styles.detailsFooter}>
                  {ticket.events?.date ? new Date(ticket.events.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                  {' · '}
                  {resolveVenue(ticket.events?.venue)}
                  {ticket.ticket_orders?.order_reference ? ` · ${ticket.ticket_orders.order_reference}` : ''}
                </div>
              </div>
            )}

            {/* ── Scan Another ── */}
            <button className={styles.scanAnotherBtn} onClick={handleScanAnother}>
              ◈ Scan Another Ticket
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
