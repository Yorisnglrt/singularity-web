'use client';

import { useState, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import StatusBadge from './StatusBadge';
import { MEMBER_QR_PREFIX } from '@/lib/membership/shortCode';
import styles from './MemberQrCard.module.css';

interface MemberQrCardProps {
  memberShortCode?: string | null | undefined;
  displayName: string;
  memberCode?: string | null | undefined;
  tier?: string | null | undefined;
  isAdmin?: boolean;
  onRegenerate?: () => void;
}

export default function MemberQrCard({
  memberShortCode,
  displayName,
  memberCode,
  tier,
  isAdmin = false,
  onRegenerate,
}: MemberQrCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  // Canonical QR payload: M:<SHORT_CODE>
  const qrValue = memberShortCode ? `${MEMBER_QR_PREFIX}${memberShortCode}` : '';

  const handleCopyCode = useCallback(async () => {
    const codeToCopy = memberShortCode || memberCode;
    if (!codeToCopy) return;
    try {
      await navigator.clipboard.writeText(codeToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  }, [memberShortCode, memberCode]);

  const handleDownload = useCallback(() => {
    if (!qrRef.current || !memberShortCode) return;
    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 512;
    const padding = 40;
    canvas.width = size + padding * 2;
    canvas.height = size + padding * 2;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, padding, padding, size, size);
      const link = document.createElement('a');
      link.download = `singularity-member-${memberShortCode}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  }, [memberShortCode]);

  // Empty / uninitialized state
  if (!memberShortCode) {
    return (
      <div className={styles.card}>
        <span className={styles.cardLabel}>Member QR</span>
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>◈</span>
          <span className={styles.emptyText}>Membership short code not generated</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.card} id="member-qr-card">
        <span className={styles.cardLabel}>Member QR</span>

        <p className={styles.helperText}>
          Scan at entry or present to staff for membership verification.
        </p>

        <div className={styles.qrFrame} ref={qrRef} onClick={() => setExpanded(true)} title="Tap to expand">
          <QRCodeSVG
            value={qrValue}
            size={200}
            bgColor="#ffffff"
            fgColor="#000000"
            level="M"
            includeMargin={false}
          />
        </div>

        <div className={styles.shortCodeDisplay}>
          <span className={styles.shortCodeLabel}>Manual Entry Code</span>
          <span className={styles.shortCodeValue}>{memberShortCode}</span>
        </div>

        <div className={styles.memberInfo}>
          <span className={styles.memberName}>{displayName}</span>
          {memberCode && (
            <span className={styles.memberCode}>{memberCode}</span>
          )}
          <div className={styles.tierRow}>
            <StatusBadge status={tier || 'Observer'} variant="success" />
            <StatusBadge status="Active" variant="success" />
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={handleDownload} id="member-qr-download">
            ↓ Download QR
          </button>
          <button className={styles.actionBtn} onClick={() => setExpanded(true)} id="member-qr-expand">
            ⤢ Expand QR
          </button>
          <button className={styles.actionBtn} onClick={handleCopyCode} id="member-qr-copy">
            ⎘ Copy Code
          </button>
          {isAdmin && onRegenerate && (
            <button className={`${styles.actionBtn} ${styles.actionBtnAdmin}`} onClick={onRegenerate} id="member-qr-regenerate">
              ↻ Regenerate Code
            </button>
          )}
        </div>
      </div>

      {/* Fullscreen QR overlay */}
      {expanded && (
        <div className={styles.overlay} onClick={() => setExpanded(false)}>
          <div className={styles.overlayContent} onClick={(e) => e.stopPropagation()}>
            <span className={styles.overlayLabel}>Member QR</span>
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
            <div className={styles.shortCodeDisplay} style={{ background: 'rgba(255, 255, 255, 0.1)' }}>
              <span className={styles.shortCodeLabel} style={{ color: '#aaa' }}>Member Code</span>
              <span className={styles.shortCodeValue} style={{ fontSize: '1.5rem', color: '#fff' }}>{memberShortCode}</span>
            </div>
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
