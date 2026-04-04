'use client';

import { useI18n } from '@/i18n';
import styles from '../legal.module.css';

export default function PrivacyPolicy() {
  const { t } = useI18n();

  return (
    <div className={`${styles.container} container`}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('privacy.title')}</h1>
        <p className={styles.lastUpdated}>{t('privacy.lastUpdated')}</p>
      </header>

      <div className={styles.content}>
        <p className={styles.intro}>{t('privacy.intro')}</p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('privacy.sections.who')}</h2>
          <p className={styles.text}>{t('privacy.sections.who.text')}</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('privacy.sections.data')}</h2>
          <p className={styles.text}>{t('privacy.sections.data.text')}</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('privacy.sections.purpose')}</h2>
          <p className={styles.text}>{t('privacy.sections.purpose.text')}</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('privacy.sections.storage')}</h2>
          <p className={styles.text}>{t('privacy.sections.storage.text')}</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('privacy.sections.rights')}</h2>
          <p className={styles.text}>{t('privacy.sections.rights.text')}</p>
        </section>

        <div className={styles.contact}>
          {t('privacy.contact')}
        </div>
      </div>
    </div>
  );
}
