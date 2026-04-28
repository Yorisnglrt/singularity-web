'use client';

import { useI18n } from '@/i18n';
import { useEffect, useState } from 'react';
import styles from './Hero.module.css';
import { Event as AppEvent } from '@/data/events';

function useCountdown(targetDate: string) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, mins: 0, secs: 0 });

  useEffect(() => {
    const tick = () => {
      if (!targetDate) return;
      const diff = new Date(targetDate).getTime() - Date.now();
      if (isNaN(diff) || diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, mins: 0, secs: 0 });
        return;
      }
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        mins: Math.floor((diff / (1000 * 60)) % 60),
        secs: Math.floor((diff / 1000) % 60),
      });
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return timeLeft;
}

export default function Hero({ nextEvent }: { nextEvent?: AppEvent }) {
  const { t } = useI18n();
  const countdown = useCountdown(nextEvent?.date || '');

  // A valid upcoming event is one in the future (countdown has at least some time left)
  const hasUpcomingEvent = !!nextEvent && (
    countdown.days > 0 || countdown.hours > 0 || countdown.mins > 0 || countdown.secs > 0
  );

  return (
    <section className={styles.hero} id="hero">
      {/* Background grid stays in the back */}
      <div className={styles.bgGrid} />

      {/* Waveform decoration */}
      <div className={styles.waveform}>
        {Array.from({ length: 60 }).map((_, i) => (
          <div
            key={i}
            className={styles.waveBar}
            style={{
              height: `${20 + Math.sin(i * 0.5) * 40 + Math.random() * 30}%`,
              animationDelay: `${i * 0.05}s`,
            }}
          />
        ))}
      </div>

      <div className={`${styles.content} container`}>
        <div className={styles.tagBadge}>
          <span className={styles.tagDot} />
          DRUM &amp; BASS COLLECTIVE — OSLO
        </div>

        <div className={styles.titleWrapper}>
          <div className={styles.heroLogoImage} />
          {/* Glow effects centered behind the logo */}
          <div className={styles.bgGlow} />
          <div className={styles.bgPulse} />
        </div>

        <p className={styles.subtitle}>{t('hero.subtitle')}</p>
        <p className={styles.tagline}>{t('hero.tagline')}</p>

        {hasUpcomingEvent ? (
          <div className={styles.countdown}>
            <div className={styles.countdownUnit}>
              <span className={styles.countdownValue}>{countdown.days}</span>
              <span className={styles.countdownLabelSmall}>{t('home.countdown.days')}</span>
            </div>
            <div className={styles.countdownUnit}>
              <span className={styles.countdownValue}>{countdown.hours}</span>
              <span className={styles.countdownLabelSmall}>{t('home.countdown.hours')}</span>
            </div>
            <div className={styles.countdownUnit}>
              <span className={styles.countdownValue}>{countdown.mins}</span>
              <span className={styles.countdownLabelSmall}>{t('home.countdown.mins')}</span>
            </div>
            <div className={styles.countdownUnit}>
              <span className={styles.countdownValue}>{countdown.secs}</span>
              <span className={styles.countdownLabelSmall}>{t('home.countdown.secs')}</span>
            </div>
          </div>
        ) : (
          <div className={styles.countdownTba}>
            <span className={styles.countdownTbaIcon}>◈</span>
            <span className={styles.countdownTbaText}>Next event to be announced</span>
          </div>
        )}

        <div className={styles.ctas}>
          <a href="/events" className="btn btn-primary" id="hero-cta-events">
            {t('hero.cta')}
          </a>
          <a href="/membership" className="btn btn-outline" id="hero-cta-membership">
            {t('hero.cta2')}
          </a>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className={styles.scrollHint}>
        <div className={styles.scrollLine} />
      </div>
    </section>
  );
}
