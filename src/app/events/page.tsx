'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n, Locale } from '@/i18n';
import EventCard from '@/components/EventCard';
import styles from './page.module.css';

type RawEvent = {
  id: string;
  title: string;
  date: string;
  time: string;
  venue: string | Record<string, string>;
  type: string;
  description: string | Record<string, string>;
  lineup: string[];
  posterColor?: string;
  isFree?: boolean;
  isPast?: boolean;
};

type PageEvent = {
  id: string;
  title: string;
  date: string;
  time: string;
  venue: Record<Locale, string>;
  type: string;
  description: Record<Locale, string>;
  lineup: string[];
  posterColor: string;
  isFree: boolean;
  isPast: boolean;
};

type EventFilter = 'all' | 'club' | 'underground' | 'outdoor';

function normalizeLocalizedField(field: RawEvent['venue'] | RawEvent['description']): Record<Locale, string> {
  const fallback: Record<Locale, string> = { en: '', cs: '', no: '', pl: '', de: '' };
  if (!field) return fallback;

  if (typeof field === 'string') {
    try {
      const parsed = JSON.parse(field);
      return {
        en: parsed.en ?? field,
        cs: parsed.cs ?? field,
        no: parsed.no ?? field,
        pl: parsed.pl ?? field,
        de: parsed.de ?? field,
      };
    } catch {
      return { en: field, cs: field, no: field, pl: field, de: field };
    }
  }

  return {
    en: field.en ?? '',
    cs: field.cs ?? '',
    no: field.no ?? '',
    pl: field.pl ?? '',
    de: field.de ?? '',
  };
}

export default function EventsPage() {
  const { t } = useI18n();
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<EventFilter>('all');
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const res = await fetch('/api/events', { cache: 'no-store' });
        const data = await res.json();

        if (!res.ok) {
          console.error('Failed to load events:', data?.error);
          setEvents([]);
          return;
        }

        setEvents(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Events fetch error:', err);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, []);

  const normalizedEvents = useMemo<PageEvent[]>(() => {
    return events.map((event) => {
      const eventDate = new Date(event.date);
      const now = new Date();
      const isPast = event.isPast ?? eventDate < now;

      return {
        id: event.id,
        title: event.title,
        date: event.date,
        time: event.time,
        venue: normalizeLocalizedField(event.venue),
        type: event.type,
        description: normalizeLocalizedField(event.description),
        lineup: Array.isArray(event.lineup) ? event.lineup : [],
        posterColor: event.posterColor || 'linear-gradient(135deg, #000, #333)',
        isFree: !!event.isFree,
        isPast,
      };
    });
  }, [events]);

  const filtered = useMemo(() => {
    const base = normalizedEvents.filter(e => e.isPast === showPast);
    if (filter === 'all') return base;
    return base.filter(e => e.type === filter);
  }, [normalizedEvents, showPast, filter]);

  const filters: EventFilter[] = ['all', 'club', 'underground', 'outdoor'];

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>{t('events.title')}</h1>
          <p className={styles.subtitle}>SINGULARITY EVENTS — OSLO</p>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${!showPast ? styles.tabActive : ''}`}
            onClick={() => setShowPast(false)}
          >
            {t('events.upcoming')}
          </button>
          <button
            className={`${styles.tab} ${showPast ? styles.tabActive : ''}`}
            onClick={() => setShowPast(true)}
          >
            {t('events.past')}
          </button>
        </div>

        <div className={styles.filters}>
          {filters.map(f => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ''}`}
              onClick={() => setFilter(f)}
            >
              {t(`events.filter.${f}`)}
            </button>
          ))}
        </div>

        <div className={styles.eventList}>
          {loading ? (
             <div className={styles.empty}>
               <p>Loading events...</p>
             </div>
          ) : filtered.length > 0 ? (
            filtered.map(event => (
              <EventCard key={event.id} event={event} />
            ))
          ) : (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>◈</span>
              <p>No events found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
