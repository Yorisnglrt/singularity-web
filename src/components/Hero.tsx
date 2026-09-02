'use client';

import { useI18n } from '@/i18n';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './Hero.module.css';
import { Event as AppEvent } from '@/data/events';
import { formatHeroEventDate, getEventCalendarDate, getEventTargetDate, isFutureTarget } from '@/lib/hero-event';

export type HeroVariant = 'A' | 'B';
const DEFAULT_VARIANT: HeroVariant = 'B';

interface HeroProps {
  nextEvent?: AppEvent;
  isLoading?: boolean;
  hasError?: boolean;
  variant?: HeroVariant;
}

const emptyCountdown = { days: 0, hours: 0, mins: 0, secs: 0, isRunning: false };

function calculateCountdown(targetDate: string) {
  if (!targetDate) return emptyCountdown;
  const diff = new Date(targetDate).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return emptyCountdown;
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    mins: Math.floor((diff / (1000 * 60)) % 60),
    secs: Math.floor((diff / 1000) % 60),
    isRunning: true,
  };
}

function useCountdown(targetDate: string) {
  const [state, setState] = useState(() => ({
    targetDate,
    value: calculateCountdown(targetDate),
  }));

  useEffect(() => {
    const tick = () => setState({ targetDate, value: calculateCountdown(targetDate) });
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  // Props can change from loading -> loaded before the effect runs. Calculate the
  // new target synchronously for that render so the UI never flashes a false TBA
  // state or a row of zeroes.
  return state.targetDate === targetDate ? state.value : calculateCountdown(targetDate);
}

export default function Hero({ nextEvent, isLoading = false, hasError = false, variant = DEFAULT_VARIANT }: HeroProps) {
  const { t } = useI18n();
  const targetDate = getEventTargetDate(nextEvent);
  const countdown = useCountdown(targetDate);
  const hasUpcomingEvent = !isLoading && !hasError && !!nextEvent && isFutureTarget(targetDate);
  const eventDate = formatHeroEventDate(nextEvent);
  const calendarDate = getEventCalendarDate(nextEvent);

  return (
    <section className={styles.hero} id="hero" aria-busy={isLoading}>
      {/* Background grid stays in the back */}
      <div className={styles.bgGrid} />



      <div className={`${styles.content} container`}>
        <div className={styles.tagBadge}>
          <span className={styles.tagDot} />
          DRUM &amp; BASS COLLECTIVE — OSLO
        </div>

        <div className={styles.titleWrapper}>
          <div className={styles.logoWrap}>
            <div className={styles.heroLogoImage} />
            {/* Glow effects centered behind the logo */}
            <div className={styles.bgGlow} />
            <div className={styles.bgPulse} />
          </div>
        </div>

        <p className={styles.subtitle}>{t('hero.subtitle')}</p>

        {isLoading ? (
          <div className={styles.eventInfoSkeleton} role="status" aria-label="Loading upcoming event" />
        ) : hasUpcomingEvent ? (
          <div className={`${styles.eventInfo} ${variant === 'A' ? styles.variantA : styles.variantB}`}>
            <h2 className={styles.eventHeading}>{nextEvent.title}</h2>
            <time className={styles.eventDate} dateTime={calendarDate}>{eventDate}</time>
          </div>
        ) : (
          <p className={styles.tagline}>{t('hero.tagline')}</p>
        )}

        {isLoading ? (
          <div className={styles.countdownSkeleton} aria-hidden="true" />
        ) : hasUpcomingEvent ? (
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
          <Link href={hasUpcomingEvent ? `/events/${nextEvent.slug || nextEvent.id}` : "/events"} className="btn btn-primary" id="hero-cta-events">
            {t('hero.cta')}
          </Link>
          <Link href="/membership" className="btn btn-outline" id="hero-cta-membership">
            {t('hero.cta2')}
          </Link>
        </div>
      </div>


    </section>
  );
}
