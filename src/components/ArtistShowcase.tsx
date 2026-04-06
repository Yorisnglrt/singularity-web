'use client';

import { Artist } from '@/data/artists';
import { useI18n } from '@/i18n';
import styles from './ArtistShowcase.module.css';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

interface ArtistShowcaseProps {
  artists: Artist[];
  title: string;
  showDiamond?: boolean;
}

export default function ArtistShowcase({ artists, title, showDiamond }: ArtistShowcaseProps) {
  const { t } = useI18n();
  // Interaction State
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isMobile, setIsMobile] = useState(false);

  // Mobile Detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getDesktopStyles = (index: number) => {
    const distance = Math.abs(index - activeIndex);
    
    // Scale: 100% active, decay 1-4, stable 5+
    let scale = 1.0;
    if (distance > 0) {
      scale = distance <= 4 ? 1.0 - (distance * 0.08) : 0.68;
    }

    // Z-Index: Focused is always on top
    const zIndex = 100 - distance;

    // Progressive Overlap (Tucking under)
    // base overlap 150 + step 25 based on distance from focus
    let marginLeft = 0;
    if (index > 0) {
      const overlap = 150 + (Math.min(4, distance) * 20);
      marginLeft = -overlap;
    }

    return { scale, zIndex, marginLeft };
  };

  const renderCard = (artist: Artist, index: number) => {
    const isActive = index === activeIndex;
    const desktop = getDesktopStyles(index);
    
    return (
      <motion.div
        key={artist.id}
        className={`${styles.cardAnchor} ${isActive ? styles.cardAnchorActive : ''}`}
        onMouseEnter={() => !isMobile && setActiveIndex(index)}
        animate={isMobile ? { scale: 1, marginLeft: 0 } : { 
          scale: desktop.scale,
          zIndex: desktop.zIndex,
          marginLeft: desktop.marginLeft
        }}
        transition={{ 
          type: 'spring', 
          damping: 25, 
          stiffness: 150 
        }}
        style={{ 
          transformOrigin: 'bottom center',
          flex: isMobile ? '0 0 240px' : '0 0 330px' 
        }}
      >
        <Link href={`/artists/${artist.slug}`} className={styles.internalCard}>
          <div className={styles.imageBox}>
            {artist.photoUrl ? (
              <img src={artist.photoUrl} alt={artist.name} className={styles.portraitPhoto} />
            ) : (
              <div className={styles.portraitPhoto} style={{ background: artist.avatarGradient }} />
            )}
            
            <div className={styles.brandingOverlay}>
              <h3 className={styles.artistName}>{artist.name}</h3>
              <div className={styles.divider} />
              <div className={styles.socialIcons}>
                {artist.socialLinks.soundcloud && <SocialIcon type="soundcloud" />}
                {artist.socialLinks.instagram && <SocialIcon type="instagram" />}
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
    );
  };

  return (
    <div className={styles.showcaseWrapper}>
      <header className={styles.headerRow}>
        <h2 className={styles.title}>
          {showDiamond && <span className={styles.diamondIcon}>◆</span>}
          {title}
        </h2>
      </header>

      {isMobile ? (
        /* Mobile: Simple Horizontal Scroll */
        <div className={styles.scrollArea}>
          {artists.map((artist, index) => renderCard(artist, index))}
        </div>
      ) : (
        /* Desktop: Physical Peak Deck (Centered) */
        <div className={styles.deckArea}>
          {artists.map((artist, index) => renderCard(artist, index))}
        </div>
      )}
    </div>
  );
}

function SocialIcon({ type }: { type: 'soundcloud' | 'instagram' }) {
  if (type === 'soundcloud') {
    return (
      <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.562 13.922c0 .4-.008.79-.026 1.18-.016.353-.05.7-.098 1.042-.046.33-.11.644-.192.95-.083.303-.178.59-.286.862-.11.272-.232.522-.363.754-.132.228-.276.438-.43.626-.153.187-.318.348-.49.486-.17.135-.353.245-.544.333-.188.087-.384.152-.587.194-.197.042-.4.07-.607.08-.204.01-.41.018-.614.018h-5.267v-10.43c.478 0 .937.1 1.368.303.414.195.776.468 1.077.81.285.322.497.712.632 1.157.132.428.2 1.01.2 1.74zM24 16.32c0 .138-.01.275-.03.41-.02.132-.054.26-.098.384-.047.125-.104.24-.173.348-.068.106-.15.202-.243.287-.094.084-.2.155-.316.21-.115.056-.24.1-.372.13-.132.032-.27.048-.415.048H12.646c-.015-.4-.023-.8-.023-1.196s.01-1.072.03-1.46c.03-.54.103-1.05.215-1.52.112-.475.27-.905.47-1.29.21-.383.456-.713.738-.988.29-.276.623-.497.994-.664.383-.173.804-.26 1.263-.26.24 0 .47.026.69.076.222.052.43.127.625.226.2.098.386.216.556.353.176.138.334.298.473.473.14.175.264.368.373.576.108.204.2.42.274.646.073.22.13.45.168.685l.033.22s.225-.262.47-.46c.26-.21.564-.383.914-.525.35-.142.748-.214 1.193-.214.542 0 1.033.106 1.474.316.44.208.82.51 1.144.9.324.39.57.86.738 1.41.173.553.26 1.17.26 1.854z"></path>
      </svg>
    );
  }
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
    </svg>
  );
}
