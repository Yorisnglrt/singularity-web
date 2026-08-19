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
  isTestEvent?: boolean;
  ageRestriction?: '18+' | '20+' | '21+';
}

export interface EventTicketType {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  priceNok: number;
  currency: string;
  totalQuantity: number | null;
  soldQuantity: number;
  isActive: boolean;
  isSupporter: boolean;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  sortOrder: number;
}

/** Find an event by slug (tries id field, then legacy slug) */
export function findEventBySlug(slug: string): Event | undefined {
  console.log('[findEventBySlug] looking for:', slug);
  return events.find(e =>
    e.id === slug ||
    (e.slug && e.slug === slug)
  );
}

export const events = eventsData as Event[];
export const upcomingEvents = events.filter(e => !e.isPast);
export const pastEvents = events.filter(e => e.isPast);
