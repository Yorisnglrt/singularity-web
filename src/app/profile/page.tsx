'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { events } from '@/data/events';
import styles from './page.module.css';

export default function ProfilePage() {
  const { user, interactions, logout, openAuthModal } = useAuth();

  if (!user) {
    return (
      <div className={styles.page}>
        <div className="container">
          <div className={styles.unauthenticated}>
            <span className={styles.icon}>◈</span>
            <h1>Sign in to view your profile</h1>
            <p>Track your event interactions, earn loyalty points, and save your favourites.</p>
            <button onClick={openAuthModal} className="btn btn-primary">Sign In / Register</button>
          </div>
        </div>
      </div>
    );
  }

  const attendingIds = interactions.filter(i => i.action === 'attending').map(i => i.eventId);
  const interestedIds = interactions.filter(i => i.action === 'interested').map(i => i.eventId);
  const likedIds = interactions.filter(i => i.action === 'like').map(i => i.eventId);

  const attendingEvents = events.filter(e => attendingIds.includes(e.id));
  const interestedEvents = events.filter(e => interestedIds.includes(e.id));
  const likedEvents = events.filter(e => likedIds.includes(e.id));

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
            <p className={styles.email}>{user.email}</p>
            {user.bio && <p className={styles.bio}>{user.bio}</p>}
            <div className={styles.pointsBadge}>
              <span className={styles.pointsIcon}>◈</span>
              <span className={styles.pointsValue}>{user.points}</span>
              <span className={styles.pointsLabel}>points</span>
            </div>
          </div>
          <div className={styles.headerActions}>
            <Link href="/profile/settings" className={styles.editBtn}>Edit Profile</Link>
            <button onClick={logout} className={styles.logoutBtn}>Sign out</button>
          </div>
        </div>

        {/* Stats */}
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{attendingEvents.length}</span>
            <span className={styles.statLabel}>Attending</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{interestedEvents.length}</span>
            <span className={styles.statLabel}>Interested</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{likedEvents.length}</span>
            <span className={styles.statLabel}>Liked</span>
          </div>
        </div>

        {/* Event sections */}
        {[
          { title: 'Attending', evs: attendingEvents, icon: '✓' },
          { title: 'Interested', evs: interestedEvents, icon: '★' },
          { title: 'Liked', evs: likedEvents, icon: '♥' },
        ].map(({ title, evs, icon }) => evs.length > 0 && (
          <div key={title} className={styles.section}>
            <h2 className={styles.sectionTitle}><span>{icon}</span> {title}</h2>
            <div className={styles.eventList}>
              {evs.map(ev => (
                <Link key={ev.id} href={`/events/${ev.id}`} className={styles.eventRow}>
                  <div className={styles.eventDot} style={{ background: ev.posterColor }} />
                  <div>
                    <div className={styles.eventName}>{ev.title}</div>
                    <div className={styles.eventMeta}>{new Date(ev.date).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })} · {typeof ev.venue === 'string' ? ev.venue : Object.values(ev.venue)[0]}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}

        {interactions.length === 0 && (
          <div className={styles.empty}>
            <p>You haven&apos;t interacted with any events yet.</p>
            <Link href="/events" className="btn btn-primary" style={{marginTop: '1rem'}}>Browse Events</Link>
          </div>
        )}

        {/* Future sections placeholder */}
        <div className={styles.comingSoon}>
          <h2 className={styles.sectionTitle}>◈ Membership & Rewards</h2>
          <p className={styles.comingSoonText}>Loyalty points, member perks, and rewards are coming soon.</p>
        </div>
      </div>
    </div>
  );
}
