import { Locale } from '@/i18n';
import eventsData from './events.json';

export interface Event {
  id: string;
  slug?: string;
  title: string;
  date: string;
  time: string;
  venue: string | Record<Locale, string>;
  type: 'club' | 'underground' | 'outdoor';
  description: Record<Locale, string>;
  lineup: string[];
  posterColor: string;
  posterImage?: string;
  posterVertical?: string;
  coverWide?: string;
  isFree: boolean;
  ticketUrl?: string;
  ticketProvider?: 'external' | 'vipps';
  ticketPriceOre?: number | null;
  isPast?: boolean;
  isFeatured?: boolean;
}

/** Generate a stable URL slug from the event title, falling back to the id */
export function toSlug(event: Event): string {
  if (event.slug) return event.slug;
  return event.title
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Find an event by slug (tries slug field, then title-derived slug, then id) */
export function findEventBySlug(slug: string): Event | undefined {
  console.log('[findEventBySlug] looking for:', slug);
  console.log('[findEventBySlug] available slugs:', events.map(e => ({ id: e.id, slug: toSlug(e) })));
  return events.find(e =>
    toSlug(e) === slug ||
    e.id === slug ||
    (e.slug && e.slug === slug)
  );
}

export const events = eventsData as Event[];
export const upcomingEvents = events.filter(e => !e.isPast);
export const pastEvents = events.filter(e => e.isPast);
