import { notFound } from 'next/navigation';
import EventDetailClient from './EventDetailClient';
import { supabase } from '@/lib/supabase';
import { normalizeEvent } from '@/lib/data-normalization';

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamic = 'force-dynamic';

export default async function EventDetailPage({ params }: Props) {
  const { slug } = await params;
  console.log('[EventDetail] params.slug =', slug);

  const { data: event, error } = await supabase
    .from('events')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !event) {
    console.error('[EventDetail] find by slug error or null:', error);
    notFound();
  }

  const normalizedEvent = normalizeEvent(event);
  console.log('[EventDetail] loaded event:', normalizedEvent.title);

  return <EventDetailClient event={normalizedEvent} />;
}
