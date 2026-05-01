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
  const lastScannedRef = useRef<string>('');

  useEffect(() => {
    if (!isLoading && (!user || !user.isAdmin)) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        // Html5QrcodeScanner states: NOT_STARTED=1, SCANNING=2, PAUSED=3
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

    // Dynamically import html5-qrcode to avoid SSR issues
    try {
      const { Html5Qrcode } = await import('html5-qrcode');

      // Clean up any existing scanner
      await stopScanner();

      // Clear the container
      if (scannerContainerRef.current) {
        scannerContainerRef.current.innerHTML = '';
      }

      const scannerId = 'qr-scanner-viewport';
      const div = document.createElement('div');
      div.id = scannerId;
      scannerContainerRef.current?.appendChild(div);

      const html5QrCode = new Html5Qrcode(scannerId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText: string) => {
          // Prevent duplicate rapid scans
          if (decodedText === lastScannedRef.current) return;
          lastScannedRef.current = decodedText;

          // Stop scanning and look up ticket
          html5QrCode.stop().catch(() => {});
          lookupTicket(decodedText);
        },
        () => {
          // QR code not found in frame - expected, no action needed
        }
      );
    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError(
        err?.message?.includes('NotAllowedError') || err?.message?.includes('Permission')
          ? 'Camera access denied. Please allow camera access and reload.'
          : 'Camera not available. Use manual input below.'
      );
    }
  }, [stopScanner, lookupTicket]);

  // Start camera scanner when in scanning state
  useEffect(() => {
    if (scanState === 'scanning' && user?.isAdmin) {
      // Small delay to let DOM render
      const timer = setTimeout(() => startScanner(), 300);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    }
  }, [scanState, user?.isAdmin, startScanner, stopScanner]);

  // Cleanup on unmount
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

        {/* Header */}
        <header className={styles.header}>
          <div>
            <Link href="/admin" className={styles.backLink}>← Dashboard</Link>
            <h1 className={styles.title}>Ticket Scanner</h1>
          </div>
          <div className={styles.adminBadge}>
            <span className={styles.adminDot} />
            {user.displayName}
          </div>
        </header>

        {/* Scanning State */}
        {scanState === 'scanning' && (
          <>
            <div className={styles.cameraSection}>
              <div className={styles.viewfinderWrapper}>
                <div ref={scannerContainerRef} className={styles.viewfinder} />
                {!cameraError && (
                  <div className={styles.viewfinderOverlay}>
                    <div className={styles.cornerTL} />
                    <div className={styles.cornerTR} />
                    <div className={styles.cornerBL} />
                    <div className={styles.cornerBR} />
                  </div>
                )}
              </div>
              {cameraError && (
                <div className={styles.cameraErrorMsg}>{cameraError}</div>
              )}
              <p className={styles.scanHint}>Point camera at ticket QR code</p>
            </div>

            <div className={styles.divider}>
              <span>OR ENTER MANUALLY</span>
            </div>

            <form onSubmit={handleManualLookup} className={styles.manualForm}>
              <input
                ref={inputRef}
                type="text"
                className={styles.manualInput}
                placeholder="Ticket code or QR payload..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
              <button type="submit" className={styles.manualBtn} disabled={!query.trim()}>
                Lookup
              </button>
            </form>
          </>
        )}

        {/* Loading State */}
        {scanState === 'loading' && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Looking up ticket...</p>
          </div>
        )}

        {/* Result State */}
        {scanState === 'result' && (
          <div className={styles.resultSection}>

            {/* Error: INVALID */}
            {error && !ticket && (
              <div className={styles.bigState}>
                <div className={`${styles.bigBadge} ${styles.badgeInvalid}`}>INVALID</div>
                <p className={styles.bigMessage}>{error}</p>
              </div>
            )}

            {/* Success check-in */}
            {success && (
              <div className={styles.bigState}>
                <div className={`${styles.bigBadge} ${styles.badgeCheckedIn}`}>✓ CHECKED IN</div>
                <p className={styles.bigMessage}>Entry granted</p>
              </div>
            )}

            {/* Ticket found */}
            {ticket && !success && (
              <>
                {/* Status badge */}
                {ticket.status === 'valid' && (
                  <div className={styles.bigState}>
                    <div className={`${styles.bigBadge} ${styles.badgeValid}`}>VALID</div>
                  </div>
                )}
                {ticket.status === 'used' && (
                  <div className={styles.bigState}>
                    <div className={`${styles.bigBadge} ${styles.badgeUsed}`}>ALREADY USED</div>
                    <p className={styles.bigMessage}>
                      Scanned: {new Date(ticket.used_at).toLocaleString('en-GB')}
                    </p>
                  </div>
                )}
                {ticket.status === 'void' && (
                  <div className={styles.bigState}>
                    <div className={`${styles.bigBadge} ${styles.badgeVoid}`}>VOID</div>
                    <p className={styles.bigMessage}>Entry denied — ticket is void</p>
                  </div>
                )}
              </>
            )}

            {/* Ticket details card */}
            {ticket && (
              <div className={styles.detailsCard}>
                <div className={styles.detailRow}>
                  <label>Event</label>
                  <div className={styles.detailValue}>{ticket.events?.title}</div>
                  <div className={styles.detailSub}>
                    {ticket.events?.date ? new Date(ticket.events.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    {' · '}
                    {resolveVenue(ticket.events?.venue)}
                  </div>
                </div>

                <div className={styles.detailRow}>
                  <label>Ticket Type</label>
                  <div className={styles.detailValue}>{ticket.event_ticket_types?.name || '—'}</div>
                </div>

                <div className={styles.detailRow}>
                  <label>Ticket Code</label>
                  <div className={styles.detailValueMono}>{ticket.ticket_code}</div>
                </div>

                <div className={styles.detailRow}>
                  <label>Holder</label>
                  <div className={styles.detailValue}>{ticket.holder_name || ticket.holder_email || '—'}</div>
                  {ticket.holder_name && ticket.holder_email && (
                    <div className={styles.detailSub}>{ticket.holder_email}</div>
                  )}
                </div>

                <div className={styles.detailRow}>
                  <label>Order</label>
                  <div className={styles.detailValueMono}>{ticket.ticket_orders?.order_reference || '—'}</div>
                </div>
              </div>
            )}

            {/* Check In button */}
            {ticket && ticket.status === 'valid' && !success && (
              <button
                className={styles.checkInBtn}
                onClick={handleCheckIn}
                disabled={checkingIn}
              >
                {checkingIn ? 'Processing...' : 'CHECK IN'}
              </button>
            )}

            {/* Scan Another */}
            <button className={styles.scanAnotherBtn} onClick={handleScanAnother}>
              ◈ Scan Another Ticket
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
