'use client';

import { Artist } from '@/data/artists';
import { useI18n } from '@/i18n';
import styles from './ArtistCardDeck.module.css';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';

interface ArtistCardDeckProps {
  artists: Artist[];
}

export default function ArtistCardDeck({ artists }: ArtistCardDeckProps) {
  const { t, locale } = useI18n();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mobile Swipe Logic
  const handleDragEnd = (event: any, info: any) => {
    const threshold = 50;
    if (info.offset.x < -threshold && activeIndex < artists.length - 1) {
      setActiveIndex(prev => prev + 1);
    } else if (info.offset.x > threshold && activeIndex > 0) {
      setActiveIndex(prev => prev - 1);
    }
  };

  const renderCardContent = (artist: Artist, isActive: boolean = false) => (
    <>
      {/* Photo */}
      <div className={styles.photoContainer}>
        {artist.photoUrl ? (
          <img src={artist.photoUrl} alt={artist.name} className={styles.photo} />
        ) : (
          <div className={styles.photo} style={{ background: artist.avatarGradient }} />
        )}
        <div className={styles.overlay} />
      </div>

      {/* Info */}
      <div className={styles.infoLayer}>
        <motion.h3 
          className={styles.name}
          animate={{ scale: isActive ? 1.2 : 1, opacity: isActive || !isMobile ? 1 : 0.6 }}
        >
          {artist.name}
        </motion.h3>
        <div className={styles.role}>
          {artist.isCrew ? t('artists.residents') : t('artists.newTalent')}
        </div>
      </div>

      {/* Badge */}
      {artist.isCrew && <div className={styles.crewBadge}>CREW</div>}
    </>
  );

  if (isMobile) {
    return (
      <div className={styles.deckContainer}>
        <div className={styles.mobileCarousel}>
          <motion.div 
            className={styles.carouselInner}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={handleDragEnd}
            animate={{ x: `calc(50% - 130px - ${activeIndex * (260 + 16)}px)` }}
            transition={{ type: 'spring', damping: 25, stiffness: 120 }}
          >
            {artists.map((artist, index) => {
              const isActive = index === activeIndex;
              return (
                <motion.div 
                  key={artist.id} 
                  className={`${styles.carouselCard} ${isActive ? styles.activeCard : ''}`}
                  animate={{ 
                    scale: isActive ? 1.05 : 0.85,
                    opacity: isActive ? 1 : 0.5,
                    rotateY: isActive ? 0 : (index < activeIndex ? 15 : -15)
                  }}
                  transition={{ duration: 0.4 }}
                  onClick={() => setActiveIndex(index)}
                >
                  {renderCardContent(artist, isActive)}
                </motion.div>
              );
            })}
          </motion.div>
        </div>

        {/* Indicators */}
        <div className={styles.swipeIndicator}>
          {artists.map((_, index) => (
            <div 
              key={index} 
              className={`${styles.dot} ${index === activeIndex ? styles.dotActive : ''}`} 
            />
          ))}
        </div>
      </div>
    );
  }

  // Desktop Fan Layout
  return (
    <div className={styles.deckContainer}>
      <div className={styles.fanLayout}>
        {artists.map((artist) => (
          <div key={artist.id} className={styles.fanCard}>
            {renderCardContent(artist)}
          </div>
        ))}
      </div>
    </div>
  );
}
