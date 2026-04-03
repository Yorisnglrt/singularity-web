'use client';

import { useI18n } from '@/i18n';
import Hero from '@/components/Hero';
import EventCard from '@/components/EventCard';
import ArtistCard from '@/components/ArtistCard';
import MixPlayer from '@/components/MixPlayer';
import { upcomingEvents } from '@/data/events';
import { artists } from '@/data/artists';
import { mixes } from '@/data/mixes';
import { useState } from 'react';
import styles from './page.module.css';

export default function Home() {
  const { t } = useI18n();
  const [activeMix, setActiveMix] = useState<string | null>(null);
  const [openEventId, setOpenEventId] = useState<string | null>('labyrinth-takeover');
  const featuredArtists = artists;
  const latestMixes = mixes;

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

      {/* Artist Spotlight */}
      <section className={`section ${styles.section}`} id="artist-spotlight">
        <div className="container">
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>◈ {t('home.spotlight')}</span>
            <a href="/artists" className="btn btn-ghost">{t('nav.artists')} →</a>
          </div>
          <div className={styles.artistGrid}>
            {featuredArtists.map(artist => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </div>
        </div>
      </section>

      {/* Latest Mixes */}
      <section className={`section ${styles.section}`} id="latest-mixes">
        <div className="container">
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>◈ {t('home.latestMixes')}</span>
            <a href="/mixes" className="btn btn-ghost">{t('nav.mixes')} →</a>
          </div>
          
          <div className={styles.accordionContainer}>
            <div 
               className={`${styles.accordionHeader} ${openEventId === 'labyrinth-takeover' ? styles.accordionOpen : ''}`} 
               onClick={() => setOpenEventId(openEventId === 'labyrinth-takeover' ? null : 'labyrinth-takeover')}
            >
              <div className={styles.folderInfo}>
                <span className={styles.folderIcon}>{openEventId === 'labyrinth-takeover' ? '📂' : '📁'}</span>
                <span className={styles.folderTitle}>DNB Takeover Labyrinth</span>
                <span className={styles.folderDate}>27.03.2026</span>
              </div>
              <span className={styles.folderToggle}>{openEventId === 'labyrinth-takeover' ? '−' : '+'}</span>
            </div>

            {openEventId === 'labyrinth-takeover' && (
              <div className={styles.accordionBody}>
                <div className={styles.mixList}>
                  {latestMixes.filter(m => m.eventId === 'labyrinth-takeover').map(mix => (
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
        </div>
      </section>

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
    </>
  );
}
