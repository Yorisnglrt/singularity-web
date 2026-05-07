'use client';

import { useI18n } from '@/i18n';
import styles from './EventLocationMap.module.css';

interface Props {
  venue: string;
  city?: string;
}

export default function EventLocationMap({ venue, city = 'Oslo' }: Props) {
  const { t } = useI18n();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY;
  
  const query = `${venue} ${city}`;
  const encodedQuery = encodeURIComponent(query);
  
  const mapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
  const mapsDirUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedQuery}`;
  const embedUrl = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${encodedQuery}`;

  return (
    <div className={styles.locationCard}>
      <h2 className={styles.title}>{t('events.location')}</h2>
      {apiKey ? (
        <div className={styles.mapContainer}>
          <iframe
            className={styles.iframe}
            src={embedUrl}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Event Location Map"
          />
        </div>
      ) : (
        <div className={styles.fallbackInfo}>
          <div className={styles.locationInfo}>
            <span className={styles.locationIcon}>◈</span>
            <p className={styles.venueName}>{venue}</p>
            <p className={styles.venueCity}>{city}, Norway</p>
          </div>
        </div>
      )}
      
      <div className={styles.locationActions}>
        <a 
          href={mapsSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary btn-sm"
          style={{ width: '100%' }}
        >
          {t('events.openInMaps')}
        </a>
        <a 
          href={mapsDirUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
          style={{ width: '100%' }}
        >
          {t('events.planRoute')}
        </a>
      </div>
    </div>
  );
}
