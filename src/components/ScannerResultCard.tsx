'use client';

import Link from 'next/link';
import StatusBadge from './StatusBadge';
import styles from './ScannerResultCard.module.css';

interface ScannerResultCardProps {
  displayName: string;
  memberCode: string;
  avatarUrl?: string | null;
  tier: string;
  points: number;
  memberSince: string | null;
  status?: string;
  profileId: string;
  onConfirm?: () => void;
  onCreatePayment?: () => void;
}

export default function ScannerResultCard({
  displayName,
  memberCode,
  avatarUrl,
  tier,
  points,
  memberSince,
  status = 'Active',
  profileId,
  onConfirm,
  onCreatePayment,
}: ScannerResultCardProps) {
  const initial = displayName ? displayName[0].toUpperCase() : '?';
  const formattedDate = memberSince
    ? new Date(memberSince).toLocaleDateString('en', { month: 'short', year: 'numeric' })
    : '—';

  return (
    <div className={styles.card} id="scanner-result-card">
      <div className={styles.header}>
        <div className={styles.avatar}>
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className={styles.avatarImg} />
          ) : (
            initial
          )}
        </div>
        <div className={styles.headerInfo}>
          <span className={styles.displayName}>{displayName}</span>
          <span className={styles.memberCode}>{memberCode}</span>
        </div>
      </div>

      <div className={styles.badgeRow}>
        <StatusBadge status={tier} variant="success" />
        <StatusBadge status={status} variant={status === 'Active' ? 'success' : 'warning'} />
      </div>

      <div className={styles.details}>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Points</span>
          <span className={styles.detailValue}>{points}</span>
        </div>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Member Since</span>
          <span className={styles.detailValue}>{formattedDate}</span>
        </div>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Tier</span>
          <span className={styles.detailValue}>{tier}</span>
        </div>
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Code</span>
          <span className={styles.detailValue} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
            {memberCode}
          </span>
        </div>
      </div>

      <div className={styles.actions}>
        {onConfirm && (
          <button
            className={`${styles.actionBtn} ${styles.actionPrimary}`}
            onClick={onConfirm}
            id="scanner-confirm-btn"
          >
            ✓ Confirm Member
          </button>
        )}
        <Link
          href={`/profile?id=${profileId}`}
          className={`${styles.actionBtn} ${styles.actionSecondary}`}
          id="scanner-open-profile-btn"
        >
          Open Profile
        </Link>
        {onCreatePayment && (
          <button
            className={`${styles.actionBtn} ${styles.actionPayment}`}
            onClick={onCreatePayment}
            id="scanner-create-payment-btn"
          >
            ◈ Create Payment Session
          </button>
        )}
      </div>
    </div>
  );
}
