'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/i18n';
import { Event, toSlug } from '@/data/events';
import styles from './EventCard.module.css';

interface EventCardProps {
  event: Event;
  featured?: boolean;
}

export default function EventCard({ event, featured }: EventCardProps) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const eventDate = new Date(event.date);
  const day = eventDate.getDate();
  const month = eventDate.toLocaleString('en', { month: 'short' }).toUpperCase();
  const year = eventDate.getFullYear();

  const cardImage = event.posterVertical || event.posterImage;
  const eventHref = `/events/${toSlug(event)}`;

  const handleCardClick = () => {
    router.push(eventHref);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      router.push(eventHref);
    }
  };

  return (
    <article 
      className={`${styles.card} card ${featured ? styles.featured : ''}`} 
      id={`event-${event.id}`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="link"
      aria-label={`${event.title}, ${day} ${month} ${year}`}
    >
      {/* Poster — clean 4:5, nothing overlaid */}
      <div className={styles.poster} style={{ background: event.posterColor }}>
        {cardImage ? (
          <img
            src={cardImage}
            alt={event.title}
            className={styles.posterImage}
            loading="lazy"
          />
        ) : (
          /* When no poster image, show a subtle date watermark on the gradient */
          <div className={styles.posterFallback}>
            <div className={styles.posterFallbackDate}>
              <span className={styles.posterFallbackDay}>{day}</span>
              <span className={styles.posterFallbackMonth}>{month} {year}</span>
            </div>
          </div>
        )}
      </div>

      {/* Info — below the poster */}
      <div className={styles.info}>
        <div className={styles.topRow}>
          <span className={styles.dateText}>{day} {month} {year}</span>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
            {event.ageRestriction && (
              <span className="tag" style={{ fontSize: 'var(--text-xs)', padding: '0.15em 0.5em' }}>{event.ageRestriction}</span>
            )}
            <span className={`tag ${event.type === 'underground' ? 'tag--hot' : event.type === 'outdoor' ? 'tag--purple' : ''}`}>
              {t(`events.filter.${event.type}`)}
            </span>
          </div>
        </div>

        <h3 className={styles.title}>
          <Link href={eventHref} className={styles.titleLink}>
            {event.title}
          </Link>
        </h3>

        <p className={styles.meta}>
          <span className={styles.metaIcon}>◷</span> {event.time}
          <span className={styles.metaDivider}>·</span>
          <span className={styles.metaIcon}>◈</span> {typeof event.venue === 'string' ? event.venue : event.venue[locale]}
        </p>

        {event.description[locale] && (
          <p className={styles.desc}>{event.description[locale]}</p>
        )}

        <div className={styles.lineup}>
          <span className={styles.lineupLabel}>{t('events.lineup')}:</span>
          <div className={styles.lineupNames}>
            {event.lineup.map(name => (
              <span key={name} className={styles.lineupName}>{name}</span>
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          {!event.isPast && (
            <>
              {event.isFree ? (
                <span className="tag" onClick={(e) => e.stopPropagation()}>{t('events.free')}</span>
              ) : (
                <Link 
                  href={`${eventHref}#tickets`} 
                  className="btn btn-primary btn-sm" 
                  id={`tickets-${event.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {t('events.tickets')}
                </Link>
              )}
            </>
          )}
          <Link 
            href={eventHref}
            className={`btn btn-sm`} 
            style={{borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)'}} 
          >
            View details
          </Link>
        </div>
      </div>
    </article>
  );
}
