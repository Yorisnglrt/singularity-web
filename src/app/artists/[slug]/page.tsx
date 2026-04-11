'use client';

import { normalizeArtist } from '@/lib/data-normalization';
import { useI18n } from '@/i18n';
import styles from './ArtistProfile.module.css';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { getFlagEmoji } from '@/lib/utils';

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

          <h1 className={styles.artistName}>
            {artist.name} {artist.country_code && <span title={artist.country_code} style={{ marginLeft: '0.4rem', filter: 'drop-shadow(0 0 5px rgba(255,255,255,0.2))' }}>{getFlagEmoji(artist.country_code)}</span>}
          </h1>

          <div className={styles.bioBox}>
            <p>{bio}</p>
          </div>

          <div className={styles.socialRow}>
            {artist.socialLinks.soundcloud && (
              <a 
                href={artist.socialLinks.soundcloud} 
                target="_blank" 
                rel="noopener noreferrer"
                className={styles.socialBtn}
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
                className={styles.socialBtn}
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
      <path d="M11.562 13.922c0 .4-.008.79-.026 1.18-.016.353-.05.7-.098 1.042-.046.33-.11.644-.192.95-.083.303-.178.59-.286.862-.11.272-.232.522-.363.754-.132.228-.276.438-.43.626-.153.187-.318.348-.49.486-.17.135-.353.245-.544.333-.188.087-.384.152-.587.194-.197.042-.4.07-.607.08-.204.01-.41.018-.614.018h-5.267v-10.43c.478 0 .937.1 1.368.303.414.195.776.468 1.077.81.285.322.497.712.632 1.157.132.428.2 1.01.2 1.74zM24 16.32c0 .138-.01.275-.03.41-.02.132-.054.26-.098.384-.047.125-.104.24-.173.348-.068.106-.15.202-.243.287-.094.084-.2.155-.316.21-.115.056-.24.1-.372.13-.132.032-.27.048-.415.048H12.646c-.015-.4-.023-.8-.023-1.196s.01-1.072.03-1.46c.03-.54.103-1.05.215-1.52.112-.475.27-.905.47-1.29.21-.383.456-.713.738-.988.29-.276.623-.497.994-.664.383-.173.804-.26 1.263-.26.24 0 .47.026.69.076.222.052.43.127.625.226.2.098.386.216.556.353.176.138.334.298.473.473.14.175.264.368.373.576.108.204.2.42.274.646.073.22.13.45.168.685l.033.22s.225-.262.47-.46c.26-.21.564-.383.914-.525.35-.142.748-.214 1.193-.214.542 0 1.033.106 1.474.316.44.208.82.51 1.144.9.324.39.57.86.738 1.41.173.553.26 1.17.26 1.854z"></path>
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
