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
 * Normalizes an event from the API/Supabase to the format expected by components.
 */
export function normalizeEvent(event: any): Event {
  const eventDate = new Date(event.date);
  const now = new Date();
  const isPast = event.isPast ?? event.is_past ?? eventDate < now;

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
    posterColor: event.posterColor || event.poster_color || 'linear-gradient(135deg, #000, #333)',
    posterImage: event.posterImage != null ? (event.posterImage || undefined) : (event.poster_image || undefined),
    posterVertical: event.posterVertical != null ? (event.posterVertical || null) : (event.poster_vertical || null),
    coverWide: event.coverWide != null ? (event.coverWide || null) : (event.cover_wide || null),
    isFree: !!(event.isFree ?? event.is_free),
    ticketUrl: event.ticketUrl || event.ticket_url,
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
