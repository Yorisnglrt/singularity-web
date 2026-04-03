'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n';
import EventCard from '@/components/EventCard';
import { upcomingEvents, pastEvents } from '@/data/events';
import styles from './page.module.css';

type EventFilter = 'all' | 'club' | 'underground' | 'outdoor';

export default function EventsPage() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<EventFilter>('all');
  const [showPast, setShowPast] = useState(false);

  const filters: EventFilter[] = ['all', 'club', 'underground', 'outdoor'];

  const displayEvents = showPast ? pastEvents : upcomingEvents;
  const filtered = filter === 'all'
    ? displayEvents
    : displayEvents.filter(e => e.type === filter);

  return (
    <div className={styles.page}>
      <div className="container">
        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>{t('events.title')}</h1>
          <p className={styles.subtitle}>SINGULARITY EVENTS — OSLO</p>
        </div>

        {/* Tabs: Upcoming / Archive */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${!showPast ? styles.tabActive : ''}`}
            onClick={() => setShowPast(false)}
            id="tab-upcoming"
          >
            {t('events.upcoming')}
          </button>
          <button
            className={`${styles.tab} ${showPast ? styles.tabActive : ''}`}
            onClick={() => setShowPast(true)}
            id="tab-past"
          >
            {t('events.past')}
          </button>
        </div>

        {/* Filters */}
        <div className={styles.filters}>
          {filters.map(f => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ''}`}
              onClick={() => setFilter(f)}
              id={`filter-${f}`}
            >
              {t(`events.filter.${f}`)}
            </button>
          ))}
        </div>

        {/* Event list */}
        <div className={styles.eventList}>
          {filtered.length > 0 ? (
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
