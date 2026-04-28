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

  const { data: artistsData } = await supabase
    .from('artists')
    .select('*');

  const { data: ticketTypesData } = await supabase
    .from('event_ticket_types')
    .select('*')
    .eq('event_id', event.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

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
