import { Artist } from '@/data/artists';
import { useI18n } from '@/i18n';
import styles from './ArtistCard.module.css';
import Link from 'next/link';
import { getFlagUrl } from '@/lib/utils';

interface ArtistCardProps {
  artist: Artist;
}

export default function ArtistCard({ artist }: ArtistCardProps) {
  const { t, locale } = useI18n();

  return (
    <Link href={`/artists/${artist.slug}`} className={styles.cardLink}>
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
          <h3 className={styles.name}>
            {artist.name}
            {artist.country_code && (
              <img 
                src={getFlagUrl(artist.country_code, 20)} 
                alt={artist.country_code}
                title={artist.country_code}
                style={{ 
                  height: '0.8rem', 
                  width: 'auto',
                  marginLeft: '0.4rem', 
                  verticalAlign: 'middle',
                  borderRadius: '1px'
                }} 
              />
            )}
          </h3>
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
