'use client';

import styles from './SelectedPaymentItemRow.module.css';

interface SelectedPaymentItemRowProps {
  label: string;
  unitAmount: number;
  quantity: number;
  currency: string;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
}

export default function SelectedPaymentItemRow({
  label,
  unitAmount,
  quantity,
  currency,
  onIncrement,
  onDecrement,
  onRemove,
}: SelectedPaymentItemRowProps) {
  const lineTotal = unitAmount * quantity;

  return (
    <div className={styles.row}>
      <div className={styles.info}>
        <span className={styles.label}>{label}</span>
        <span className={styles.unitPrice}>{unitAmount.toFixed(0)} {currency} each</span>
      </div>

      <div className={styles.quantityControls}>
        <button className={styles.qtyBtn} onClick={onDecrement} aria-label="Decrease quantity">−</button>
        <span className={styles.qtyValue}>{quantity}</span>
        <button className={styles.qtyBtn} onClick={onIncrement} aria-label="Increase quantity">+</button>
      </div>

      <span className={styles.lineTotal}>{lineTotal.toFixed(0)} {currency}</span>

      <button className={styles.removeBtn} onClick={onRemove} aria-label={`Remove ${label}`}>×</button>
    </div>
  );
}
