import { Locale } from '@/i18n';
import { Event, EventTicketType } from '@/data/events';
import { Artist } from '@/data/artists';
import { Mix } from '@/data/mixes';
import { User } from '@/data/profiles';

/**
 * Normalizes a potentially localized field from Supabase.
 * Supabase might store it as a JSON string or an object.
 */
export function normalizeLocalizedField(field: any): Record<Locale, string> {
  const fallback: Record<Locale, string> = { en: '', cs: '', no: '', pl: '', de: '' };
  if (!field) return fallback;

  if (typeof field === 'string') {
    try {
      let parsed = JSON.parse(field);
      
      // Handle the "character map" edge case (e.g., {"0":"{", "1":"\""})
      if (parsed && typeof parsed === 'object' && !parsed.en && !parsed.cs && parsed['0']) {
        const reconstructed = Object.values(parsed).join('');
        try {
          parsed = JSON.parse(reconstructed);
        } catch {
          // If reconstruction fails to parse, treat reconstructed as raw text
          return { en: reconstructed, cs: reconstructed, no: reconstructed, pl: reconstructed, de: reconstructed };
        }
      }

      const en = parsed.en || '';
      return {
        en: en,
        cs: parsed.cs ?? en,
        no: parsed.no ?? en,
        pl: parsed.pl ?? en,
        de: parsed.de ?? en,
      };
    } catch {
      return { en: field, cs: field, no: field, pl: field, de: field };
    }
  }

  // If it's already an object
  return {
    en: field.en ?? '',
    cs: field.cs ?? '',
    no: field.no ?? '',
    pl: field.pl ?? '',
    de: field.de ?? '',
  };
}

/**
 * Computes whether an event has ended, based on the event date and parsed end
 * time from the `time` field (e.g. "21:00 - 02:00").
 *
 * - If end_time < start_time the event crosses midnight → end is next day.
 * - Falls back to 23:59:59 on the event date if no end time is available.
 * - All comparisons use the Europe/Oslo timezone.
 */
function computeEventIsPast(event: any): boolean {
  const dateStr: string | undefined = event.date; // e.g. "2026-05-23" or "2026-05-23T21:00:00"
  if (!dateStr) return false;

  // Extract just the calendar date (YYYY-MM-DD)
  const calendarDate = String(dateStr).split('T')[0]; // "2026-05-23"

  // Try to parse end time from the `time` field (e.g. "21:00 - 02:00")
  const timeField: string = event.time || '';
  const parts = timeField.split('-').map((s: string) => s.trim());
  const startTimeStr = parts[0] || ''; // "21:00"
  const endTimeStr = parts[1] || '';   // "02:00" or "???" or ""

  // Parse HH:MM from a string, returns [hours, minutes] or null
  const parseHM = (s: string): [number, number] | null => {
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return [parseInt(m[1], 10), parseInt(m[2], 10)];
  };

  const startHM = parseHM(startTimeStr);
  const endHM = parseHM(endTimeStr);

  // Build the end-of-event datetime string in Europe/Oslo local time
  let endHours = 23;
  let endMinutes = 59;
  let addDays = 0;

  if (endHM) {
    endHours = endHM[0];
    endMinutes = endHM[1];

    // If end time is earlier than start time, event crosses midnight
    if (startHM && (endHM[0] < startHM[0] || (endHM[0] === startHM[0] && endHM[1] < startHM[1]))) {
      addDays = 1;
    }
  }

  // Construct end datetime in Europe/Oslo
  // We build a Date from the calendar date parts and then format in Oslo tz to compare
  const [year, month, day] = calendarDate.split('-').map(Number);

  // Create a date object representing the end-of-event in Oslo local time.
  // We use Intl to convert "now" to Oslo time, then compare numerically.
  const endDate = new Date(year, month - 1, day + addDays, endHours, endMinutes, 59);

  // Get current time in Oslo timezone
  const nowInOslo = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Europe/Oslo' })
  );

  return endDate <= nowInOslo;
}

/**
 * Normalizes an event from the API/Supabase to the format expected by components.
 */
export function normalizeEvent(event: any): Event {
  const isPast = computeEventIsPast(event);

  return {
    ...event,
    id: event.id,
    slug: event.slug || null,
    title: event.title || 'Untitled Event',
    date: event.date,
    time: event.time || '',
    venue: normalizeLocalizedField(event.venue),
    type: (event.type === 'outdoor' || event.type === 'club' || event.type === 'underground') ? event.type : 'club',
    description: normalizeLocalizedField(event.description),
    lineup: Array.isArray(event.lineup) ? event.lineup : [],
    posterColor: (event.posterColor || event.poster_color || 'linear-gradient(135deg, #000, #333)').trim(),
    posterImage: (event.posterImage || event.poster_image || '').trim() || undefined,
    posterVertical: (event.posterVertical || event.poster_vertical || '').trim() || null,
    coverWide: (event.coverWide || event.cover_wide || '').trim() || null,
    isFree: !!(event.isFree ?? event.is_free),
    ticketUrl: (event.ticketUrl || event.ticket_url || '').trim() || undefined,
    ticketProvider: event.ticketProvider || event.ticket_provider || 'external',
    ticketPriceOre: event.ticketPriceOre ?? event.ticket_price_ore ?? null,
    isFeatured: !!(event.isFeatured ?? event.is_featured),
    isPast,
    ageRestriction: (event.ageRestriction ?? event.age_restriction ?? '18+') as '18+' | '20+' | '21+',
  };
}

