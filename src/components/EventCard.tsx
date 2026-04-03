'use client';

import Link from 'next/link';
import { useI18n } from '@/i18n';
import { Event, toSlug } from '@/data/events';
import styles from './EventCard.module.css';

interface EventCardProps {
  event: Event;
  featured?: boolean;
}

export default function EventCard({ event, featured }: EventCardProps) {
  const { t, locale } = useI18n();
  const eventDate = new Date(event.date);
  const day = eventDate.getDate();
  const month = eventDate.toLocaleString('en', { month: 'short' }).toUpperCase();
  const year = eventDate.getFullYear();

  return (
    <article className={`${styles.card} card ${featured ? styles.featured : ''}`} id={`event-${event.id}`}>
      <div className={styles.poster} style={{ background: event.posterColor }}>
        <div className={styles.posterOverlay} />
        <div className={styles.posterContent}>
          <span className={styles.posterDate}>{day}</span>
          <span className={styles.posterMonth}>{month} {year}</span>
        </div>
        <div className={`tag ${event.type === 'underground' ? 'tag--hot' : event.type === 'outdoor' ? 'tag--purple' : ''}`} style={{ position: 'absolute', top: 12, right: 12 }}>
          {t(`events.filter.${event.type}`)}
        </div>
      </div>

      <div className={styles.info}>
        <h3 className={styles.title}>{event.title}</h3>
        <p className={styles.meta}>
          <span className={styles.metaIcon}>◷</span> {event.time}
          <span className={styles.metaDivider}>·</span>
          <span className={styles.metaIcon}>◈</span> {typeof event.venue === 'string' ? event.venue : event.venue[locale]}
        </p>
        <p className={styles.desc}>{event.description[locale]}</p>

        <div className={styles.lineup}>
          <span className={styles.lineupLabel}>{t('events.lineup')}:</span>
          <div className={styles.lineupNames}>
            {event.lineup.map(name => (
              <span key={name} className={styles.lineupName}>{name}</span>
            ))}
          </div>
        </div>

        {!event.isPast && (
          <div className={styles.actions}>
            {event.isFree ? (
              <span className="tag">{t('events.free')}</span>
            ) : (
              <a href={event.ticketUrl || '#'} className="btn btn-primary btn-sm" id={`tickets-${event.id}`}>
                {t('events.tickets')}
              </a>
            )}
            <Link href={`/events/${toSlug(event)}`} className={`btn btn-sm`} style={{borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)'}} id={`detail-${event.id}`}>
              View details
            </Link>
          </div>
        )}
        {event.isPast && (
          <div className={styles.actions}>
            <Link href={`/events/${toSlug(event)}`} className={`btn btn-sm`} style={{borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)'}} id={`detail-past-${event.id}`}>
              View details
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}
