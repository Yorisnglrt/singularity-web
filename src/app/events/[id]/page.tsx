import { findEventBySlug } from '@/data/events';
import { notFound } from 'next/navigation';
import EventDetailClient from './EventDetailClient';

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export default async function EventDetailPage({ params }: Props) {
  const { id } = await params;
  console.log('[EventDetail] params.id =', id);
  const event = findEventBySlug(id);
  console.log('[EventDetail] findEventBySlug result =', event ? event.title : 'NOT FOUND');
  if (!event) notFound();
  return <EventDetailClient event={event} />;
}
