import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import EventDetailClient from './EventDetailClient';
import { supabase } from '@/lib/supabase';
import { normalizeEvent, normalizeArtist, normalizeTicketType } from '@/lib/data-normalization';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function checkIsAdmin(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    let token = cookieStore.get('sb-access-token')?.value || cookieStore.get('sb-token')?.value;

    if (!token) {
      const allCookies = cookieStore.getAll();
      for (const c of allCookies) {
        if (c.name.startsWith('sb-') && c.name.endsWith('-auth-token')) {
          try {
            const parsed = JSON.parse(decodeURIComponent(c.value));
            if (Array.isArray(parsed) && parsed[0]) {
              token = parsed[0];
              break;
            } else if (parsed?.access_token) {
              token = parsed.access_token;
              break;
            }
          } catch {}
        }
      }
    }

    if (!token) return false;

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return false;

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    return !!profile?.is_admin;
  } catch {
    return false;
  }
}

const LEGACY_SLUG_MAP: Record<string, string> = {
  'dnb-singularity-aftermatch': '75facad9-f20b-5f7f-a68c-919aed1fe4e6',
};

function isUUID(str: string) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  // 1. Check legacy map
  const effectiveId = LEGACY_SLUG_MAP[slug];
  
  // 2. Fetch event
  let eventData = null;

  if (effectiveId) {
    const { data } = await supabase.from('events').select('*').eq('id', effectiveId).single();
    eventData = data;
  } else {
    // Try by slug
    const { data } = await supabase.from('events').select('*').eq('slug', slug).single();
    eventData = data;

    // Fallback to ID if it looks like a UUID
    if (!eventData && isUUID(slug)) {
      const { data: byId } = await supabase.from('events').select('*').eq('id', slug).single();
      eventData = byId;
    }
  }

  if (!eventData) return {};

  // If this is a test event, do not leak metadata to non-admins
  if (eventData.is_test_event) {
    const isAdmin = await checkIsAdmin();
    if (!isAdmin) return {};
  }

  const normalized = normalizeEvent(eventData);
  const title = `${normalized.title} — SINGULARITY`;
  const description = normalized.description.en || normalized.description.no || '';
  const truncatedDesc = description.length > 160 ? description.substring(0, 157) + '...' : description;
  
  // Image priority: coverWide -> posterImage -> posterVertical
  const ogImage = normalized.coverWide || normalized.posterImage || normalized.posterVertical;

  return {
    title,
    description: truncatedDesc,
    alternates: {
      canonical: `/events/${normalized.slug || normalized.id}`,
    },
    openGraph: {
      title,
      description: truncatedDesc,
      url: `/events/${normalized.slug || normalized.id}`,
      siteName: 'SINGULARITY',
      images: ogImage ? [{ url: ogImage }] : [],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: truncatedDesc,
      images: ogImage ? [ogImage] : [],
    },
  };
}

export default async function EventDetailPage({ params, searchParams }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const sParams = await searchParams;

  // 1. Check legacy map first (to avoid redirect and preserve #tickets)
  const legacyId = LEGACY_SLUG_MAP[slug];
  let event = null;

  if (legacyId) {
    const { data } = await supabase.from('events').select('*').eq('id', legacyId).single();
    event = data;
  } else {
    // 2. Try by canonical slug
    const { data: bySlug } = await supabase
      .from('events')
      .select('*')
      .eq('slug', slug)
      .single();
    event = bySlug;

    // 3. If not found by slug, try by ID (backward compatibility)
    if (!event && isUUID(slug)) {
      const { data: byId } = await supabase
        .from('events')
        .select('*')
        .eq('id', slug)
        .single();
      
      if (byId) {
        // If it has a slug, redirect to the slug URL while preserving query params
        if (byId.slug) {
          const queryString = new URLSearchParams(sParams as Record<string, string>).toString();
          const redirectUrl = `/events/${byId.slug}${queryString ? `?${queryString}` : ''}`;
          redirect(redirectUrl);
        }
        event = byId;
      }
    }
  }

  if (!event) {
    notFound();
  }

  // Access control check for test events
  let isServerAdmin = false;
  if (event.is_test_event) {
    isServerAdmin = await checkIsAdmin();
  }

  // Prepare lineup filter
  const lineupStrings = Array.isArray(event.lineup) ? event.lineup.map((s: unknown) => String(s)) : [];
  
  // Parallelize remaining fetches
  const [artistsResponse, ticketTypesResponse] = await Promise.all([
    // Only fetch artists that are in the lineup (name, slug, or id)
    lineupStrings.length > 0 
      ? supabase
          .from('artists')
          .select('*')
          .or(`name.in.(${lineupStrings.map((s: string) => `"${s}"`).join(',')}),slug.in.(${lineupStrings.map((s: string) => `"${s}"`).join(',')}),id.in.(${lineupStrings.map((s: string) => `"${s}"`).join(',')})`)
      : Promise.resolve({ data: [] }),
    
    supabase
      .from('event_ticket_types')
      .select('*')
      .eq('event_id', event.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
  ]);

  const artistsData = artistsResponse.data;
  const ticketTypesData = ticketTypesResponse.data;

  const normalizedEvent = normalizeEvent(event);
  const normalizedArtists = Array.isArray(artistsData)
    ? artistsData.map(normalizeArtist)
    : [];
  const normalizedTicketTypes = Array.isArray(ticketTypesData)
    ? ticketTypesData.map(normalizeTicketType)
    : [];

  return (
    <EventDetailClient 
      event={normalizedEvent} 
      artists={normalizedArtists} 
      ticketTypes={normalizedTicketTypes}
      initialIsAdmin={isServerAdmin}
    />
  );
}
