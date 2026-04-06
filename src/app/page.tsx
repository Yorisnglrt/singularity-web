'use client';

import { useI18n } from '@/i18n';
import Hero from '@/components/Hero';
import EventCard from '@/components/EventCard';
import ArtistShowcase from '@/components/ArtistShowcase';
import MixPlayer from '@/components/MixPlayer';
import { useEffect, useMemo, useState } from 'react';
import { Event as AppEvent } from '@/data/events';
import { Artist } from '@/data/artists';
import { Mix } from '@/data/mixes';
import { normalizeEvent, normalizeArtist, normalizeMix } from '@/lib/data-normalization';
import styles from './page.module.css';

export default function Home() {
  const { t } = useI18n();
  const [activeMix, setActiveMix] = useState<string | null>(null);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [mixes, setMixes] = useState<Mix[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [evRes, artRes, mixRes] = await Promise.all([
          fetch('/api/events', { cache: 'no-store' }),
          fetch('/api/artists', { cache: 'no-store' }),
          fetch('/api/mixes', { cache: 'no-store' })
        ]);

        const [evData, artData, mixData] = await Promise.all([
          evRes.json(),
          artRes.json(),
          mixRes.json()
        ]);

        setEvents(Array.isArray(evData) ? evData.map(normalizeEvent) : []);
        setArtists(Array.isArray(artData) ? artData.map(normalizeArtist) : []);
        setMixes(Array.isArray(mixData) ? mixData.map(normalizeMix) : []);
      } catch (err) {
        console.error('Home data fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const upcomingEvents = events.filter(e => !e.isPast);

  // Unified Artist List: Crew (A-Z) -> Invited (A-Z)
  const showcaseArtists = useMemo(() => {
    const crew = artists.filter(a => a.isCrew).sort((a, b) => a.name.localeCompare(b.name));
    const invited = artists.filter(a => !a.isCrew).sort((a, b) => a.name.localeCompare(b.name));
    return [...crew, ...invited];
  }, [artists]);
  
  // Group mixes by eventId (omitted for brevity)
  
  // Group mixes by eventId
  const mixesByEvent = useMemo(() => {
    const groups: Record<string, Mix[]> = {};
    mixes.forEach(mix => {
      if (!groups[mix.eventId]) groups[mix.eventId] = [];
      groups[mix.eventId].push(mix);
    });
    return groups;
  }, [mixes]);

  // Auto-open first event's mixes if not already set
  useEffect(() => {
    if (!openEventId && Object.keys(mixesByEvent).length > 0) {
      setOpenEventId(Object.keys(mixesByEvent)[0]);
    }
  }, [mixesByEvent, openEventId]);

  return (
    <>
      <Hero />

      {/* Next Event - Featured */}
      {upcomingEvents[0] && (
        <section className={`section ${styles.section}`} id="next-event">
          <div className="container">
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTag}>◈ {t('home.nextEvent')}</span>
            </div>
            <EventCard event={upcomingEvents[0]} featured />
          </div>
        </section>
      )}

      {/* Manifesto */}
      <section className={`section ${styles.section}`} id="manifesto">
        <div className="container">
          <div className={styles.manifesto}>
            <h2 className={styles.manifestoTitle}>{t('home.manifesto.title')}</h2>
            <div className="divider" style={{ maxWidth: 200, margin: '0 auto' }} />
            <p className={styles.manifestoText}>{t('home.manifesto.text')}</p>
          </div>
        </div>
      </section>

      {/* Explore Artists - Unified Row */}
      <section className={`section ${styles.section}`} id="artist-spotlight" style={{ paddingBottom: 'var(--space-20)' }}>
        <ArtistShowcase 
          artists={showcaseArtists} 
          title={t('home.spotlight')} 
          showDiamond 
        />
      </section>

      {/* Latest Mixes */}
      {Object.keys(mixesByEvent).length > 0 && (
        <section className={`section ${styles.section}`} id="latest-mixes">
          <div className="container">
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTag}>◈ {t('home.latestMixes')}</span>
              <a href="/mixes" className="btn btn-ghost">{t('nav.mixes')} →</a>
            </div>
            
            {Object.entries(mixesByEvent).map(([eventId, eventMixes]) => {
              const event = events.find(e => e.id === eventId);
              const eventTitle = event ? event.title : eventId;
              const eventDate = event ? new Date(event.date).toLocaleDateString() : '';
              const isOpen = openEventId === eventId;

              return (
                <div key={eventId} className={styles.accordionContainer} style={{ marginBottom: 'var(--space-4)' }}>
                  <div 
                    className={`${styles.accordionHeader} ${isOpen ? styles.accordionOpen : ''}`} 
                    onClick={() => setOpenEventId(isOpen ? null : eventId)}
                  >
                    <div className={styles.folderInfo}>
                      <span className={styles.folderIcon}>{isOpen ? '📂' : '📁'}</span>
                      <span className={styles.folderTitle}>{eventTitle}</span>
                      <span className={styles.folderDate}>{eventDate}</span>
                    </div>
                    <span className={styles.folderToggle}>{isOpen ? '−' : '+'}</span>
                  </div>

                  {isOpen && (
                    <div className={styles.accordionBody}>
                      <div className={styles.mixList}>
                        {eventMixes.map(mix => (
                          <div key={mix.id} className={styles.mixWrapper}>
                            <span className={styles.mixLabelBadge}>{mix.label}</span>
                            <MixPlayer
                              mix={mix}
                              isActive={activeMix === mix.id}
                              onPlay={setActiveMix}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Membership Teaser */}
      <section className={`section ${styles.section}`} id="membership-teaser">
        <div className="container">
          <div className={styles.membershipTeaser}>
            <div className={styles.membershipGlow} />
            <h2 className={styles.membershipTitle}>{t('home.membership.title')}</h2>
            <p className={styles.membershipText}>{t('home.membership.text')}</p>
            <a href="/membership" className="btn btn-primary" id="home-cta-membership">
              {t('membership.join')}
            </a>
          </div>
        </div>
      </section>

      {loading && (
        <div className={styles.loadingOverlay}>
           <div className={styles.loadingSpinner}>◈</div>
        </div>
      )}
    </>
  );
}
