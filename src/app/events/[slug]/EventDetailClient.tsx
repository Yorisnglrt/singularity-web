'use client';

import Link from 'next/link';
import { Event, toSlug } from '@/data/events';
import EventActions from '@/components/EventActions';
import EventDiscussion from '@/components/EventDiscussion';
import styles from './page.module.css';

interface Props {
  event: Event;
}

export default function EventDetailClient({ event }: Props) {
  const eventDate = new Date(event.date);
  const day = eventDate.getDate();
  const month = eventDate.toLocaleString('en', { month: 'long' });
  const year = eventDate.getFullYear();
  const weekday = eventDate.toLocaleString('en', { weekday: 'long' });

  return (
    <div className={styles.page}>
      {/* Poster image — shown clean, no overlay */}
      {event.posterImage ? (
        <div className={styles.posterHero}>
          <img src={event.posterImage} alt={event.title} className={styles.posterHeroImage} />
        </div>
      ) : (
        <div className={styles.hero} style={{ background: event.posterColor }}>
          <div className={styles.heroOverlay} />
          <div className={`container ${styles.heroContent}`}>
            <Link href="/events" className={styles.backLink}>← All Events</Link>
            <div className={styles.heroBadge}>
              <span className={`tag ${event.type === 'outdoor' ? 'tag--purple' : ''}`}>{event.type}</span>
              {event.isPast && <span className="tag">Archive</span>}
            </div>
            <h1 className={styles.heroTitle}>{event.title}</h1>
            <p className={styles.heroDate}>{weekday}, {day} {month} {year}</p>
          </div>
        </div>
      )}

      {/* Title bar — shown below the poster image only */}
      {event.posterImage && (
        <div className="container">
          <div className={styles.titleBar}>
            <Link href="/events" className={styles.backLinkAlt}>← All Events</Link>
            <div className={styles.heroBadge}>
              <span className={`tag ${event.type === 'outdoor' ? 'tag--purple' : ''}`}>{event.type}</span>
              {event.isPast && <span className="tag">Archive</span>}
            </div>
            <h1 className={styles.titleBarHeading}>{event.title}</h1>
            <p className={styles.titleBarDate}>{weekday}, {day} {month} {year}</p>
          </div>
        </div>
      )}

      <div className="container">
        <div className={styles.layout}>
          {/* Main info */}
          <div className={styles.main}>
            <div className={styles.metaRow}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Time</span>
                <span className={styles.metaValue}>{event.time}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Venue</span>
                <span className={styles.metaValue}>
                  {typeof event.venue === 'string' ? event.venue : event.venue['en']}
                </span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Type</span>
                <span className={styles.metaValue} style={{ textTransform: 'capitalize' }}>{event.type}</span>
              </div>
            </div>

            {/* Lineup */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Lineup</h2>
              <div className={styles.lineupGrid}>
                {event.lineup.map(name => (
                  <div key={name} className={styles.lineupChip}>{name}</div>
                ))}
              </div>
            </div>

            {/* Actions — interactions + ticket */}
            <div className={styles.section}>
              <EventActions
                eventId={event.id}
                ticketUrl={event.ticketUrl}
                isFree={event.isFree}
                isPast={event.isPast}
              />
            </div>

            {/* Discussion Section */}
            <EventDiscussion eventId={event.id} />
          </div>

          {/* Sidebar */}
          <aside className={styles.sidebar}>
            <div className={styles.sideCard}>
              <div className={styles.dateBlock}>
                <span className={styles.dateDay}>{day}</span>
                <span className={styles.dateMonthYear}>{month} {year}</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
