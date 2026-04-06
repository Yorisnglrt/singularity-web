'use client';

import { Artist } from '@/data/artists';
import { useI18n } from '@/i18n';
import styles from './ArtistCardDeck.module.css';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';

interface ArtistCardDeckProps {
  artists: Artist[];
}

export default function ArtistCardDeck({ artists }: ArtistCardDeckProps) {
  const { t } = useI18n();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Mobile Swipe Logic
  const handleDragEnd = (event: any, info: any) => {
    const threshold = 50;
    if (info.offset.x < -threshold && activeIndex < artists.length - 1) {
      setActiveIndex(prev => prev + 1);
    } else if (info.offset.x > threshold && activeIndex > 0) {
      setActiveIndex(prev => prev - 1);
    }
  };

  const renderCardContent = (artist: Artist, tier: 'active' | 'neighbor' | 'default') => (
    <>
      {/* Photo Container 4:3 */}
      <div className={styles.photoContainer}>
        {artist.photoUrl ? (
          <img src={artist.photoUrl} alt={artist.name} className={styles.photo} />
        ) : (
          <div className={styles.photo} style={{ background: artist.avatarGradient }} />
        )}
        <div className={styles.overlay} />
      </div>

      {/* Details Area */}
      <div className={styles.details}>
        <motion.h3 
          className={styles.name}
          animate={{ 
            scale: tier === 'active' ? 1.1 : 1,
            color: tier === 'active' ? 'var(--color-accent-primary)' : 'var(--color-text-primary)'
          }}
        >
          {artist.name}
        </motion.h3>
        
        <div className={styles.cardDivider} />
        
        <div className={styles.socialRow}>
          {artist.socialLinks.soundcloud && (
            <div className={styles.socialIcon} title="SoundCloud">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.562 13.922c0 .4-.008.79-.026 1.18-.016.353-.05.7-.098 1.042-.046.33-.11.644-.192.95-.083.303-.178.59-.286.862-.11.272-.232.522-.363.754-.132.228-.276.438-.43.626-.153.187-.318.348-.49.486-.17.135-.353.245-.544.333-.188.087-.384.152-.587.194-.197.042-.4.07-.607.08-.204.01-.41.018-.614.018h-5.267v-10.43c.478 0 .937.1 1.368.303.414.195.776.468 1.077.81.285.322.497.712.632 1.157.132.428.2 1.01.2 1.74zM24 16.32c0 .138-.01.275-.03.41-.02.132-.054.26-.098.384-.047.125-.104.24-.173.348-.068.106-.15.202-.243.287-.094.084-.2.155-.316.21-.115.056-.24.1-.372.13-.132.032-.27.048-.415.048H12.646c-.015-.4-.023-.8-.023-1.196s.01-1.072.03-1.46c.03-.54.103-1.05.215-1.52.112-.475.27-.905.47-1.29.21-.383.456-.713.738-.988.29-.276.623-.497.994-.664.383-.173.804-.26 1.263-.26.24 0 .47.026.69.076.222.052.43.127.625.226.2.098.386.216.556.353.176.138.334.298.473.473.14.175.264.368.373.576.108.204.2.42.274.646.073.22.13.45.168.685l.033.22s.225-.262.47-.46c.26-.21.564-.383.914-.525.35-.142.748-.214 1.193-.214.542 0 1.033.106 1.474.316.44.208.82.51 1.144.9.324.39.57.86.738 1.41.173.553.26 1.17.26 1.854z"></path>
              </svg>
            </div>
          )}
          {artist.socialLinks.instagram && (
            <div className={styles.socialIcon} title="Instagram">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
              </svg>
            </div>
          )}
        </div>
      </div>

      {tier === 'active' && artist.isCrew && <div className={styles.crewBadge}>CREW</div>}
    </>
  );

  const getTier = (index: number, current: number | null): 'active' | 'neighbor' | 'default' => {
    if (current === null) return 'default';
    if (index === current) return 'active';
    if (Math.abs(index - current) === 1) return 'neighbor';
    return 'default';
  };

  const getAnimationProps = (tier: 'active' | 'neighbor' | 'default') => {
    switch (tier) {
      case 'active':
        return { scale: 1.15, zIndex: 100, y: -25, opacity: 1, filter: 'grayscale(0%) brightness(1)' };
      case 'neighbor':
        return { scale: 1.05, zIndex: 30, y: -5, opacity: 0.9, filter: 'grayscale(20%) brightness(0.9)' };
      default:
        return { scale: 0.95, zIndex: 10, y: 0, opacity: 0.7, filter: 'grayscale(60%) brightness(0.75)' };
    }
  };

  if (isMobile) {
    return (
      <div className={styles.deckContainer}>
        <div className={styles.mobileCarousel}>
          <motion.div 
            className={styles.carouselInner}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={handleDragEnd}
            animate={{ x: `calc(50% - 45vw - ${activeIndex * (475 + 16)}px)` }} // Center the 90vw card
            transition={{ type: 'spring', damping: 25, stiffness: 120 }}
          >
            {artists.map((artist, index) => {
              const tier = getTier(index, activeIndex);
              const animProps = getAnimationProps(tier);
              
              return (
                <Link 
                  key={artist.id} 
                  href={`/artists/${artist.id}`}
                  className={`${styles.carouselCard} ${tier === 'active' ? styles.mobileActiveCard : ''}`}
                >
                  <motion.div
                    animate={animProps}
                    transition={{ duration: 0.4 }}
                  >
                    {renderCardContent(artist, tier)}
                  </motion.div>
                </Link>
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
      <div className={styles.fanLayout} onMouseLeave={() => setHoveredIndex(null)}>
        {artists.map((artist, index) => {
          const tier = getTier(index, hoveredIndex);
          const animProps = getAnimationProps(tier);
          
          return (
            <Link 
              key={artist.id} 
              href={`/artists/${artist.id}`} 
              className={`${styles.fanCard} ${tier === 'active' ? styles.fanCardActive : ''}`}
              onMouseEnter={() => setHoveredIndex(index)}
              style={{ zIndex: animProps.zIndex }}
            >
              <motion.div
                animate={animProps}
                transition={{ type: 'spring', damping: 20, stiffness: 100 }}
              >
                {renderCardContent(artist, tier)}
              </motion.div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
