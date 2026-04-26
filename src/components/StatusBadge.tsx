'use client';

import styles from './StatusBadge.module.css';

interface StatusBadgeProps {
  status: string;
  variant?: 'success' | 'info' | 'warning' | 'error' | 'neutral';
  showDot?: boolean;
}

export default function StatusBadge({ status, variant = 'neutral', showDot = true }: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[variant]}`} id={`status-badge-${status.toLowerCase().replace(/\s+/g, '-')}`}>
      {showDot && <span className={styles.dot} />}
      {status}
    </span>
  );
}
