'use client';

import { useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import styles from './PaymentQrCard.module.css';

interface PaymentQrCardProps {
  sessionCode: string;
  totalAmount: number;
  currency: string;
  onNewSession: () => void;
}

const QR_PREFIX = 'SINGULARITY_PAY:';

export default function PaymentQrCard({
  sessionCode,
  totalAmount,
  currency,
  onNewSession,
}: PaymentQrCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const qrValue = `${QR_PREFIX}${sessionCode}`;

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sessionCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }, [sessionCode]);

  return (
    <>
      <div className={styles.card} id="payment-qr-card">
        <span className={styles.cardLabel}>Payment QR</span>

        <div className={styles.qrFrame} onClick={() => setExpanded(true)} title="Tap to expand">
          <QRCodeSVG
            value={qrValue}
            size={200}
            bgColor="#ffffff"
            fgColor="#000000"
            level="M"
            includeMargin={false}
          />
        </div>

        <div className={styles.sessionInfo}>
          <span className={styles.sessionCode}>{sessionCode}</span>
          <span>
            <span className={styles.totalAmount}>{totalAmount.toFixed(0)}</span>
            <span className={styles.totalCurrency}>{currency}</span>
          </span>
        </div>

        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={() => setExpanded(true)} id="payment-qr-expand">
            ⤢ Expand QR
          </button>
          <button className={styles.actionBtn} onClick={handleCopyCode} id="payment-qr-copy">
            ⎘ Copy Code
          </button>
          <button
            className={`${styles.actionBtn} ${styles.newSessionBtn}`}
            onClick={onNewSession}
            id="payment-qr-new-session"
          >
            + New Session
          </button>
        </div>
      </div>

      {/* Fullscreen QR overlay */}
      {expanded && (
        <div className={styles.overlay} onClick={() => setExpanded(false)}>
          <div className={styles.overlayContent} onClick={(e) => e.stopPropagation()}>
            <span className={styles.overlayLabel}>Payment QR</span>
            <div className={styles.overlayQr}>
              <QRCodeSVG
                value={qrValue}
                size={Math.min(320, typeof window !== 'undefined' ? window.innerWidth - 96 : 320)}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
                includeMargin={false}
              />
            </div>
            <span className={styles.sessionCode}>{sessionCode}</span>
            <span>
              <span className={styles.totalAmount}>{totalAmount.toFixed(0)}</span>
              <span className={styles.totalCurrency}>{currency}</span>
            </span>
            <button className={styles.overlayClose} onClick={() => setExpanded(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {copied && (
        <div className={styles.copiedToast}>Copied to clipboard</div>
      )}
    </>
  );
}
