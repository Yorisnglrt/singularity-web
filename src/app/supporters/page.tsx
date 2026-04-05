'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import styles from './page.module.css';

type Supporter = {
  id: string;
  name: string;
  amount: number;
};

export default function SupportersPage() {
  const { t } = useI18n();
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSupporters = async () => {
      try {
        const res = await fetch('/api/supporters', { cache: 'no-store' });
        const data = await res.json();

        if (!res.ok) {
          console.error('Failed to load supporters:', data?.error);
          setSupporters([]);
          return;
        }

        setSupporters(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Supporters fetch error:', err);
        setSupporters([]);
      } finally {
        setLoading(false);
      }
    };

    loadSupporters();
  }, []);

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>{t('supporters.title')}</h1>
          <p className={styles.text}>{t('supporters.text')}</p>
        </div>

        <div className={styles.section}>
          <div className={styles.supportersList}>
            {loading ? (
              <p>Loading supporters...</p>
            ) : supporters.length > 0 ? (
              supporters.map(supporter => (
                <article key={supporter.id} className={styles.supporterCard}>
                  <span className={styles.supporterName}>{supporter.name}</span>
                  <span className={styles.supporterYear}>{supporter.amount} kr</span>
                </article>
              ))
            ) : (
              <p>No supporters yet. Be the first!</p>
            )}
          </div>
        </div>

        <div className={styles.donationSection}>
          <div className={styles.donationCard}>
            <h2 className={styles.donationTitle}>Donate with Vipps</h2>
            <p className={styles.donationText}>
              Support community driven drum and bass in Oslo.<br />
              Scan with Vipps to send a donation and help us grow the scene.
            </p>
            
            <a 
              href="https://qr.vipps.no/vp/sRpxwxinp" 
              target="_blank" 
              rel="noopener noreferrer" 
              className={styles.qrLink}
            >
              <div className={styles.qrContainer}>
                <img 
                  src="/images/vipps-qr.png" 
                  alt="Vipps QR" 
                  className={styles.qrImage}
                />
                <div className={styles.vippsNumber}>#35931</div>
              </div>
            </a>

            <p className={styles.usageNote}>
              Open Vipps and scan the QR code to donate directly.
            </p>
            
            <div className={styles.futureField} />
          </div>
        </div>
      </div>
    </div>
  );
}
