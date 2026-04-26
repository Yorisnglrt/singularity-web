'use client';

import styles from './PaymentSummaryCard.module.css';

interface PaymentSummaryCardProps {
  total: number;
  currency: string;
  itemCount: number;
  isGenerating: boolean;
  onGenerate: () => void;
}

export default function PaymentSummaryCard({
  total,
  currency,
  itemCount,
  isGenerating,
  onGenerate,
}: PaymentSummaryCardProps) {
  const disabled = itemCount === 0 || isGenerating;

  return (
    <div className={styles.card} id="payment-summary-card">
      <div className={styles.row}>
        <span className={styles.label}>Items</span>
        <span className={styles.value} style={{ fontSize: 'var(--text-lg)' }}>{itemCount}</span>
      </div>

      <div className={styles.divider} />

      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>Total</span>
        <span>
          <span className={styles.totalValue}>{total.toFixed(0)}</span>
          <span className={styles.currency}>{currency}</span>
        </span>
      </div>

      <button
        className={styles.generateBtn}
        onClick={onGenerate}
        disabled={disabled}
        id="generate-payment-btn"
      >
        {isGenerating ? '↻ Generating...' : '◈ Generate Payment QR'}
      </button>

      {itemCount === 0 && (
        <p className={styles.itemCount}>Add items above to generate a payment</p>
      )}
    </div>
  );
}
