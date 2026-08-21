'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { track } from '@vercel/analytics';
import { Artist } from '@/data/artists';
import ArtistCard from '@/components/ArtistCard';
import { Event, EventTicketType } from '@/data/events';
import EventActions from '@/components/EventActions';
import { resolveLineupArtists } from '@/lib/data-normalization';
import { useI18n } from '@/i18n';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import styles from './page.module.css';

// Lazy-load non-critical interactive components
const TicketPurchaseSection = dynamic(() => import('@/components/TicketPurchaseSection'), { ssr: false });
const EventDiscussion = dynamic(() => import('@/components/EventDiscussion'), { ssr: false });

interface Props {
  event: Event;
  artists: Artist[];
  ticketTypes: EventTicketType[];
  initialIsAdmin?: boolean;
}

export default function EventDetailClient({ event, artists, ticketTypes, initialIsAdmin }: Props) {
  const { t, locale } = useI18n();
  const { user, isLoading: isAuthLoading } = useAuth();
  const enableCheckout = process.env.NEXT_PUBLIC_ENABLE_TICKET_CHECKOUT === 'true';
  const hasTrackedTicketLandedRef = useRef(false);

  useEffect(() => {
    if (user?.isAdmin && typeof document !== 'undefined') {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.access_token) {
          document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=604800; SameSite=Lax`;
        }
      });
    }
  }, [user?.isAdmin]);

  // Handle reliable deep-link hash scrolling to #tickets with layout stability & retry protection
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;
    let attempts = 0;
    const maxAttempts = 15; // Max 1.5s retry duration

    const scrollToTickets = () => {
      if (typeof window === 'undefined') return;
      if (window.location.hash !== '#tickets') return;

      const element = document.getElementById('tickets');
      if (element) {
        rafId = requestAnimationFrame(() => {
          element.scrollIntoView({
            behavior: 'auto',
            block: 'start',
          });

          if (!hasTrackedTicketLandedRef.current) {
            hasTrackedTicketLandedRef.current = true;
            try {
              track('ticket_section_landed', {
                eventSlug: event.slug || event.id,
                ...(typeof document !== 'undefined' && document.referrer ? { referrer: document.referrer } : {}),
              });
            } catch (err) {
              console.warn('[Analytics] Failed to track ticket_section_landed:', err);
            }
          }
        });
        return;
      }

      // Retry if element is not in DOM yet (e.g. async components, test event auth check)
      attempts++;
      if (attempts < maxAttempts) {
        timeoutId = setTimeout(scrollToTickets, 100);
      }
    };

    if (typeof window !== 'undefined' && window.location.hash === '#tickets') {
      scrollToTickets();
    }

    const handleHashChange = () => {
      if (window.location.hash === '#tickets') {
        attempts = 0;
        scrollToTickets();
      }
    };

    window.addEventListener('hashchange', handleHashChange);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [event.slug, event.id, enableCheckout, ticketTypes.length, isAuthLoading, event.isPast]);

  // If this is a test event and server was not able to verify admin via cookies, verify via client auth
  if (event.isTestEvent && !initialIsAdmin) {
    if (isAuthLoading) {
      return (
        <div className={styles.page} style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>Loading event…</div>
        </div>
      );
    }

    if (!user || !user.isAdmin) {
      return (
        <div className={styles.page} style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '3rem 1rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '0.75rem', color: '#fff' }}>404</h1>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.75rem', fontSize: '1rem' }}>
            This event could not be found.
          </p>
          <Link href="/events" style={{
            background: 'var(--color-primary, #00ffb2)',
            color: '#000',
            padding: '0.65rem 1.4rem',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 800,
            fontSize: '0.85rem'
          }}>
            Back to events
          </Link>
        </div>
      );
    }
  }

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
      {event.isTestEvent && (
        <div style={{
          background: '#ff8c00',
          color: '#000',
          padding: '0.6rem 1rem',
          textAlign: 'center',
          fontWeight: 800,
          fontSize: '0.85rem',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 2px 10px rgba(0,0,0,0.5)'
        }}>
          ⚠ TEST EVENT — VISIBLE ONLY TO ADMINS
        </div>
      )}
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
              {event.isTestEvent && <span className="tag" style={{ background: '#ff8c00', color: '#000', fontWeight: 800 }}>TEST</span>}
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
              {event.isTestEvent && <span className="tag" style={{ background: '#ff8c00', color: '#000', fontWeight: 800 }}>TEST</span>}
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
                  {typeof event.venue === 'string' ? event.venue : (event.venue['en'] || event.venue[locale] || '')}
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
              <div className={`${styles.section} ${styles.ticketSection}`} id="tickets">
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
