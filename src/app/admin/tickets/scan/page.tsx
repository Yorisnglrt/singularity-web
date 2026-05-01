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
  const mountedRef = useRef(true);
  const lastScannedRef = useRef<string>('');

  useEffect(() => {
    if (!isLoading && (!user || !user.isAdmin)) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  // Nuclear fallback to kill all camera tracks
  const killAllVideoTracks = useCallback(() => {
    try {
      const videos = document.querySelectorAll('video');
      videos.forEach((video) => {
        const stream = (video as HTMLVideoElement).srcObject as MediaStream | null;
        if (stream) {
          stream.getTracks().forEach((track) => {
            track.stop();
            console.log('[scanner] killed track:', track.label);
          });
          (video as HTMLVideoElement).srcObject = null;
        }
      });
    } catch (e) {}
  }, []);

  const stopScanner = useCallback(async () => {
    const instance = scannerRef.current;
    if (!instance) return;

    console.log('[scanner] stopping');
    try {
      const state = instance.getState();
      if (state === 2 || state === 3) {
        await instance.stop();
      }
      instance.clear();
    } catch (e) {
      console.log('[scanner] stop error:', e);
    }
    scannerRef.current = null;
    killAllVideoTracks();
    console.log('[scanner] cleanup complete');
  }, [killAllVideoTracks]);

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
    console.log('[scanner] starting');

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      await stopScanner();
      
      if (!mountedRef.current || !scannerContainerRef.current) return;
      scannerContainerRef.current.innerHTML = '';

      const scannerId = 'qr-scanner-viewport';
      const div = document.createElement('div');
      div.id = scannerId;
      scannerContainerRef.current.appendChild(div);

      const html5QrCode = new Html5Qrcode(scannerId);
      scannerRef.current = html5QrCode;

      const containerWidth = scannerContainerRef.current.clientWidth || 300;
      // Use smaller QR box for compact frame
      const qrBoxSize = Math.min(180, Math.floor(containerWidth * 0.6));

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: qrBoxSize, height: qrBoxSize },
          aspectRatio: 1.333333, // 4:3
        },
        (decodedText: string) => {
          if (decodedText === lastScannedRef.current) return;
          lastScannedRef.current = decodedText;
          html5QrCode.stop().catch(() => {});
          lookupTicket(decodedText);
        },
        () => {}
      );
      console.log('[scanner] camera active');
    } catch (err: any) {
      console.error('[scanner] camera error:', err);
      setCameraError('Camera error. Use manual input.');
    }
  }, [stopScanner, lookupTicket]);

  useEffect(() => {
    mountedRef.current = true;
    if (scanState === 'scanning' && user?.isAdmin) {
      const timer = setTimeout(() => startScanner(), 300);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    }
  }, [scanState, user?.isAdmin, startScanner, stopScanner]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopScanner();
    };
  }, [stopScanner]);

  useEffect(() => {
    if (scanState === 'result') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [scanState]);

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
        setTicket({ ...ticket, status: 'used', used_at: new Date().toISOString() });
      } else {
        const err = await res.json();
        setError(err.error || 'Check-in failed');
      }
    } catch (err) {
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
    setScanState('scanning');
  };

  if (isLoading || !user || !user.isAdmin) {
    return <div className={styles.page}><div className={styles.loadingState}>Authenticating...</div></div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/admin" className={styles.backLink}>← Admin</Link>
          <h1 className={styles.title}>Scanner</h1>
          <div className={styles.adminDot} />
        </header>

        {scanState === 'scanning' && (
          <div className={styles.scanSection}>
            <div className={styles.cameraFrame}>
              <div ref={scannerContainerRef} className={styles.viewfinder} />
              {cameraError && <div className={styles.cameraError}>{cameraError}</div>}
              <div className={styles.scanHint}>Align QR code in center</div>
            </div>

            <div className={styles.manualRow}>
              <form onSubmit={handleManualLookup} className={styles.manualForm}>
                <input
                  type="text"
                  className={styles.manualInput}
                  placeholder="Code..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                />
                <button type="submit" className={styles.manualBtn} disabled={!query.trim()}>GO</button>
              </form>
            </div>
          </div>
        )}

        {scanState === 'loading' && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Searching...</p>
          </div>
        )}

        {scanState === 'result' && (
          <div className={styles.resultSection}>
            {/* Status Badge */}
            {error && !ticket && <div className={`${styles.statusBadge} ${styles.badgeInvalid}`}>INVALID</div>}
            {success && <div className={`${styles.statusBadge} ${styles.badgeSuccess}`}>✓ CHECKED IN</div>}
            {ticket && !success && (
              <>
                {ticket.status === 'valid' && <div className={`${styles.statusBadge} ${styles.badgeValid}`}>VALID</div>}
                {ticket.status === 'used' && <div className={`${styles.statusBadge} ${styles.badgeUsed}`}>ALREADY USED</div>}
                {ticket.status === 'void' && <div className={`${styles.statusBadge} ${styles.badgeVoid}`}>VOID</div>}
              </>
            )}

            {/* Main Action Button */}
            {ticket && ticket.status === 'valid' && !success && (
              <button className={styles.checkInBtn} onClick={handleCheckIn} disabled={checkingIn}>
                {checkingIn ? '...' : 'CHECK IN'}
              </button>
            )}

            {/* Message/Reason */}
            {(error || success || (ticket && ticket.status !== 'valid')) && (
              <p className={styles.resultMessage}>
                {error || (success ? 'Entry granted' : ticket.status === 'used' ? `Used ${new Date(ticket.used_at).toLocaleTimeString()}` : 'Entry denied')}
              </p>
            )}

            {/* Compact Details */}
            {ticket && (
              <div className={styles.detailsBox}>
                <div className={styles.detailsGrid}>
                  <div className={styles.detailItem}>
                    <label>Event</label>
                    <span>{ticket.events?.title}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <label>Type</label>
                    <span>{ticket.event_ticket_types?.name}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <label>Holder</label>
                    <span>{ticket.holder_name || ticket.holder_email}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <label>Code</label>
                    <span className={styles.mono}>{ticket.ticket_code}</span>
                  </div>
                </div>
              </div>
            )}

            <button className={styles.scanNextBtn} onClick={handleScanAnother}>◈ Scan Another</button>
          </div>
        )}
      </div>
    </div>
  );
}
