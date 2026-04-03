'use client';

import { useI18n } from '@/i18n';
import styles from './page.module.css';

const values = [
  { key: 'community', icon: '◈' },
  { key: 'inclusivity', icon: '◇' },
  { key: 'diy', icon: '⬡' },
  { key: 'talent', icon: '△' },
];

export default function AboutPage() {
  const { t } = useI18n();

  return (
    <div className={styles.page}>
      <div className="container">
        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>{t('about.title')}</h1>
          <p className={styles.subtitle}>EST. 2025 — OSLO, NORWAY</p>
        </div>

        {/* Story */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('about.story.title')}</h2>
          <div className={styles.storyContent}>
            <div className={styles.storyText}>
              <p>{t('about.story.text')}</p>
            </div>
            <div className={styles.storyVisual}>
              <div className={styles.storyGradient} />
              <div className={styles.storyLines}>
                {Array.from({ length: 20 }).map((_, i) => (
                  <div
                    key={i}
                    className={styles.storyLine}
                    style={{
                      width: `${30 + Math.sin(i * 0.6) * 50}%`,
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Values */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('about.values.title')}</h2>
          <div className={styles.valuesGrid}>
            {values.map(v => (
              <div key={v.key} className={styles.valueCard} id={`value-${v.key}`}>
                <span className={styles.valueIcon}>{v.icon}</span>
                <h3 className={styles.valueName}>{t(`about.values.${v.key}`)}</h3>
                <p className={styles.valueText}>{t(`about.values.${v.key}.text`)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Contact */}
        <section className={styles.section}>
          <div className={styles.contact}>
            <h2 className={styles.contactTitle}>{t('about.contact')}</h2>
            <p className={styles.contactText}>{t('about.contact.text')}</p>
            <div className={styles.contactLinks}>
              <a href="mailto:info@singularity-oslo.no" className="btn btn-primary" id="contact-email">
                info@singularity-oslo.no
              </a>
              <a href="https://www.instagram.com/dnbsingularity/" className="btn btn-outline" id="contact-instagram" target="_blank" rel="noopener noreferrer">
                Instagram
              </a>
              <a href="https://discord.gg/PewjGz7U" className="btn btn-outline" id="contact-discord" target="_blank" rel="noopener noreferrer">
                Discord
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
