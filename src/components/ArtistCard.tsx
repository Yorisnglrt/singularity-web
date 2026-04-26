import { Artist } from '@/data/artists';
import { useI18n } from '@/i18n';
import styles from './ArtistCard.module.css';
import Link from 'next/link';
import { getFlagUrl } from '@/lib/utils';

interface ArtistCardProps {
  artist: Artist;
  compact?: boolean;
}

export default function ArtistCard({ artist, compact = false }: ArtistCardProps) {
  const { t, locale } = useI18n();

  return (
    <Link 
      href={`/artists/${artist.slug}`} 
      className={`${styles.cardLink} ${compact ? styles.compactCardLink : ''}`}
    >
      <article 
        className={`${styles.card} ${compact ? styles.compactCard : ''} card`} 
        id={`artist-${artist.id}`}
      >
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

        <div className={styles.info} style={{ alignItems: 'center', textAlign: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
            <h3 className={styles.name}>{artist.name}</h3>
            {artist.country_code && (
              <img 
                src={getFlagUrl(artist.country_code)} 
                alt={artist.country_code}
                title={artist.country_code}
                style={{ 
                  height: '0.9rem', 
                  width: 'auto',
                  borderRadius: '1px',
                  display: 'block'
                }} 
              />
            )}
          </div>
          <p className={styles.bio} style={{ width: '100%' }}>{artist.bio[locale]}</p>

          <div className={styles.links} style={{ justifyContent: 'center', width: '100%' }}>
            {artist.socialLinks.soundcloud && (
              <span className={styles.socialLink}>SoundCloud</span>
            )}
            {artist.socialLinks.mixcloud && (
              <span className={styles.socialLink}>Mixcloud</span>
            )}
            {artist.socialLinks.instagram && (
              <span className={styles.socialLink}>Instagram</span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}
