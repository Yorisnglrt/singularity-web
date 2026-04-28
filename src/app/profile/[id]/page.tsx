import { notFound } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { normalizeProfile, getMemberTier, normalizeEvent } from '@/lib/data-normalization';
import { events, toSlug } from '@/data/events';
import styles from '../page.module.css';

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export default async function PublicProfilePage({ params }: Props) {
  const { id } = await params;

  // Fetch only safe public fields
  const { data: profile, error } = await supabase
    .from('profiles')
    .select(`
      id,
      display_name,
      avatar_url,
      bio,
      favorite_producer,
      favorite_track,
      favorite_subgenre,
      favorite_venue,
      favorite_festival,
      city,
      points,
      created_at
    `)
    .eq('id', id)
    .single();

  if (error || !profile) {
    notFound();
  }

  const user = normalizeProfile(profile);
  const tier = getMemberTier(user.points);

  // Fetch event activity
  const { data: reactionsData } = await supabase
    .from('event_reactions')
    .select('event_id, event_id_legacy, action')
    .eq('user_id', id);

  const interactions = (reactionsData || []).map(i => ({
    eventId: (i.event_id || i.event_id_legacy) as string,
    action: i.action as any
  }));

  const uniqueEventIds = Array.from(new Set(interactions.map(i => i.eventId)));
  
  // Fetch event details for activity
  const { data: dbEvents } = await supabase
    .from('events')
    .select('*')
    .in('id', uniqueEventIds);

  const getEventData = (eventId: string) => {
    const rawDbEvent = dbEvents?.find(e => e.id === eventId);
    if (rawDbEvent) return normalizeEvent(rawDbEvent);
    return events.find(e => e.id === eventId);
  };

  return (
    <div className={styles.page}>
      <div className="container">
        {/* Profile header */}
        <div className={styles.profileHeader}>
          <div className={styles.avatar}>
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.displayName} className={styles.avatarImage} />
            ) : (
              user.avatarInitial
            )}
          </div>
          <div className={styles.profileInfo}>
            {user.city && <div className={styles.location}>◈ {user.city}</div>}
            <h1 className={styles.displayName}>{user.displayName}</h1>
            {user.bio && <p className={styles.bio}>{user.bio}</p>}
            <div className={styles.rankBlock}>
              <span className={styles.rankLabel}>Rank</span>
              <span className={styles.rankValue}>{tier}</span>
            </div>
          </div>
        </div>

        {/* Music & Scene Favorites */}
        {(user.favoriteProducer || user.favoriteTrack || user.favoriteSubgenre || user.favoriteVenue || user.favoriteFestival) && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>◈ Music & Scene Favorites</h2>
            <div className={styles.favoritesGrid}>
              {user.favoriteProducer && (
                <div className={styles.favoriteItem}>
                  <span className={styles.favoriteLabel}>Favorite Producer</span>
                  <span className={styles.favoriteValue}>{user.favoriteProducer}</span>
                </div>
              )}
              {user.favoriteTrack && (
                <div className={styles.favoriteItem}>
                  <span className={styles.favoriteLabel}>Favorite Track</span>
                  <span className={styles.favoriteValue}>{user.favoriteTrack}</span>
                </div>
              )}
              {user.favoriteSubgenre && (
                <div className={styles.favoriteItem}>
                  <span className={styles.favoriteLabel}>Favorite Subgenre</span>
                  <span className={styles.favoriteValue}>{user.favoriteSubgenre}</span>
                </div>
              )}
              {user.favoriteVenue && (
                <div className={styles.favoriteItem}>
                  <span className={styles.favoriteLabel}>Favorite Venue</span>
                  <span className={styles.favoriteValue}>{user.favoriteVenue}</span>
                </div>
              )}
              {user.favoriteFestival && (
                <div className={styles.favoriteItem}>
                  <span className={styles.favoriteLabel}>Favorite Festival</span>
                  <span className={styles.favoriteValue}>{user.favoriteFestival}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Event Activity */}
        {interactions.length > 0 && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>◈ Event Activity</h2>
            <div className={styles.eventList}>
              {uniqueEventIds.map(eventId => {
                const ev = getEventData(eventId);
                if (!ev) return null;

                const eventSlug = toSlug(ev);
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventSlug);
                const hasValidSlug = eventSlug && !isUuid;
                
                const userActions = interactions.filter(i => i.eventId === eventId).map(i => i.action);
                
                const content = (
                  <>
                    <div className={styles.eventDot} style={{ background: ev.posterColor }} />
                    <div style={{ flex: 1 }}>
                      <div className={styles.eventName}>{ev.title}</div>
                      <div className={styles.eventMeta}>
                        {new Date(ev.date).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })} · {typeof ev.venue === 'string' ? ev.venue : Object.values(ev.venue)[0]}
                      </div>
                    </div>
                    <div className={styles.badgeRow}>
                      {userActions.includes('attending') && <span className={`${styles.miniBadge} ${styles.attendingBadge}`}>✓ Attending</span>}
                      {userActions.includes('interested') && <span className={`${styles.miniBadge} ${styles.interestedBadge}`}>★ Interested</span>}
                      {userActions.includes('like') && <span className={`${styles.miniBadge} ${styles.likeBadge}`}>♥ Liked</span>}
                    </div>
                  </>
                );

                if (hasValidSlug) {
                  return (
                    <Link key={ev.id} href={`/events/${eventSlug}`} className={styles.eventRow}>
                      {content}
                    </Link>
                  );
                }

                return (
                  <div key={ev.id} className={styles.eventRow} style={{ cursor: 'default' }}>
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
