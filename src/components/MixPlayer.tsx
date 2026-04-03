'use client';

import { useState, useRef, useEffect } from 'react';
import { Mix } from '@/data/mixes';
import { useI18n } from '@/i18n';
import styles from './MixPlayer.module.css';

interface MixPlayerProps {
  mix: Mix;
  isActive: boolean;
  onPlay: (id: string) => void;
}

export default function MixPlayer({ mix, isActive, onPlay }: MixPlayerProps) {
  const { t } = useI18n();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!isActive && isPlaying) {
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
      }
    }
  }, [isActive, isPlaying]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (mix.audioSrc && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
    onPlay(mix.id);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return '0:00';
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (mix.soundcloudUrl && isActive) {
    return (
      <div className={`${styles.player} ${styles.scActive}`} id={`mix-${mix.id}`}>
        <iframe 
          width="100%" 
          height="166" 
          scrolling="no" 
          frameBorder="no" 
          allow="autoplay" 
          src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(mix.soundcloudUrl)}&color=%2300ffb2&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false`}
          className={styles.scIframe}
        />
        <button className={styles.closeSc} onClick={(e) => { e.stopPropagation(); onPlay(''); }} aria-label="Close player">✕</button>
      </div>
    );
  }

  return (
    <div className={`${styles.player} ${isActive ? styles.active : ''}`} id={`mix-${mix.id}`} onClick={() => onPlay(mix.id)}>
      {mix.audioSrc && (
        <audio 
          ref={audioRef} 
          src={mix.audioSrc} 
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <button className={styles.playBtn} onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
        <div className={styles.playIcon}>
          {isPlaying && isActive ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2" width="4" height="12" rx="1" />
              <rect x="9" y="2" width="4" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <polygon points="3,1 14,8 3,15" />
            </svg>
          )}
        </div>
      </button>

      <div className={styles.cover} style={{ background: mix.coverGradient }}>
        {/* Mini waveform visualization */}
        <div className={styles.miniWave}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className={`${styles.miniBar} ${isActive && isPlaying ? styles.animating : ''}`}
              style={{
                height: `${30 + Math.sin(i * 0.8) * 50}%`,
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      </div>

      <div className={styles.info}>
        <h4 className={styles.title}>{mix.title}</h4>
        <p className={styles.artist}>{mix.artist}</p>
        {isActive && (
          <div className={styles.scrubberContainer} onClick={e => e.stopPropagation()}>
            <span className={styles.timeLabel}>{formatTime(currentTime)}</span>
            <input 
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className={styles.scrubber}
            />
            <span className={styles.timeLabel}>{formatTime(duration)}</span>
          </div>
        )}
      </div>

      <div className={styles.meta}>
        {!isActive && <span className={styles.duration}>{mix.duration}</span>}
      </div>
    </div>
  );
}
