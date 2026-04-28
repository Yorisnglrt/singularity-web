'use client';

import { useI18n } from '@/i18n';
import Link from 'next/link';
import styles from './Footer.module.css';

export default function Footer() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer} id="footer">
      <div className={styles.glowLine} />
      <div className={`${styles.inner} container`}>
        <div className={styles.grid}>
          {/* Brand */}
          <div className={styles.brand}>
            <div className={styles.logoRow}>
              <div className={styles.logoImage} />
            </div>
            <p className={styles.tagline}>{t('footer.tagline')}</p>
          </div>

          {/* Navigation */}
          <div className={styles.col}>
            <h4 className={styles.colTitle}>{t('footer.nav')}</h4>
            <nav className={styles.links}>
              <Link href="/events">{t('nav.events')}</Link>
              <Link href="/artists">{t('nav.artists')}</Link>
              <Link href="/mixes">{t('nav.mixes')}</Link>
              <Link href="/membership">{t('nav.membership')}</Link>
              <Link href="/supporters">{t('nav.supporters')}</Link>
              <Link href="/about">{t('nav.about')}</Link>
            </nav>
          </div>

          {/* Social */}
          <div className={styles.col}>
            <h4 className={styles.colTitle}>{t('footer.social')}</h4>
            <nav className={styles.links}>
              <a href="https://www.instagram.com/dnbsingularity/" target="_blank" rel="noopener noreferrer">Instagram</a>
              <a href="https://soundcloud.com/singularity-oslo" target="_blank" rel="noopener noreferrer">SoundCloud</a>
              <a href="https://discord.gg/b5D7G6Eeys" target="_blank" rel="noopener noreferrer">Discord</a>
              <a href="https://www.facebook.com/profile.php?id=61576948133549" target="_blank" rel="noopener noreferrer">Facebook</a>
            </nav>
          </div>
        </div>

        <div className={styles.bottom}>
          <div className={styles.legalInfo}>
            <p className={styles.copyright}>
              © {year} Singularity Collective. {t('footer.rights')}
            </p>
            <div className={styles.legalLinks}>
              <Link href="/privacy-policy">{t('privacy.title')}</Link>
              <Link href="/cookies">{t('cookies.title')}</Link>
              <Link href="/terms-of-sale">{t('termsOfSale.title')}</Link>
            </div>
          </div>
          <p className={styles.location}>OSLO, NORWAY</p>
        </div>
      </div>
    </footer>
  );
}
