'use client';

import { useState, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import StatusBadge from './StatusBadge';
import styles from './MemberQrCard.module.css';

interface MemberQrCardProps {
  qrToken: string | null | undefined;
  displayName: string;
  memberCode: string | null | undefined;
  tier: string | null | undefined;
  isAdmin?: boolean;
  onRegenerate?: () => void;
}

const QR_PREFIX = 'SINGULARITY_MEMBER:';

export default function MemberQrCard({
  qrToken,
  displayName,
  memberCode,
  tier,
  isAdmin = false,
  onRegenerate,
}: MemberQrCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const qrValue = qrToken ? `${QR_PREFIX}${qrToken}` : '';

  const handleCopyCode = useCallback(async () => {
    if (!memberCode) return;
    try {
      await navigator.clipboard.writeText(memberCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  }, [memberCode]);

  const handleDownload = useCallback(() => {
    if (!qrRef.current) return;
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
      link.download = `singularity-member-${memberCode || 'qr'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  }, [memberCode]);

  // Empty state
  if (!qrToken) {
    return (
      <div className={styles.card}>
        <span className={styles.cardLabel}>Member QR</span>
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>◈</span>
          <span className={styles.emptyText}>QR token not generated</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.card} id="member-qr-card">
        <span className={styles.cardLabel}>Member QR</span>

        <p className={styles.helperText}>
          This QR is used to identify the member at entry or staff scan.
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
              ↻ Regenerate Token
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
            <span className={styles.memberCode}>{memberCode}</span>
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
