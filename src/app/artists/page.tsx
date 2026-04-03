'use client';

import { useI18n } from '@/i18n';
import ArtistCard from '@/components/ArtistCard';
import { crew, invitedGuests } from '@/data/artists';
import styles from './page.module.css';

export default function ArtistsPage() {
  const { t } = useI18n();

  return (
    <div className={styles.page}>
      <div className="container">
        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>{t('artists.title')}</h1>
          <p className={styles.subtitle}>SINGULARITY COLLECTIVE — ROSTER</p>
        </div>

        {/* Residents */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>◈ {t('artists.residents')}</span>
            <span className={styles.sectionCount}>{crew.length}</span>
          </div>
          <div className={styles.grid}>
            {crew.map(artist => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </div>
        </section>

        {/* New Talent / Invited Guests */}
        {invitedGuests.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTag}>◈ {t('artists.newTalent')}</span>
              <span className={styles.sectionCount}>{invitedGuests.length}</span>
            </div>
            <div className={styles.grid}>
              {invitedGuests.map(artist => (
                <ArtistCard key={artist.id} artist={artist} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
