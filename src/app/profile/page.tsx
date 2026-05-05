'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { events, toSlug } from '@/data/events';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizeEvent, getMemberTier } from '@/lib/data-normalization';
import styles from './page.module.css';
import MemberQrCard from '@/components/MemberQrCard';

type PointsHistoryItem = {
  id: string;
  type: string | null;
  description: string | null;
  points_delta: number;
  created_at: string;
};

type UserTicket = {
  id: string;
  ticket_code: string;
  status: string;
  created_at: string;
  events: {
    id: string;
    title: string;
    date: string;
    venue: Record<string, string> | string;
  } | null;
  event_ticket_types: {
    name: string;
  } | null;
  ticket_orders: {
    id: string;
    order_reference: string;
    payment_status: string;
    created_at: string;
  } | null;
};

export default function ProfilePage() {
  const { user, interactions, logout, openAuthModal, refreshProfile } = useAuth();
  const [pointsHistory, setPointsHistory] = useState<PointsHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [dbEvents, setDbEvents] = useState<Record<string, unknown>[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [userTickets, setUserTickets] = useState<UserTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  
  // Refresh profile on mount to ensure points and tier are up-to-date
  useEffect(() => {
    if (user?.id) {
      refreshProfile();
    }
  }, [user?.id]);

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
      } catch (err: unknown) {
        console.error('Points history exception:', err);
        setHistoryError('An unexpected error occurred.');
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [user?.id]);

  useEffect(() => {
    const fetchInteractedEvents = async () => {
      if (!user?.id || interactions.length === 0) {
        setDbEvents([]);
        return;
      }

      setLoadingEvents(true);
      try {
        const eventIds = Array.from(new Set(interactions.map(i => i.eventId)));
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .in('id', eventIds);

        if (!error && data) {
          setDbEvents(data);
        }
      } catch (err) {
        console.error('Error fetching interacted events:', err);
      } finally {
        setLoadingEvents(false);
      }
    };

    fetchInteractedEvents();
  }, [user?.id, interactions]);

  useEffect(() => {
    const fetchUserTickets = async () => {
      if (!user?.id) {
        setLoadingTickets(false);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch('/api/profile/tickets', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (res.ok) {
          const data = await res.json();
          setUserTickets(data || []);
        } else {
          console.error('Failed to fetch user tickets:', await res.text());
        }
      } catch (err) {
        console.error('User tickets exception:', err);
      } finally {
        setLoadingTickets(false);
      }
    };

    fetchUserTickets();
  }, [user?.id]);

  const fetchUserTickets = async () => {
    if (user?.id) refreshProfile();
  };

  const activeTickets = userTickets.filter(t => t.status === 'valid');

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

  // Helper to get normalized event from either DB or static source
  const getEventData = (id: string) => {
    const rawDbEvent = dbEvents.find(e => e.id === id);
    if (rawDbEvent) return normalizeEvent(rawDbEvent);
    return events.find(e => e.id === id);
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
            <p className={styles.email}>{user.email}</p>
            {user.bio && <p className={styles.bio}>{user.bio}</p>}
            <div className={styles.pointsBadge} onClick={refreshProfile} style={{cursor: 'pointer'}}>
              <span className={styles.pointsIcon}>◈</span>
              <span className={styles.pointsValue}>{getMemberTier(user.points)}</span>
              <span className={styles.pointsLabel}>Rank</span>
            </div>
          </div>
          <div className={styles.headerActions}>
            {activeTickets.length > 0 && (
              <div className={styles.activeTicketsGrid}>
                {activeTickets.map(ticket => (
                  <div key={ticket.id} className={styles.activeTicketCard}>
                    <div className={styles.activeTicketHeader}>
                      <span className={styles.activeLabel}>◈ Active Ticket</span>
                      <div className={styles.activeTypeBadge}>{ticket.event_ticket_types?.name || 'Standard'}</div>
                    </div>
                    
                    <div className={styles.activeTicketBody}>
                      <h3 className={styles.activeEventTitle}>{ticket.events?.title || 'Unknown Event'}</h3>
                      <div className={styles.activeTicketCode}>{ticket.ticket_code}</div>
                    </div>

                    <div className={styles.activeTicketFooter}>
                      <div className={`${styles.statusBadge} ${styles.valid}`}>VALID</div>
                      <Link href={`/tickets/${ticket.ticket_code}`} className={styles.activeActionBtn}>
                        VIEW TICKET
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.actionButtons}>
              <button className={styles.editBtn}>Edit Profile</button>
              <button className={styles.logoutBtn} onClick={logout}>Sign Out</button>
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

        {/* Stats */}
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{attendingIds.length}</span>
            <span className={styles.statLabel}>Attending</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{interestedIds.length}</span>
            <span className={styles.statLabel}>Interested</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{likedIds.length}</span>
            <span className={styles.statLabel}>Liked</span>
          </div>
        </div>

        {/* Ticket History Section */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>◈ Ticket History</h2>
          <div className={styles.historyList}>
            {loadingTickets ? (
              <div className={styles.loading}>↻ Loading ticket history...</div>
            ) : userTickets.length > 0 ? (
              userTickets.map((ticket) => (
                <Link key={ticket.id} href={`/tickets/${ticket.ticket_code}`} className={styles.compactTicketRow}>
                  <div className={styles.ticketRowMain}>
                    <div className={styles.ticketRowEvent}>
                      <span className={styles.ticketRowTitle}>{ticket.events?.title || 'Unknown Event'}</span>
                      <span className={styles.ticketRowMeta}>
                        {ticket.events?.date ? new Date(ticket.events.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                        {' · '}
                        {ticket.event_ticket_types?.name || 'Ticket'}
                      </span>
                    </div>
                    <div className={styles.ticketRowDetails}>
                      <span className={styles.ticketRowCode}>{ticket.ticket_code}</span>
                      <span className={`${styles.statusBadge} ${styles[ticket.status] || ''}`}>
                        {ticket.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className={styles.empty}>
                <p>No ticket history found.</p>
              </div>
            )}
          </div>
        </div>

        {/* Unified Event Activity */}
        {interactions.length > 0 && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>◈ Your Events</h2>
            <div className={styles.eventList}>
              {Array.from(new Set(interactions.map(i => i.eventId))).map(id => {
                const ev = getEventData(id);
                if (!ev) return null;

                const eventSlug = toSlug(ev);
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventSlug);
                const hasValidSlug = eventSlug && !isUuid;
                
                const userActions = interactions.filter(i => i.eventId === id).map(i => i.action);
                
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
              <div className={styles.membershipItem}>
                <span className={styles.membershipLabel}>Registered</span>
                <span className={styles.membershipValue}>{new Date(user.createdAt).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>

            <div style={{ height: 'var(--space-2)' }} />
          </div>
        </div>

        {/* Member QR Section */}
        <div className={styles.memberQrSection}>
          <MemberQrCard
            qrToken={user.qrToken || null}
            displayName={user.displayName}
            memberCode={user.memberCode || null}
            tier={user.tier || null}
            isAdmin={user.isAdmin}
          />
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
