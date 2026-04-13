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
 */
export function mapEventToDb(event: EventInput, isLegacy: boolean = false) {
  const { id: slugOrId, ...rest } = event;
  
  // Decide on correctly formatted UUID
  let id: string;
  let slug: string = slugOrId;

  // Check if slugOrId is already a UUID
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);

  if (isUUID) {
    id = slugOrId;
    // If it's already a UUID, we don't have a readable slug unless it's provided elsewhere
    // but usually in this app the slug was the ID.
  } else if (isLegacy) {
    id = generateDeterministicUUID(slugOrId);
  } else {
    id = crypto.randomUUID();
  }

  // Basic mapping
  const row: any = {
    id,
    slug,
    title: rest.title,
    date: rest.date ? rest.date.split('T')[0] : null, // Ensure YYYY-MM-DD for registry 'date' type
    time: rest.time,
    venue: typeof rest.venue === 'object' && rest.venue !== null ? rest.venue : { name: rest.venue || '' }, // Ensure JSONB
    type: rest.type,
    description: typeof rest.description === 'object' && rest.description !== null ? rest.description : {}, // Ensure JSONB
    lineup: Array.isArray(rest.lineup) ? rest.lineup.filter(item => typeof item === 'string') : [], // Ensure TEXT[] (flat string array)
    poster_color: rest.posterColor || rest.poster_color,
    is_free: typeof rest.isFree === 'boolean' ? rest.isFree : !!rest.is_free,
    is_past: typeof rest.isPast === 'boolean' ? rest.isPast : !!rest.is_past,
  };

  return row;
}

/**
 * Maps a list of events
 */
export function mapEventsToDb(events: EventInput[], isLegacy: boolean = false) {
  return events.map(e => mapEventToDb(e, isLegacy));
}
