'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n, Locale } from '@/i18n';
import { Event as AppEvent } from '@/data/events';
import EventCard from '@/components/EventCard';
import { normalizeEvent } from '@/lib/data-normalization';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import styles from './page.module.css';

type PageEvent = AppEvent;

export default function EventsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const url = user?.isAdmin 
          ? '/api/events?includeTest=true' 
          : '/api/events';

        const res = await fetch(url, { headers, cache: 'no-store' });
        const data = await res.json();

        if (!res.ok) {
          console.error('Failed to load events:', data?.error);
          setError(data?.error || 'Failed to load events');
          setEvents([]);
          return;
        }

        setEvents(Array.isArray(data) ? data : []);
      } catch (err: any) {
        console.error('Events fetch error:', err);
        setError(err?.message || 'Network error');
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, [user?.isAdmin]);

  const normalizedEvents = useMemo<AppEvent[]>(() => {
    return events.map(normalizeEvent);
  }, [events]);

  const filtered = useMemo(() => {
    const base = normalizedEvents.filter(e => e.isPast === showPast);
    if (filter === 'all') return base;
    return base.filter(e => e.type === filter);
  }, [normalizedEvents, showPast, filter]);

  const filters = ['all', 'club', 'underground', 'outdoor'];

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
               <span className={styles.emptyIcon}>◈</span>
               <p>Loading events...</p>
             </div>
          ) : error ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>⚠</span>
              <p>Could not load events. Please try again later.</p>
            </div>
          ) : filtered.length > 0 ? (
            filtered.map(event => (
              <EventCard key={event.id} event={event} featured />
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
