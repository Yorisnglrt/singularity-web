'use client';

import { normalizeArtist } from '@/lib/data-normalization';
import { useI18n } from '@/i18n';
import styles from './ArtistProfile.module.css';
import Link from 'next/link';
import { notFound, useParams, useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { getFlagUrl } from '@/lib/utils';


function ArtistProfileContent() {
  const { locale, t } = useI18n();
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params?.slug as string;
  const fromParam = searchParams?.get('from');

  // Validate fromParam to ensure it's an internal relative path starting with /
  const isValidFrom = fromParam && fromParam.startsWith('/') && !fromParam.startsWith('//');
  const backHref = isValidFrom ? fromParam : '/#artist-spotlight';
  
  // Dynamic back label
  const isFromEvent = isValidFrom && fromParam.startsWith('/events/');
  const isFromArtists = isValidFrom && fromParam === '/artists';
  
  const backLabel = isFromEvent 
    ? 'BACK TO EVENT' 
    : isFromArtists 
      ? 'BACK TO ARTISTS'
      : (t('nav.backToShowcase') || 'BACK TO SHOWCASE');

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

      {/* Dynamic Back Link */}
      <Link href={backHref} className={styles.backLink}>
        <span>←</span>
        <span>{backLabel}</span>
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

export default function ArtistProfilePage() {
  return (
    <Suspense fallback={
      <main className={styles.profileWrapper}>
        <div style={{color:'#555',textAlign:'center',marginTop:'40vh'}}>◈</div>
      </main>
    }>
      <ArtistProfileContent />
    </Suspense>
  );
}

function SoundCloudIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z" />
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
