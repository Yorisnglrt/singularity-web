import { notFound } from 'next/navigation';
import EventDetailClient from './EventDetailClient';
import { supabase } from '@/lib/supabase';
import { normalizeEvent, normalizeArtist, normalizeTicketType } from '@/lib/data-normalization';

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamic = 'force-dynamic';

export default async function EventDetailPage({ params }: Props) {
  const { slug } = await params;

  const { data: event, error } = await supabase
    .from('events')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !event) {
    notFound();
  }

  // Prepare lineup filter
  const lineupStrings = Array.isArray(event.lineup) ? event.lineup.map((s: any) => String(s)) : [];
  
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
    />
  );
}
