'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n';
import styles from './page.module.css';

type RawMix = {
  id: string;
  title: string;
  artist: string;
  eventId: string;
  event_id?: string;
  label?: string;
  duration?: string;
  date: string;
  coverGradient?: string;
  audioSrc?: string;
  soundcloudUrl?: string;
};

export default function MixesPage() {
  const { t } = useI18n();
  const [mixes, setMixes] = useState<RawMix[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMix, setExpandedMix] = useState<string | null>(null);

  useEffect(() => {
    const loadMixes = async () => {
      try {
        const res = await fetch('/api/mixes', { cache: 'no-store' });
        const data = await res.json();

        if (!res.ok) {
          console.error('Failed to load mixes:', data?.error);
          setError(data?.error || 'Failed to load mixes');
          setMixes([]);
          return;
        }

        const mixesData = Array.isArray(data) ? data : [];
        setMixes(mixesData);
      } catch (err: unknown) {
        console.error('Mixes fetch error:', err);
        setError(err instanceof Error ? err.message : 'Network error');
        setMixes([]);
      } finally {
        setLoading(false);
      }
    };

    loadMixes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizedMixes = useMemo(() => {
    return mixes.map(mix => ({
      ...mix,
      eventId: mix.eventId ?? mix.event_id ?? 'unknown',
      label: mix.label || 'Full set',
      coverGradient: mix.coverGradient || 'linear-gradient(135deg, #0a0a14, #1a1a2e)',
    }));
  }, [mixes]);

  const toggleExpand = (id: string) => {
    setExpandedMix(prev => prev === id ? null : id);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>{t('mixes.title')}</h1>
          <p className={styles.subtitle}>SINGULARITY SOUND ARCHIVE</p>
        </div>

        {loading ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>◈</span>
            <p>Loading archive...</p>
          </div>
        ) : error ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>⚠</span>
            <p>Could not load mixes. Please try again.</p>
          </div>
        ) : normalizedMixes.length > 0 ? (
          <div className={styles.mixList}>
            {normalizedMixes.map(mix => {
              const isExpanded = expandedMix === mix.id;
              const hasSoundcloud = !!mix.soundcloudUrl;

              return (
                <div 
                  key={mix.id} 
                  className={`${styles.mixCard} ${isExpanded ? styles.mixCardExpanded : ''}`}
                >
                  {/* Cover gradient strip */}
                  <div className={styles.coverStrip} style={{ background: mix.coverGradient }} />

                  {/* Card header */}
                  <div className={styles.cardHeader}>
                    <div className={styles.cardHeaderLeft}>
                      <h3 className={styles.mixTitle}>{mix.title}</h3>
                      <p className={styles.mixArtist}>{mix.artist}</p>
                    </div>
                    <div className={styles.cardHeaderRight}>
                      <span className={styles.mixLabelBadge}>{mix.label}</span>
                    </div>
                  </div>

                  {/* Card meta row */}
                  <div className={styles.cardMeta}>
                    <span className={styles.metaItem}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                      {formatDate(mix.date)}
                    </span>
                    {mix.duration && (
                      <span className={styles.metaItem}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        {mix.duration}
                      </span>
                    )}
                    {hasSoundcloud && (
                      <span className={styles.metaSoundcloud}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M1 18v-6h2v6H1zm3-8v8h2v-8H4zm3 2v6h2v-6H7zm3-4v10h2V8h-2zm3 2v8h2v-8h-2zm3-3v11h2V7h-2zm3 1v10h2V8h-2z"/></svg>
                        SoundCloud
                      </span>
                    )}
                  </div>

                  {/* Player area */}
                  <div className={styles.playerArea}>
                    {hasSoundcloud ? (
                      <>
                        {isExpanded ? (
                          <div className={styles.scEmbedWrapper}>
                            <iframe 
                              width="100%" 
                              height="166" 
                              scrolling="no" 
                              frameBorder="no" 
                              allow="autoplay" 
                              src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(mix.soundcloudUrl!)}&color=%2300ffb2&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false`}
                              className={styles.scIframe}
                            />
                            <button 
                              className={styles.collapseBtn} 
                              onClick={() => toggleExpand(mix.id)}
                              aria-label="Collapse player"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15" /></svg>
                              Hide player
                            </button>
                          </div>
                        ) : (
                          <button 
                            className={styles.listenBtn}
                            onClick={() => toggleExpand(mix.id)}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                            Listen on SoundCloud
                          </button>
                        )}
                      </>
                    ) : (
                      <div className={styles.noPlayer}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                        External player link missing
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>◈</span>
            <p>No mixes found</p>
          </div>
        )}
      </div>
    </div>
  );
}
