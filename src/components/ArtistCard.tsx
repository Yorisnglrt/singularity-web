import { Artist } from '@/data/artists';
import { useI18n } from '@/i18n';
import styles from './ArtistCard.module.css';
import Link from 'next/link';
import { getFlagUrl } from '@/lib/utils';

interface ArtistCardProps {
  artist: Artist;
  variant?: 'default' | 'compact' | 'lineup';
  compact?: boolean;
}

export default function ArtistCard({ artist, variant, compact = false }: ArtistCardProps) {
  const { t, locale } = useI18n();
  const effectiveVariant = variant || (compact ? 'compact' : 'default');
  const isLineup = effectiveVariant === 'lineup';
  const isCompact = effectiveVariant === 'compact';
  const isDefault = effectiveVariant === 'default';

  return (
    <Link 
      href={`/artists/${artist.slug}`} 
      className={`${styles.cardLink} ${styles[effectiveVariant + 'CardLink']}`}
    >
      <article 
        className={`${styles.card} ${styles[effectiveVariant + 'Card']} card`} 
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

        <div className={styles.info}>
          <div className={styles.nameRow}>
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
          <p className={styles.bio}>{artist.bio[locale]}</p>

          <div className={styles.links}>
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
