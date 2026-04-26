'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import ScannerResultCard from '@/components/ScannerResultCard';
import styles from './page.module.css';

type ScanState = 'idle' | 'scanning' | 'loading' | 'success' | 'not-found' | 'error' | 'permission-denied';

interface ScannedMember {
  id: string;
  display_name: string;
  member_code: string;
  avatar_url: string | null;
  tier: string;
  points: number;
  member_since: string | null;
}

const MEMBER_QR_PREFIX = 'SINGULARITY_MEMBER:';

export default function ScannerPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scannedMember, setScannedMember] = useState<ScannedMember | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<any>(null);

  // Redirect non-admin
  useEffect(() => {
    if (!isLoading && (!user || !user.isAdmin)) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const stopScanner = useCallback(async () => {
    if (html5QrRef.current) {
      try {
        const state = html5QrRef.current.getState();
        if (state === 2) { // SCANNING
          await html5QrRef.current.stop();
        }
      } catch {
        // Ignore cleanup errors
      }
      html5QrRef.current = null;
    }
  }, []);

  // QR scan path: always looks up by qr_token only
  const lookupByQrToken = useCallback(async (qrToken: string) => {
    setScanState('loading');
    setScannedMember(null);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, member_code, avatar_url, tier, points, member_since')
        .eq('qr_token', qrToken)
        .maybeSingle();

      if (error) {
        setErrorMessage('Database error occurred.');
        setScanState('error');
        return;
      }

      if (!data) {
        setErrorMessage('No member found for this QR code.');
        setScanState('not-found');
        return;
      }

      setScannedMember(data as ScannedMember);
      setScanState('success');
    } catch {
      setErrorMessage('An unexpected error occurred.');
      setScanState('error');
    }
  }, []);

  // Manual input path: tries member_code first, then qr_token
  const lookupByManualInput = useCallback(async (input: string) => {
    setScanState('loading');
    setScannedMember(null);

    try {
      // Try by member_code first (most likely manual input format: SG-XXXXXXXX)
      let { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, member_code, avatar_url, tier, points, member_since')
        .eq('member_code', input)
        .maybeSingle();

      if (!data && !error) {
        // Fallback: try by qr_token (UUID pasted manually)
        const result = await supabase
          .from('profiles')
          .select('id, display_name, member_code, avatar_url, tier, points, member_since')
          .eq('qr_token', input)
          .maybeSingle();
        data = result.data;
        error = result.error;
      }

      if (error) {
        setErrorMessage('Database error occurred.');
        setScanState('error');
        return;
      }

      if (!data) {
        setErrorMessage('No member found for this code or token.');
        setScanState('not-found');
        return;
      }

      setScannedMember(data as ScannedMember);
      setScanState('success');
    } catch {
      setErrorMessage('An unexpected error occurred.');
      setScanState('error');
    }
  }, []);

  const handleScanSuccess = useCallback(async (decodedText: string) => {
    await stopScanner();

    // QR scan: must have prefix, extract qr_token
    if (decodedText.startsWith(MEMBER_QR_PREFIX)) {
      const qrToken = decodedText.slice(MEMBER_QR_PREFIX.length);
      await lookupByQrToken(qrToken);
    } else {
      // Unknown QR format — still try as raw token
      await lookupByQrToken(decodedText);
    }
  }, [lookupByQrToken, stopScanner]);

  const startScanner = useCallback(async () => {
    setScanState('scanning');
    setScannedMember(null);
    setErrorMessage('');

    try {
      const { Html5Qrcode } = await import('html5-qrcode');

      if (!scannerRef.current) return;

      const scannerId = 'scanner-viewport';
      scannerRef.current.id = scannerId;

      const scanner = new Html5Qrcode(scannerId);
      html5QrRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText: string) => {
          handleScanSuccess(decodedText);
        },
        () => {
          // Ignore scan failures (continuous scanning)
        }
      );
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
        setScanState('permission-denied');
      } else {
        setErrorMessage(err?.message || 'Failed to start camera.');
        setScanState('error');
      }
    }
  }, [handleScanSuccess]);

  const handleManualLookup = useCallback(() => {
    const input = manualInput.trim();
    if (!input) return;

    // Strip prefix if someone pastes the full QR payload
    let searchTerm = input;
    if (searchTerm.startsWith(MEMBER_QR_PREFIX)) {
      searchTerm = searchTerm.slice(MEMBER_QR_PREFIX.length);
    }

    lookupByManualInput(searchTerm);
  }, [manualInput, lookupByManualInput]);

  const handleReset = useCallback(() => {
    stopScanner();
    setScanState('idle');
    setScannedMember(null);
    setManualInput('');
    setErrorMessage('');
  }, [stopScanner]);

  const handleCreatePayment = useCallback(() => {
    if (!scannedMember) return;
    router.push(`/admin/payments?memberId=${scannedMember.id}`);
  }, [scannedMember, router]);

  if (isLoading) return null;
  if (!user || !user.isAdmin) {
    return (
      <div className={styles.page}>
        <div className={`container ${styles.authGate}`}>
          <span className={styles.authIcon}>◈</span>
          <h1>Admin Access Required</h1>
          <p>You must be an admin to use the member scanner.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>Member Scanner</h1>
          <p className={styles.subtitle}>Scan or search member QR codes</p>
        </div>

        {/* Scanner viewport */}
        {scanState === 'idle' && (
          <div className={styles.scannerArea}>
            <div className={styles.idleState}>
              <span className={styles.idleIcon}>⎔</span>
              <span className={styles.idleText}>Camera not active</span>
              <button className={styles.startBtn} onClick={startScanner} id="scanner-start-btn">
                ◉ Start Scanner
              </button>
            </div>
          </div>
        )}

        {scanState === 'scanning' && (
          <>
            <div className={styles.scannerArea} ref={scannerRef}>
              {/* html5-qrcode renders its own video element here */}
            </div>
            <button className={styles.stopBtn} onClick={handleReset} id="scanner-stop-btn">
              ■ Stop Scanner
            </button>
          </>
        )}

        {/* Loading state */}
        {scanState === 'loading' && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span className={styles.loadingText}>Looking up member...</span>
          </div>
        )}

        {/* Permission denied */}
        {scanState === 'permission-denied' && (
          <div className={styles.permissionCard}>
            <span className={styles.permissionIcon}>⚠</span>
            <span className={styles.permissionTitle}>Camera Access Denied</span>
            <p className={styles.permissionText}>
              Please allow camera access in your browser settings to use the scanner. You can still search members manually below.
            </p>
            <button className={styles.retryBtn} onClick={handleReset}>
              ↻ Try Again
            </button>
          </div>
        )}

        {/* Error / Not found */}
        {(scanState === 'error' || scanState === 'not-found') && (
          <div className={styles.errorCard}>
            <span className={styles.errorIcon}>{scanState === 'not-found' ? '∅' : '✕'}</span>
            <span className={styles.errorTitle}>
              {scanState === 'not-found' ? 'Member Not Found' : 'Error'}
            </span>
            <p className={styles.errorText}>{errorMessage}</p>
            <button className={styles.retryBtn} onClick={handleReset} id="scanner-retry-btn">
              ↻ Scan Again
            </button>
          </div>
        )}

        {/* Success result */}
        {scanState === 'success' && scannedMember && (
          <div className={styles.resultSection}>
            <ScannerResultCard
              displayName={scannedMember.display_name}
              memberCode={scannedMember.member_code}
              avatarUrl={scannedMember.avatar_url}
              tier={scannedMember.tier || 'Observer'}
              points={scannedMember.points || 0}
              memberSince={scannedMember.member_since}
              profileId={scannedMember.id}
              onConfirm={handleReset}
              onCreatePayment={handleCreatePayment}
            />
          </div>
        )}

        {/* Manual input fallback — always visible except during loading */}
        {scanState !== 'loading' && scanState !== 'success' && (
          <div className={styles.manualSection}>
            <label className={styles.manualLabel}>Manual Lookup</label>
            <div className={styles.manualRow}>
              <input
                className={styles.manualInput}
                type="text"
                placeholder="QR token or member code (e.g. SG-A1B2C3D4)"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualLookup()}
                id="scanner-manual-input"
              />
              <button
                className={styles.lookupBtn}
                onClick={handleManualLookup}
                disabled={!manualInput.trim()}
                id="scanner-lookup-btn"
              >
                Search
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
