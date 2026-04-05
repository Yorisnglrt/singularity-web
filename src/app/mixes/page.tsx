'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n';
import MixPlayer from '@/components/MixPlayer';
import styles from './page.module.css';

type RawMix = {
  id: string;
  title: string;
  artist: string;
  eventId: string;
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
  const [activeMix, setActiveMix] = useState<string | null>(null);
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  useEffect(() => {
    const loadMixes = async () => {
      try {
        const res = await fetch('/api/mixes', { cache: 'no-store' });
        const data = await res.json();

        if (!res.ok) {
          console.error('Failed to load mixes:', data?.error);
          setMixes([]);
          return;
        }

        const mixesData = Array.isArray(data) ? data : [];
        setMixes(mixesData);
        
        // Auto-open the first event category if exists
        if (mixesData.length > 0 && !openEventId) {
          setOpenEventId(mixesData[0].eventId);
        }
      } catch (err) {
        console.error('Mixes fetch error:', err);
        setMixes([]);
      } finally {
        setLoading(false);
      }
    };

    loadMixes();
  }, [openEventId]);

  const normalizedMixes = useMemo(() => {
    return mixes.map(mix => ({
      ...mix,
      label: mix.label || 'Full set',
      coverGradient: mix.coverGradient || 'linear-gradient(135deg, #222, #444)',
    }));
  }, [mixes]);

  // Group mixes by event (mocking title/date since we don't have a linked events table join here yet)
  // In a real scenario, we might want to fetch events too or join them in the API.
  // For now, we'll group by eventId and use the first mix's metadata or defaults.
  const groupedByEvent = useMemo(() => {
    const groups: Record<string, { title: string; date: string; mixes: any[] }> = {};
    
    normalizedMixes.forEach(mix => {
      if (!groups[mix.eventId]) {
        // Fallback titles for known event IDs from the original static data
        let eventTitle = mix.eventId.replace(/-/g, ' ').toUpperCase();
        if (mix.eventId === 'labyrinth-takeover') eventTitle = 'DNB Takeover Labyrinth';
        
        groups[mix.eventId] = {
          title: eventTitle,
          date: mix.date ? new Date(mix.date).toLocaleDateString() : 'TBA',
          mixes: []
        };
      }
      groups[mix.eventId].mixes.push(mix);
    });
    
    return groups;
  }, [normalizedMixes]);

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>{t('mixes.title')}</h1>
          <p className={styles.subtitle}>SINGULARITY SOUND ARCHIVE</p>
        </div>

        {loading ? (
          <div className={styles.empty}>
            <p>Loading archive...</p>
          </div>
        ) : Object.keys(groupedByEvent).length > 0 ? (
          Object.entries(groupedByEvent).map(([eventId, group]) => (
            <div key={eventId} className={styles.accordionContainer}>
              <div 
                 className={`${styles.accordionHeader} ${openEventId === eventId ? styles.accordionOpen : ''}`} 
                 onClick={() => setOpenEventId(openEventId === eventId ? null : eventId)}
              >
                <div className={styles.folderInfo}>
                  <span className={styles.folderIcon}>{openEventId === eventId ? '📂' : '📁'}</span>
                  <span className={styles.folderTitle}>{group.title}</span>
                  <span className={styles.folderDate}>{group.date}</span>
                </div>
                <span className={styles.folderToggle}>{openEventId === eventId ? '−' : '+'}</span>
              </div>

              {openEventId === eventId && (
                <div className={styles.accordionBody}>
                  <div className={styles.mixList}>
                    {group.mixes.map(mix => (
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
          ))
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
