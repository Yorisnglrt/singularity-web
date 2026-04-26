import { notFound } from 'next/navigation';
import EventDetailClient from './EventDetailClient';
import { supabase } from '@/lib/supabase';
import { normalizeEvent, normalizeArtist } from '@/lib/data-normalization';

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

  const normalizedEvent = normalizeEvent(event);
  const normalizedArtists = Array.isArray(artistsData)
    ? artistsData.map(normalizeArtist)
    : [];

  return <EventDetailClient event={normalizedEvent} artists={normalizedArtists} />;
}