/**
 * Normalizes an artist from the API/Supabase.
 */
export function normalizeArtist(artist: any): Artist {
  return {
    ...artist,
    id: artist.id,
    slug: artist.slug || artist.id,
    name: artist.name || 'Unknown Artist',
    bio: normalizeLocalizedField(artist.bio),
    isCrew: !!(artist.isCrew ?? artist.is_crew),
    isInvited: !!(artist.isInvited ?? artist.is_invited),
    photoUrl: [artist.photo_url, artist.image, artist.photoUrl, artist.photo].find(u => typeof u === 'string' && u.trim() !== '') || undefined,
    avatarGradient: artist.avatarGradient || artist.avatar_gradient || 'linear-gradient(135deg, #333, #111)',
    socialLinks: {
      soundcloud: artist.socialLinks?.soundcloud || artist.social_links?.soundcloud || artist.soundcloud_url || artist.soundcloud,
      mixcloud: artist.socialLinks?.mixcloud || artist.social_links?.mixcloud || artist.mixcloud_url,
      instagram: artist.socialLinks?.instagram || artist.social_links?.instagram || artist.instagram_url || artist.instagram,
    },
    country_code: artist.country_code || artist.countryCode,
  };
}

/**
 * Normalizes a mix from the API/Supabase.
 */
export function normalizeMix(mix: any): Mix {
  return {
    ...mix,
    id: mix.id,
    slug: mix.slug || '',
    title: mix.title || 'Untitled Mix',
    artist: mix.artist || 'Unknown Artist',
    duration: mix.duration || '0:00',
    date: mix.date || new Date().toISOString(),
    coverGradient: mix.coverGradient || mix.cover_gradient || 'linear-gradient(135deg, #222, #000)',
    eventId: mix.eventId || mix.event_id,
    label: mix.label || 'SINGULARITY',
    audioSrc: mix.audioSrc || mix.audio_src,
    soundcloudUrl: mix.soundcloudUrl || mix.soundcloud_url,
  };
}

/**
 * Resolves a list of lineup strings to Artist objects.
 */
export function resolveLineupArtists(
  lineup: string[] | null | undefined,
  artists: Artist[]
): Artist[] {
  if (!Array.isArray(lineup) || !Array.isArray(artists)) return [];

  return lineup
    .map((lineupItem) => {
      const key = String(lineupItem).toLowerCase().trim();

      return artists.find((artist) => {
        return (
          artist.slug?.toLowerCase().trim() === key ||
          artist.name?.toLowerCase().trim() === key ||
          artist.id?.toLowerCase().trim() === key
        );
      });
    })
    .filter((artist): artist is Artist => Boolean(artist));
}

/**
 * Normalizes a ticket type from the API/Supabase.
 */
export function normalizeTicketType(tt: any): EventTicketType {
  return {
    id: tt.id,
    eventId: tt.eventId || tt.event_id,
    name: tt.name || 'Standard Ticket',
    description: tt.description || null,
    priceNok: tt.priceNok ?? tt.price_nok ?? 0,
    currency: tt.currency || 'NOK',
    totalQuantity: tt.totalQuantity ?? tt.total_quantity ?? null,
    soldQuantity: tt.soldQuantity ?? tt.sold_quantity ?? 0,
    isActive: !!(tt.isActive ?? tt.is_active),
    isSupporter: !!(tt.isSupporter ?? tt.is_supporter),
    saleStartsAt: tt.saleStartsAt || tt.sale_starts_at || null,
    saleEndsAt: tt.saleEndsAt || tt.sale_ends_at || null,
    sortOrder: tt.sortOrder ?? tt.sort_order ?? 0,
  };
}

/**
 * Normalizes a profile from the API/Supabase to the User format.
 */
export function normalizeProfile(data: any, email?: string): User {
  const fallbackEmail = email || data.email || '';
  return {
    id: data.id,
    email: data.email || fallbackEmail,
    displayName: data.display_name || fallbackEmail.split('@')[0],
    avatarInitial: (data.display_name || fallbackEmail)[0]?.toUpperCase() || '?',
    avatarUrl: data.avatar_url || undefined,
    bio: data.bio || undefined,
    favoriteProducer: data.favorite_producer || undefined,
    favoriteTrack: data.favorite_track || undefined,
    favoriteVenue: data.favorite_venue || undefined,
    favoriteFestival: data.favorite_festival || undefined,
    city: data.city || undefined,
    favoriteSubgenre: data.favorite_subgenre || undefined,
    points: data.points || 0,
    isAdmin: data.is_admin || false,
    createdAt: data.created_at || new Date().toISOString(),
    memberCode: data.member_code || undefined,
    tier: data.tier || undefined,
    memberSince: data.member_since || undefined,
    qrToken: data.qr_token || undefined,
    marketingConsent: data.marketing_consent || false,
    marketingConsentAt: data.marketing_consent_at || null,
    marketingUnsubscribedAt: data.marketing_unsubscribed_at || null,
  };
}

/**
 * Maps Rave Points to community tiers.
 */
export function getMemberTier(points: number): string {
  if (points >= 1500) return 'Core Member';
  if (points >= 500) return 'Resident';
  return 'Observer';
}
