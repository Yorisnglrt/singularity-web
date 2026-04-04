'use client';

import { useI18n } from '@/i18n';
import styles from '../legal.module.css';

export default function CookiesPage() {
  const { t } = useI18n();

  return (
    <div className={`${styles.container} container`}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('cookies.title')}</h1>
        <p className={styles.lastUpdated}>{t('privacy.lastUpdated')}</p>
      </header>

      <div className={styles.content}>
        <p className={styles.intro}>{t('cookies.intro')}</p>

        <section className={styles.section}>
          <p className={styles.text}>{t('cookies.status')}</p>
        </section>

        <section className={styles.section}>
          <p className={styles.text}>{t('cookies.changes')}</p>
        </section>

        <div className={styles.contact}>
          {t('privacy.contact')}
        </div>
      </div>
    </div>
  );
}
