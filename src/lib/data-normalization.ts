import { Locale } from '@/i18n';
import { Event } from '@/data/events';
import { Artist } from '@/data/artists';
import { Mix } from '@/data/mixes';

/**
 * Normalizes a potentially localized field from Supabase.
 * Supabase might store it as a JSON string or an object.
 */
export function normalizeLocalizedField(field: any): Record<Locale, string> {
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

/**
 * Normalizes an event from the API/Supabase to the format expected by components.
 */
export function normalizeEvent(event: any): Event {
  const eventDate = new Date(event.date);
  const now = new Date();
  const isPast = event.isPast ?? eventDate < now;

  return {
    ...event,
    id: event.id,
    title: event.title || 'Untitled Event',
    date: event.date,
    time: event.time || '',
    venue: normalizeLocalizedField(event.venue),
    type: (event.type === 'outdoor' || event.type === 'club' || event.type === 'underground') ? event.type : 'club',
    description: normalizeLocalizedField(event.description),
    lineup: Array.isArray(event.lineup) ? event.lineup : [],
    posterColor: event.posterColor || 'linear-gradient(135deg, #000, #333)',
    isFree: !!event.isFree,
    isPast,
  };
}

/**
 * Normalizes an artist from the API/Supabase.
 */
export function normalizeArtist(artist: any): Artist {
  return {
    ...artist,
    id: artist.id,
    name: artist.name || 'Unknown Artist',
    bio: normalizeLocalizedField(artist.bio),
    isCrew: !!artist.isCrew,
    isInvited: !!artist.isInvited,
    avatarGradient: artist.avatarGradient || 'linear-gradient(135deg, #333, #111)',
    socialLinks: {
      soundcloud: artist.socialLinks?.soundcloud || artist.soundcloud_url,
      mixcloud: artist.socialLinks?.mixcloud || artist.mixcloud_url,
      instagram: artist.socialLinks?.instagram || artist.instagram_url,
    },
  };
}

/**
 * Normalizes a mix from the API/Supabase.
 */
export function normalizeMix(mix: any): Mix {
  return {
    ...mix,
    id: mix.id,
    title: mix.title || 'Untitled Mix',
    artist: mix.artist || 'Unknown Artist',
    duration: mix.duration || '0:00',
    date: mix.date || new Date().toISOString(),
    coverGradient: mix.coverGradient || 'linear-gradient(135deg, #222, #000)',
    eventId: mix.eventId || mix.event_id,
    label: mix.label || 'SINGULARITY',
  };
}
