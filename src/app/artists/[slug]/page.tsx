'use client';

import { normalizeArtist } from '@/lib/data-normalization';
import { useI18n } from '@/i18n';
import styles from './ArtistProfile.module.css';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getFlagEmoji, getFlagUrl } from '@/lib/utils';

export default function ArtistProfilePage() {
  const { locale, t } = useI18n();
  const params = useParams();
  const slug = params?.slug as string;

  const [artist, setArtist] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/artists', { cache: 'no-store' });
        const data = await res.json();
        if (Array.isArray(data)) {
          const raw = data.find((a: any) => (a.slug || a.id) === slug);
          if (raw) setArtist(normalizeArtist(raw));
        }
      } catch (err) {
        console.error('Artist fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    if (slug) load();
  }, [slug]);

  if (loading) {
    return <main className={styles.profileWrapper}><div style={{color:'#555',textAlign:'center',marginTop:'40vh'}}>◈</div></main>;
  }

  if (!artist) {
    notFound();
  }

  let bioRaw = artist.bio[locale] || artist.bio['en'] || '';
  const bio = typeof bioRaw === 'string' ? bioRaw : JSON.stringify(bioRaw);

  return (
    <main className={styles.profileWrapper}>
      {/* Subtle Atmospheric Haze Background */}
      <div 
        className={styles.haze} 
        style={{ background: artist.avatarGradient }} 
      />

      {/* Back Link to Spotlight Section on Homepage */}
      <Link href="/#artist-spotlight" className={styles.backLink}>
        <span>←</span>
        <span>{t('nav.backToShowcase') || 'BACK TO SHOWCASE'}</span>
      </Link>

      <div className={styles.content}>
        {/* Left: Hero Image / Visual with Physical Frame */}
        <div className={styles.heroContainer}>
          {artist.photoUrl ? (
            <img 
              src={artist.photoUrl} 
              alt={artist.name} 
              className={styles.portraitPhoto} 
            />
          ) : (
            <div 
              className={styles.portraitPhoto} 
              style={{ background: artist.avatarGradient }} 
            />
          )}
          <div className={styles.heroGlow} />
        </div>

        {/* Right: Info & Branding */}
        <div className={styles.infoPanel}>
          <div className={styles.badgeRow}>
            {artist.isCrew ? (
              <span className={`${styles.badge} ${styles.crewBadge}`}>CREW</span>
            ) : (
              <span className={`${styles.badge} ${styles.invitedBadge}`}>INVITED GUEST</span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
            <h1 className={styles.artistName}>{artist.name}</h1>
            {artist.country_code && (
              <img 
                src={getFlagUrl(artist.country_code)} 
                alt={artist.country_code}
                title={artist.country_code}
                style={{ 
                  height: '1.4rem', 
                  width: 'auto',
                  borderRadius: '2px',
                  boxShadow: '0 0 10px rgba(255,255,255,0.1)'
                }} 
              />
            )}
          </div>

          <div className={styles.bioBox}>
            <p>{bio}</p>
          </div>

          <div className={styles.socialRow}>
            {artist.socialLinks.soundcloud && (
              <a 
                href={artist.socialLinks.soundcloud} 
                target="_blank" 
                rel="noopener noreferrer"
                className={`${styles.socialBtn} ${styles.soundcloud}`}
              >
                <SoundCloudIcon />
                <span>SoundCloud</span>
              </a>
            )}
            {artist.socialLinks.instagram && (
              <a 
                href={artist.socialLinks.instagram} 
                target="_blank" 
                rel="noopener noreferrer"
                className={`${styles.socialBtn} ${styles.instagram}`}
              >
                <InstagramIcon />
                <span>Instagram</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function SoundCloudIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 100 100" fill="currentColor">
      <path d="M3.7,55c-0.6,0-1,0.5-1,1.1v9.8c0,0.6,0.5,1.1,1,1.1s1-0.5,1-1.1v-9.8C4.7,55.5,4.3,55,3.7,55z"/>
      <path d="M10,51.8c-0.6,0-1,0.5-1,1.1v16.1c0,0.6,0.5,1.1,1,1.1s1-0.5,1-1.1V52.9C11,52.3,10.6,51.8,10,51.8z"/>
      <path d="M16.3,47.9c-0.6,0-1,0.5-1,1.1V71c0,0.6,0.5,1.1,1,1.1s1-0.5,1-1.1V49C17.3,48.4,16.9,47.9,16.3,47.9z"/>
      <path d="M22.6,48.3c-0.6,0-1,0.5-1,1.1v21.1c0,0.6,0.5,1.1,1,1.1s1-0.5,1-1.1V49.4C23.7,48.8,23.2,48.3,22.6,48.3z"/>
      <path d="M29,51.8c-0.6,0-1,0.5-1,1.1v16.1c0,0.6,0.5,1.1,1,1.1s1-0.5,1-1.1V52.9C30,52.3,29.6,51.8,29,51.8z"/>
      <path d="M35.3,50.1c-0.6,0-1,0.5-1,1.1V70c0,0.6,0.5,1.1,1,1.1s1-0.5,1-1.1V51.3C36.3,50.7,35.9,50.1,35.3,50.1z"/>
      <path d="M41.6,41.9c-0.6,0-1,0.5-1,1.1v34.8c0,0.6,0.5,1.1,1,1.1s1-0.5,1-1.1V43C42.7,42.4,42.2,41.9,41.6,41.9z"/>
      <path d="M47.9,35.2c-0.6,0-1,0.5-1,1.1v48.2c0,0.6,0.5,1.1,1,1.1s1-0.5,1-1.1V36.3C49,35.7,48.5,35.2,47.9,35.2z"/>
      <path d="M96.3,60.8c0-5.4-4.4-9.8-9.8-9.8c-0.6,0-1.1,0-1.6,0.1c-1.3-4.1-5.1-7-9.6-7c-1.9,0-3.6,0.5-5.1,1.4c-1.2-2.3-3.7-3.9-6.5-3.9c-3,0-5.5,1.8-6.6,4.4c-0.6,0.1-1.3,0.1-1.9,0.1c-5.1,0-9.3,3.9-9.8,8.9V85.9c0.2,0,0.3,0,0.5,0h50.5c5.4,0,9.8-4.4,9.8-9.8C96.3,76.1,96.3,60.8,96.3,60.8z"/>
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
    </svg>
  );
}
