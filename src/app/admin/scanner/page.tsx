'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { 
  normalizeMemberShortCode, 
  isValidMemberShortCode, 
  isValidLegacyMemberCode 
} from '@/lib/membership/shortCode';
import ScannerResultCard from '@/components/ScannerResultCard';
import styles from './page.module.css';

type ScanState = 'idle' | 'scanning' | 'loading' | 'success' | 'not-found' | 'error' | 'permission-denied';

interface ScannedMember {
  id: string;
  display_name: string;
  member_code: string;
  member_short_code?: string;
  avatar_url: string | null;
  tier: string;
  points: number;
  member_since: string | null;
}

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

  // Shared unified member lookup by 6-character short code or legacy member code
  const lookupMember = useCallback(async (rawInput: string) => {
    const trimmed = rawInput.trim();
    if (!trimmed) return;

    setScanState('loading');
    setScannedMember(null);
    setErrorMessage('');

    try {
      const normalizedShortCode = normalizeMemberShortCode(trimmed);
      let data: any = null;
      let error: any = null;

      // 1. Primary lookup: 6-character member_short_code (only if valid)
      if (isValidMemberShortCode(normalizedShortCode)) {
        const result = await supabase
          .from('profiles')
          .select('id, display_name, member_code, member_short_code, avatar_url, tier, points, member_since')
          .eq('member_short_code', normalizedShortCode)
          .maybeSingle();

        data = result.data;
        error = result.error;
      }

      // 2. Fallback: Legacy SG-XXXXXXXX member code (only if not already found and strictly valid)
      if (!data && !error) {
        const legacyCode = trimmed.toUpperCase().replace(/\s+/g, '');
        if (isValidLegacyMemberCode(legacyCode)) {
          const fallbackResult = await supabase
            .from('profiles')
            .select('id, display_name, member_code, member_short_code, avatar_url, tier, points, member_since')
            .eq('member_code', legacyCode)
            .maybeSingle();

          data = fallbackResult.data;
          error = fallbackResult.error;
        }
      }

      if (error) {
        console.error('Member lookup error:', error);
        setErrorMessage('Database error occurred.');
        setScanState('error');
        return;
      }

      if (!data) {
        setErrorMessage(`No member found for code "${trimmed.toUpperCase()}".`);
        setScanState('not-found');
        return;
      }

      setScannedMember(data as ScannedMember);
      setScanState('success');
    } catch (err) {
      console.error('Member lookup exception:', err);
      setErrorMessage('An unexpected error occurred.');
      setScanState('error');
    }
  }, []);

  const handleScanSuccess = useCallback(async (decodedText: string) => {
    await stopScanner();
    await lookupMember(decodedText);
  }, [lookupMember, stopScanner]);

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
    if (!manualInput.trim()) return;
    lookupMember(manualInput);
  }, [manualInput, lookupMember]);

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
          <p className={styles.subtitle}>Scan member QR code or enter 6-character short code</p>
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
              memberCode={scannedMember.member_short_code || scannedMember.member_code}
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
            <label className={styles.manualLabel}>Manual Member Lookup</label>
            <div className={styles.manualRow}>
              <input
                className={styles.manualInput}
                type="text"
                placeholder="6-character code (e.g. A7K4XQ)"
                value={manualInput}
                maxLength={12}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualLookup()}
                id="scanner-manual-input"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
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
