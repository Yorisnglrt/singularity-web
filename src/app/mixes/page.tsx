'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n';
import MixPlayer from '@/components/MixPlayer';
import { mixes } from '@/data/mixes';
import styles from './page.module.css';

export default function MixesPage() {
  const { t } = useI18n();
  const [activeMix, setActiveMix] = useState<string | null>(null);
  const [openEventId, setOpenEventId] = useState<string | null>('labyrinth-takeover');

  const filtered = mixes;

  return (
    <div className={styles.page}>
      <div className="container">
        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>{t('mixes.title')}</h1>
          <p className={styles.subtitle}>SINGULARITY SOUND ARCHIVE</p>
        </div>

        {/* Mix list Accordion */}
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
                {mixes.filter(m => m.eventId === 'labyrinth-takeover').map(mix => (
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
    </div>
  );
}
