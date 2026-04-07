'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import { events } from '@/data/events';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './page.module.css';
import AppleWalletButton from '@/components/AppleWalletButton';

type PointsHistoryItem = {
  id: string;
  type: string | null;
  description: string | null;
  points_delta: number;
  created_at: string;
};

export default function ProfilePage() {
  const { user, interactions, logout, openAuthModal, refreshProfile } = useAuth();
  const [pointsHistory, setPointsHistory] = useState<PointsHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user?.id) {
        setLoadingHistory(false);
        return;
      }
      
      setHistoryError(null);
      
      try {
        const { data, error } = await supabase
          .from('points_log')
          .select('id, type, description, points_delta, created_at')
          .eq('profile_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) {
          console.error('Error fetching points history:', error);
          setHistoryError('Unable to load membership history right now.');
          setPointsHistory([]);
        } else {
          setPointsHistory(data || []);
        }
      } catch (err) {
        console.error('Points history exception:', err);
        setHistoryError('An unexpected error occurred.');
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [user?.id]);

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
            <div className={styles.pointsBadge} onClick={refreshProfile} style={{cursor: 'pointer'}}>
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

        {/* Membership Card */}
        <div className={styles.membershipCard}>
          <h2 className={styles.sectionTitle}>◈ Membership</h2>
          <div className={styles.membershipContent}>
            <div className={styles.membershipGrid}>
              <div className={styles.membershipItem}>
                <span className={styles.membershipLabel}>Tier</span>
                <span className={styles.membershipValue}>{user.tier || 'Observer'}</span>
              </div>
              <div className={styles.membershipItem}>
                <span className={styles.membershipLabel}>Member Code</span>
                <span className={styles.membershipValue} style={{fontFamily: 'var(--font-mono)', letterSpacing: '0.1em'}}>{user.memberCode || '—'}</span>
              </div>
              <div className={styles.membershipItem}>
                <span className={styles.membershipLabel}>Points</span>
                <span className={styles.membershipValue}>{user.points}</span>
              </div>
              <div className={styles.membershipItem}>
                <span className={styles.membershipLabel}>Member Since</span>
                <span className={styles.membershipValue}>{user.memberSince ? new Date(user.memberSince).toLocaleDateString('en', { month: 'short', year: 'numeric' }) : '—'}</span>
              </div>
            </div>

            <AppleWalletButton />

            <div className={styles.qrSection}>
              {user.qrToken ? (
                <div className={styles.qrContainer}>
                  <QRCodeSVG 
                    value={user.qrToken}
                    size={124}
                    bgColor={"#ffffff"}
                    fgColor={"#000000"}
                    level={"L"}
                    includeMargin={false}
                    className={styles.qrImage}
                  />
                </div>
              ) : (
                <div className={styles.qrPlaceholder}>
                  <span className={styles.qrPlaceholderIcon}>◈</span>
                  <span className={styles.qrPlaceholderText}>QR info missing</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Membership History */}
        <div className={styles.historySection}>
          <h2 className={styles.sectionTitle}>◈ Membership History</h2>
          <div className={styles.historyContainer}>
            {loadingHistory ? (
              <div className={styles.historyLoading}>↻ Loading history...</div>
            ) : historyError ? (
              <div className={styles.historyError}>{historyError}</div>
            ) : pointsHistory.length > 0 ? (
              <div className={styles.historyList}>
                {pointsHistory.map((item) => (
                  <div key={item.id} className={styles.historyItem}>
                    <div className={styles.historyMain}>
                      <span className={styles.historyType}>{item.type}</span>
                      <p className={styles.historyDesc}>{item.description}</p>
                      <span className={styles.historyDate}>
                        {new Date(item.created_at).toLocaleString('en-GB', { 
                          day: 'numeric', 
                          month: 'short', 
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <div className={`${styles.historyDelta} ${item.points_delta >= 0 ? styles.plus : styles.minus}`}>
                      {item.points_delta >= 0 ? '+' : ''}{item.points_delta} RP
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.historyEmpty}>
                No membership history available yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
