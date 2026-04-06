'use client';

import { Artist } from '@/data/artists';
import { useI18n } from '@/i18n';
import styles from './ArtistStripCard.module.css';
import { motion, AnimatePresence } from 'framer-motion';

interface ArtistStripCardProps {
  artist: Artist;
}

export default function ArtistStripCard({ artist }: ArtistStripCardProps) {
  const { t, locale } = useI18n();

  return (
    <article className={styles.card} id={`artist-${artist.id}`}>
      {/* Background/Avatar Layer */}
      <div 
        className={styles.background}
        style={artist.photoUrl ? {} : { background: artist.avatarGradient }}
      >
        {artist.photoUrl && (
          <img 
            src={artist.photoUrl} 
            alt={artist.name} 
            className={styles.photo} 
          />
        )}
        <div className={styles.overlay} />
      </div>

      {/* Content Layer */}
      <div className={styles.content}>
        <div className={styles.header}>
          <h3 className={styles.name}>{artist.name}</h3>
          <span className={styles.role}>
            {artist.isCrew ? t('artists.residents') : t('artists.newTalent')}
          </span>
        </div>

        <div className={styles.expandedInfo}>
          <p className={styles.bio}>
            {artist.bio[locale]}
          </p>
          
          <div className={styles.links}>
            {artist.socialLinks.soundcloud && (
              <a href={artist.socialLinks.soundcloud} target="_blank" rel="noopener">SC</a>
            )}
            {artist.socialLinks.instagram && (
              <a href={artist.socialLinks.instagram} target="_blank" rel="noopener">IG</a>
            )}
          </div>
        </div>
      </div>

      {/* Badges */}
      {artist.isCrew && (
         <div className={styles.crewBadge}>CREW</div>
      )}
    </article>
  );
}
