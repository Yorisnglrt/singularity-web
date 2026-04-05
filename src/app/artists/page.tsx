'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n, Locale } from '@/i18n';
import ArtistCard from '@/components/ArtistCard';
import styles from './page.module.css';

type RawArtist = {
  id: string;
  name: string;
  photoUrl?: string;
  photo?: string;
  bio?: Record<string, string> | string | null;
  isCrew?: boolean;
  isInvited?: boolean;
  crew?: boolean;
  avatarGradient?: string;
  socialLinks?: {
    soundcloud?: string;
    mixcloud?: string;
    instagram?: string;
  };
  soundcloud?: string;
  mixcloud?: string;
  instagram?: string;
};

type PageArtist = {
  id: string;
  name: string;
  photoUrl?: string;
  bio: Record<Locale, string>;
  isCrew: boolean;
  isInvited: boolean;
  avatarGradient: string;
  socialLinks: {
    soundcloud?: string;
    mixcloud?: string;
    instagram?: string;
  };
};

function normalizeBio(bio: RawArtist['bio']): Record<Locale, string> {
  const fallback: Record<Locale, string> = {
    en: '',
    cs: '',
    no: '',
    pl: '',
    de: '',
  };

  if (!bio) return fallback;

  if (typeof bio === 'string') {
    try {
      const parsed = JSON.parse(bio) as Partial<Record<Locale, string>>;
      return {
        en: parsed.en ?? '',
        cs: parsed.cs ?? '',
        no: parsed.no ?? '',
        pl: parsed.pl ?? '',
        de: parsed.de ?? '',
      };
    } catch {
      return {
        en: bio,
        cs: bio,
        no: bio,
        pl: bio,
        de: bio,
      };
    }
  }

  return {
    en: bio.en ?? '',
    cs: bio.cs ?? '',
    no: bio.no ?? '',
    pl: bio.pl ?? '',
    de: bio.de ?? '',
  };
}

export default function ArtistsPage() {
  const { t } = useI18n();
  const [artists, setArtists] = useState<RawArtist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadArtists = async () => {
      try {
        const res = await fetch('/api/artists', { cache: 'no-store' });
        const data = await res.json();

        if (!res.ok) {
          console.error('Failed to load artists:', data?.error);
          setArtists([]);
          return;
        }

        setArtists(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Artists fetch error:', err);
        setArtists([]);
      } finally {
        setLoading(false);
      }
    };

    loadArtists();
  }, []);

  const normalizedArtists = useMemo<PageArtist[]>(() => {
    return artists.map((artist) => ({
      id: artist.id,
      name: artist.name,
      photoUrl: artist.photoUrl || artist.photo || undefined,
      bio: normalizeBio(artist.bio),
      isCrew: artist.isCrew ?? artist.crew ?? false,
      isInvited: artist.isInvited ?? !(artist.isCrew ?? artist.crew ?? false),
      avatarGradient: artist.avatarGradient || 'linear-gradient(135deg, #000, #333)',
      socialLinks: artist.socialLinks || {
        soundcloud: artist.soundcloud,
        mixcloud: artist.mixcloud,
        instagram: artist.instagram,
      },
    }));
  }, [artists]);

  const crew = normalizedArtists.filter((a) => a.isCrew);
  const invitedGuests = normalizedArtists.filter((a) => a.isInvited);

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>{t('artists.title')}</h1>
          <p className={styles.subtitle}>SINGULARITY COLLECTIVE — ROSTER</p>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>◈ {t('artists.residents')}</span>
            <span className={styles.sectionCount}>{crew.length}</span>
          </div>
          <div className={styles.grid}>
            {crew.map((artist) => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </div>
        </section>

        {invitedGuests.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTag}>◈ {t('artists.newTalent')}</span>
              <span className={styles.sectionCount}>{invitedGuests.length}</span>
            </div>
            <div className={styles.grid}>
              {invitedGuests.map((artist) => (
                <ArtistCard key={artist.id} artist={artist} />
              ))}
            </div>
          </section>
        )}

        {!loading && normalizedArtists.length === 0 && (
          <p>No artists found.</p>
        )}
      </div>
    </div>
  );
}
