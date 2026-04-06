'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n';
import ArtistCard from '@/components/ArtistCard';
import { Artist } from '@/data/artists';
import { normalizeArtist } from '@/lib/data-normalization';
import styles from './page.module.css';

export default function ArtistsPage() {
  const { t } = useI18n();
  const [artists, setArtists] = useState<any[]>([]);
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

  const allSortedArtists = useMemo(() => {
    const normalized = artists.map(normalizeArtist);
    return normalized.sort((a, b) => a.name.localeCompare(b.name));
  }, [artists]);

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>{t('artists.title')}</h1>
          <p className={styles.subtitle}>SINGULARITY COLLECTIVE — FULL ROSTER</p>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>◈ {t('artists.allArtists')}</span>
            <span className={styles.sectionCount}>{allSortedArtists.length}</span>
          </div>
          <div className={styles.grid}>
            {allSortedArtists.map((artist) => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </div>
        </section>

        {!loading && allSortedArtists.length === 0 && (
          <p className={styles.noData}>No artists found.</p>
        )}
      </div>
    </div>
  );
}
