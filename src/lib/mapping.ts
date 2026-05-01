import crypto from 'crypto';

/**
 * Generates a stable UUID v5-like string from a name/slug and a namespace.
 * This is used to ensure that legacy events with string IDs get the same UUID 
 * every time they are migrated.
 */
export function generateDeterministicUUID(name: string): string {
  // Use a fixed namespace UUID for the project
  const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace as a placeholder
  const hash = crypto.createHash('sha1').update(NAMESPACE + name).digest('hex');
  
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    `5${hash.substring(13, 16)}`, // Set version to 5
    `${((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hash.substring(18, 20)}`, // Set variant to RFC4122
    hash.substring(20, 32)
  ].join('-');
}

export interface EventInput {
  id: string;
  title: string;
  date: string;
  time: string;
  venue: string | any;
  type: string;
  description: any;
  lineup: string[];
  posterColor?: string;
  isFree?: boolean;
  isPast?: boolean;
  [key: string]: any;
}

/**
 * Maps frontend Event object (camelCase, slug-IDs) to DB Row (snake_case, UUIDs).
 * SLots only canonical fields: id, slug, title, date, time, venue, type, description, lineup, poster_color, is_free, is_past.
 */
export function mapEventToDb(event: any, isLegacy: boolean = false) {
  const { id: slugOrId, ...rest } = event;
  
  // Decide on correctly formatted UUID
  let id: string;

  // Check if slugOrId is already a UUID
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);

  if (isUUID) {
    id = slugOrId;
  } else if (isLegacy) {
    id = generateDeterministicUUID(slugOrId);
  } else {
    // If it's a new event from admin, we use a random UUID 
    id = crypto.randomUUID();
  }

  // Generate slug if missing or if it's the old 'new-...' ID
  let slug: string = event.slug || rest.slug || slugOrId;
  if (!slug || slug.startsWith('new-')) {
    const { toSlug } = require('./slug');
    slug = toSlug(rest.title || 'untitled-event');
  }

  // Strict mapping of only canonical fields
  const row: any = {
    id,
    slug: slug,
    title: rest.title || 'Untitled Event',
    date: rest.date ? rest.date.split('T')[0] : null,
    time: rest.time || '',
    venue: typeof rest.venue === 'object' && rest.venue !== null ? rest.venue : { en: rest.venue || '' },
    type: rest.type || 'club',
    description: typeof rest.description === 'object' && rest.description !== null ? rest.description : { en: rest.description || '' },
    lineup: Array.isArray(rest.lineup) ? rest.lineup.filter((item: any) => typeof item === 'string') : [],
    poster_color: rest.posterColor || rest.poster_color || 'linear-gradient(135deg, #000, #333)',
    poster_image: rest.posterImage != null ? (rest.posterImage || null) : (rest.poster_image || null),
    poster_vertical: rest.posterVertical != null ? (rest.posterVertical || null) : (rest.poster_vertical || null),
    cover_wide: rest.coverWide != null ? (rest.coverWide || null) : (rest.cover_wide || null),
    is_free: !!(rest.isFree ?? rest.is_free),
    is_featured: !!(rest.isFeatured ?? rest.is_featured),
    ticket_url: rest.ticketUrl || rest.ticket_url || null,
    ticket_provider: rest.ticketProvider || rest.ticket_provider || 'external',
    ticket_price_ore: rest.ticketPriceOre ?? rest.ticket_price_ore ?? null,
    is_past: !!(rest.isPast ?? rest.is_past),
    age_restriction: rest.ageRestriction ?? rest.age_restriction ?? '18+',
  };

  return row;
}

/**
 * Maps frontend Artist object to DB Row.
 */
export function mapArtistToDb(artist: any) {
  const { id, ...rest } = artist;
  
  return {
    id,
    slug: rest.slug || id,
    name: rest.name,
    bio: rest.bio,
    is_crew: !!(rest.isCrew ?? rest.is_crew),
    is_invited: !!(rest.isInvited ?? rest.is_invited),
    photo_url: rest.image || rest.photoUrl || rest.photo_url || null,
    avatar_gradient: rest.avatarGradient || rest.avatar_gradient || 'linear-gradient(135deg, #000, #333)',
    social_links: rest.socialLinks || rest.social_links || {},
    country_code: rest.country_code || rest.countryCode || null,
  };
}

/**
 * Maps frontend Mix object to DB Row.
 */
export function mapMixToDb(mix: any) {
  const { id, ...rest } = mix;
  return {
    id,
    title: rest.title,
    artist: rest.artist,
    event_id: rest.eventId || rest.event_id,
    label: rest.label,
    duration: rest.duration,
    date: rest.date,
    coverGradient: rest.coverGradient || rest.cover_gradient || 'linear-gradient(135deg, #000, #333)',
    audioSrc: rest.audioSrc || rest.audio_src,
    soundcloudUrl: rest.soundcloudUrl || rest.soundcloud_url,
  };
}

/**
 * Generic dispatcher to map frontend payloads to DB rows based on table type.
 */
/**
 * Maps frontend EventTicketType object to DB Row for public.event_ticket_types.
 */
export function mapTicketTypeToDb(tt: any) {
  const priceNok = parseInt(String(tt.priceNok ?? tt.price_nok ?? 0), 10);
  const totalQuantity = tt.totalQuantity != null && tt.totalQuantity !== ''
    ? parseInt(String(tt.totalQuantity ?? tt.total_quantity), 10)
    : (tt.total_quantity != null ? parseInt(String(tt.total_quantity), 10) : null);

  // Generate a proper UUID for new ticket types (frontend uses 'new-tt-...' temp IDs)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tt.id);
  const id = isUUID ? tt.id : crypto.randomUUID();

  // event_id may also be a non-UUID slug; resolve it the same way events do
  const eventIdRaw = tt.eventId ?? tt.event_id;
  const eventIdIsUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventIdRaw);
  const event_id = eventIdIsUUID ? eventIdRaw : generateDeterministicUUID(eventIdRaw);

  return {
    id,
    event_id,
    name: tt.name,
    description: tt.description ?? null,
    price_nok: isNaN(priceNok) ? 0 : Math.max(0, priceNok),
    currency: tt.currency ?? 'NOK',
    total_quantity: totalQuantity != null && !isNaN(totalQuantity) ? Math.max(0, totalQuantity) : null,
    // sold_quantity is managed by the system (incremented on issuance), do not overwrite via admin
    is_active: tt.isActive ?? tt.is_active ?? true,
    sale_starts_at: tt.saleStartsAt ?? tt.sale_starts_at ?? null,
    sale_ends_at: tt.saleEndsAt ?? tt.sale_ends_at ?? null,
    sort_order: parseInt(String(tt.sortOrder ?? tt.sort_order ?? 0), 10) || 0,
  };
}

export function mapPayloadToDb(type: string, data: any[]) {
  if (!Array.isArray(data)) return [];

  const isLegacy = type === 'events' && data.some(d => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.id));

  switch (type) {
    case 'events':
      return data.map(d => mapEventToDb(d, isLegacy));
    case 'artists':
      return data.map(d => mapArtistToDb(d));
    case 'mixes':
      return data.map(d => mapMixToDb(d));
    case 'event_ticket_types':
      return data.map(d => mapTicketTypeToDb(d));
    default:
      return data;
  }
}
