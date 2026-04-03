'use client';

import { useI18n } from '@/i18n';
import styles from './page.module.css';

export default function MembershipPage() {
  const { t } = useI18n();

  return (
    <div className={styles.page}>
      <div className={`container ${styles.grid}`}>
        
        {/* Left Column: Info & Rewards Timeline */}
        <div className={styles.infoCol}>
          <div>
            <h1 className={styles.title}>{t('membership.title')}</h1>
            <p className={styles.desc}>{t('membership.subtitle')}</p>
            <br />
            <p className={styles.desc}>{t('membership.platform')}</p>
            <br />
            <p className={styles.desc}>{t('membership.instructions')}</p>
          </div>

          <div className={styles.timeline}>
            <div className={styles.timelineStep}>
              <div className={styles.timelineDot} />
              <div className={styles.timelineContent}>
                <span className={styles.stepName}>{t('membership.flow.start')}</span>
                <span className={styles.stepPoints}>0 RP</span>
              </div>
            </div>

            <div className={styles.timelineStep}>
              <div className={styles.timelineDot} />
              <div className={styles.timelineContent}>
                <span className={styles.stepName}>{t('membership.flow.free_entry')}</span>
                <span className={styles.stepPoints}>{t('membership.flow.points')}</span>
              </div>
            </div>

            <div className={styles.timelineStep}>
              <div className={styles.timelineDot} />
              <div className={styles.timelineContent}>
                <span className={styles.stepName}>{t('membership.flow.merch')}</span>
                <span className={styles.stepPoints}>{t('membership.flow.points')}</span>
              </div>
            </div>

            <div className={styles.timelineStep}>
              <div className={styles.timelineDot} />
              <div className={styles.timelineContent}>
                <span className={styles.stepName}>{t('membership.flow.repeat')}</span>
                <span className={styles.stepPoints}>∞</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Pass Card with real QR */}
        <div className={styles.cardCol}>
          <div className={styles.passCard}>
            
            <div className={styles.howSection}>
              <h3 className={styles.howTitle}>{t('membership.how.title')}</h3>
              <div className={styles.howList}>
                <span>{t('membership.how.door')}</span>
                <span>{t('membership.how.presale')}</span>
                <span>{t('membership.how.friend')}</span>
              </div>
            </div>

            {/* A genuinely scannable QR Code generated via a public reliable API */}
            <a href="https://pub1.pskt.io/t/5s5vy2" target="_blank" rel="noopener noreferrer" className={styles.qrWrapper}>
              <img 
                src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=https://pub1.pskt.io/t/5s5vy2" 
                alt="Singularity Register QR" 
                className={styles.qrImage}
                width={200}
                height={200}
              />
            </a>

            <div className={styles.qrFooter}>
              {t('membership.qr.scan')}<br />
              <strong>{t('membership.qr.add')}</strong>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
