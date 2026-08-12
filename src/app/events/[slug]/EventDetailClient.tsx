'use client';

import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { Artist } from '@/data/artists';
import ArtistCard from '@/components/ArtistCard';
import { Event, EventTicketType } from '@/data/events';
import EventActions from '@/components/EventActions';
import { resolveLineupArtists } from '@/lib/data-normalization';
import { useI18n } from '@/i18n';
import styles from './page.module.css';

// Lazy-load non-critical interactive components
const TicketPurchaseSection = dynamic(() => import('@/components/TicketPurchaseSection'), { ssr: false });
const EventDiscussion = dynamic(() => import('@/components/EventDiscussion'), { ssr: false });

interface Props {
  event: Event;
  artists: Artist[];
  ticketTypes: EventTicketType[];
}

export default function EventDetailClient({ event, artists, ticketTypes }: Props) {
  const { t, locale } = useI18n();
  const enableCheckout = process.env.NEXT_PUBLIC_ENABLE_TICKET_CHECKOUT === 'true';
  const lineupArtists = resolveLineupArtists(event.lineup, artists);
  const eventDate = new Date(event.date);
  const day = eventDate.getDate();
  const month = eventDate.toLocaleString('en', { month: 'long' });
  const year = eventDate.getFullYear();
  const weekday = eventDate.toLocaleString('en', { weekday: 'long' });

  // Hero image resolution: coverWide for wide hero, posterVertical/posterImage for portrait fallback
  const wideImage = event.coverWide;
  const portraitImage = event.posterVertical || event.posterImage;
  const hasAnyImage = wideImage || portraitImage;

  return (
    <div className={styles.page}>
      {/* Wide cover hero — full width, ~1.91:1 aspect */}
      {wideImage ? (
        <div className={styles.coverHero}>
          <Image 
            src={wideImage} 
            alt={event.title} 
            className={styles.coverHeroImage} 
            fill 
            priority 
            sizes="100vw"
            style={{ objectFit: 'cover' }}
          />
        </div>
      ) : portraitImage ? (
        /* Portrait fallback — centered, 4:5 (existing behavior for old events) */
        <div className={styles.posterHero}>
          <Image 
            src={portraitImage} 
            alt={event.title} 
            className={styles.posterHeroImage} 
            fill 
            priority 
            sizes="(max-width: 768px) 100vw, 600px"
            style={{ objectFit: 'cover' }}
          />
        </div>
      ) : (
        /* Gradient fallback — no image at all */
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

      {/* Title bar — shown below any image hero */}
      {hasAnyImage && (
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
              {lineupArtists.length > 0 ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                    gap: 'var(--space-3)',
                    justifyContent: 'flex-start',
                    alignItems: 'stretch',
                    marginTop: 'var(--space-4)',
                  }}
                >
                  {lineupArtists.map((artist) => (
                    <ArtistCard key={artist.id} artist={artist} variant="lineup" returnTo={`/events/${event.slug || event.id}`} />
                  ))}
                </div>
              ) : (
                <div className={styles.lineupGrid}>
                  {event.lineup.map(name => (
                    <div key={name} className={styles.lineupChip}>{name}</div>
                  ))}
                </div>
              )}
            </div>

            {/* Event Description */}
            {event.description[locale] && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>{t('events.about')}</h2>
                <div className={styles.description}>
                  {event.description[locale]}
                </div>
              </div>
            )}

            {/* Actions — interactions + ticket */}
            <div className={styles.section}>
              <EventActions
                eventId={event.id}
                eventSlug={event.slug}
                ticketUrl={event.ticketUrl}
                ticketProvider={event.ticketProvider}
                isFree={event.isFree}
                isPast={event.isPast}
              />
            </div>

            {/* Ticket Checkout Section (Feature Flagged) */}
            {enableCheckout && ticketTypes.length > 0 && !event.isPast && (
              <div className={styles.section} id="tickets">
                <TicketPurchaseSection 
                  event={event} 
                  ticketTypes={ticketTypes} 
                />
              </div>
            )}

            {/* Discussion Section */}
            <EventDiscussion eventId={event.id} />
          </div>

          {/* Sidebar */}
          <aside className={styles.sidebar}>
            {/* Sidebar content removed for now */}
          </aside>
        </div>
      </div>
    </div>
  );
}
