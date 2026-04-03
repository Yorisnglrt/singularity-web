'use client';

import { Artist } from '@/data/artists';
import { useI18n } from '@/i18n';
import styles from './ArtistCard.module.css';

interface ArtistCardProps {
  artist: Artist;
}

export default function ArtistCard({ artist }: ArtistCardProps) {
  const { t, locale } = useI18n();

  return (
    <article className={`${styles.card} card`} id={`artist-${artist.id}`}>
      <div
        className={styles.avatar}
        style={artist.photoUrl ? {} : { background: artist.avatarGradient }}
      >
        {artist.photoUrl ? (
          <img
            src={artist.photoUrl}
            alt={artist.name}
            className={styles.avatarPhoto}
          />
        ) : (
          <span className={styles.avatarInitial}>{artist.name[0]}</span>
        )}
        {artist.isNewTalent && (
          <div className={`tag tag--hot ${styles.talentBadge}`}>
            {t('artists.newTalent')}
          </div>
        )}
      </div>

      <div className={styles.info}>
        <h3 className={styles.name}>{artist.name}</h3>
        <p className={styles.bio}>{artist.bio[locale]}</p>

        <div className={styles.links}>
          {artist.socialLinks.soundcloud && (
            <a href={artist.socialLinks.soundcloud} className={styles.socialLink} target="_blank" rel="noopener noreferrer">
              SoundCloud
            </a>
          )}
          {artist.socialLinks.mixcloud && (
            <a href={artist.socialLinks.mixcloud} className={styles.socialLink} target="_blank" rel="noopener noreferrer">
              Mixcloud
            </a>
          )}
          {artist.socialLinks.instagram && (
            <a href={artist.socialLinks.instagram} className={styles.socialLink} target="_blank" rel="noopener noreferrer">
              Instagram
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
