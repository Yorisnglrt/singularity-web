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
    <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor">
      <rect x="0" y="12" width="0.8" height="3" />
      <rect x="1.8" y="11" width="0.8" height="5" />
      <rect x="3.6" y="10" width="0.8" height="7" />
      <rect x="5.4" y="9" width="0.8" height="9" />
      <rect x="7.2" y="10" width="0.8" height="7" />
      <rect x="9" y="11" width="0.8" height="5" />
      <path d="M24 13.5c0-2.2-1.8-4-4-4-.5 0-1 .1-1.4.3-.8-1.4-2.3-2.3-4-2.3-2.5 0-4.5 2-4.6 4.5h-.1c-1.4 0-2.5 1.1-2.5 2.5s1.1 2.5 2.5 2.5h11.1c1.7 0 3-1.3 3-3z" />
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
