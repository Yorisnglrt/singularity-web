'use client';

import { useState } from 'react';
import styles from './RateSelectButton.module.css';

interface RateSelectButtonProps {
  label: string;
  amount: number;
  currency: string;
  onSelect: () => void;
}

export default function RateSelectButton({ label, amount, currency, onSelect }: RateSelectButtonProps) {
  const [pulse, setPulse] = useState(false);

  const handleClick = () => {
    setPulse(true);
    onSelect();
    setTimeout(() => setPulse(false), 400);
  };

  return (
    <button
      className={`${styles.button} ${pulse ? styles.addedPulse : ''}`}
      onClick={handleClick}
      id={`rate-btn-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <span className={styles.label}>{label}</span>
      <span className={styles.amount}>{amount.toFixed(0)}</span>
      <span className={styles.currency}>{currency}</span>
    </button>
  );
}
