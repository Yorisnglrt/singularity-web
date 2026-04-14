'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import AuthModal from './AuthModal';
import styles from './EventActions.module.css';

interface EventActionsProps {
  eventId: string;
  ticketUrl?: string;
  ticketProvider?: 'external' | 'vipps';
  isFree?: boolean;
  isPast?: boolean;
}

const actions = [
  { key: 'like' as const,       icon: '♥',  label: 'Like'        },
  { key: 'interested' as const, icon: '★',  label: 'Interested'  },
  { key: 'attending' as const,  icon: '✓',  label: 'Attending'   },
];

type ReactionCounts = Record<typeof actions[number]['key'], number>;

interface Reactor {
  id: string;
  name: string;
}

export default function EventActions({ eventId, ticketUrl, ticketProvider, isFree, isPast }: EventActionsProps) {
  const { user, hasInteraction, toggleInteraction } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [pendingAction, setPendingAction] = useState<typeof actions[0]['key'] | null>(null);
  const [counts, setCounts] = useState<ReactionCounts>({ like: 0, interested: 0, attending: 0 });
  const [purchasing, setPurchasing] = useState(false);
  const [reactors, setReactors] = useState<Reactor[]>([]);
  const [totalReactors, setTotalReactors] = useState(0);

  const fetchInteractionStats = async () => {
    // 1. Fetch Counts (Robust, no join)
    try {
      const { data: reactionsData, error: reactionsError } = await supabase
        .from('event_reactions')
        .select('action')
        .eq('event_id', eventId);
      
      if (reactionsError) throw reactionsError;

      const newCounts: ReactionCounts = { like: 0, interested: 0, attending: 0 };
      reactionsData?.forEach((row: any) => {
        if (row.action in newCounts) {
          newCounts[row.action as keyof ReactionCounts]++;
        }
      });
      setCounts(newCounts);
    } catch (err) {
      console.error('Error fetching reaction counts:', err);
    }

    // 2. Fetch Reactors (Independent, joins profiles)
    try {
      const { data: reactorsData, error: reactorsError } = await supabase
        .from('event_reactions')
        .select(`
          user_id,
          profiles (
            display_name
          )
        `)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (reactorsError) throw reactorsError;

      const uniqueUserMap = new Map<string, Reactor>();
      reactorsData?.forEach((row: any) => {
        if (!uniqueUserMap.has(row.user_id) && row.profiles?.display_name) {
          uniqueUserMap.set(row.user_id, {
            id: row.user_id,
            name: row.profiles.display_name
          });
        }
      });

      setTotalReactors(uniqueUserMap.size);
      setReactors(Array.from(uniqueUserMap.values()).slice(0, 10));
    } catch (err) {
      console.error('Error fetching reactor profiles:', err);
      // We don't throw here to ensure counts remain visible even if profiles fail
    }
  };

  useEffect(() => {
    fetchInteractionStats();
  }, [eventId]);

  const handleAction = async (key: typeof actions[0]['key']) => {
    if (!user) {
      setPendingAction(key);
      setShowAuth(true);
      return;
    }

    const isActive = hasInteraction(eventId, key);
    
    // Optimistic count update
    setCounts(prev => ({
      ...prev,
      [key]: isActive ? Math.max(0, prev[key] - 1) : prev[key] + 1
    }));

    await toggleInteraction(eventId, key);
    // Refresh to get full reactor list and correct server-side counts
    fetchInteractionStats();
  };

  const handleAuthClose = () => {
    setShowAuth(false);
    if (user && pendingAction) {
      handleAction(pendingAction);
    }
    setPendingAction(null);
  };

  const visibleReactors = reactors.slice(0, 5);
  const remainingCount = totalReactors - visibleReactors.length;

  const handleVippsPurchase = async () => {
    setPurchasing(true);
    try {
      const res = await fetch('/api/payments/vipps/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        alert(data.error || 'Failed to start payment');
        setPurchasing(false);
      }
    } catch (err) {
      console.error('Vipps purchase error:', err);
      alert('Failed to start payment. Please try again.');
      setPurchasing(false);
    }
  };

  return (
    <>
      <div className={styles.wrapper}>
        {!isPast && (
          <div className={styles.ticketRow}>
            {isFree ? (
              <span className="tag">Free entry</span>
            ) : ticketProvider === 'vipps' ? (
              <button
                className={`${styles.ticketBtn} ${styles.vippsBtn} btn btn-primary`}
                onClick={handleVippsPurchase}
                disabled={purchasing}
                id={`buy-vipps-${eventId}`}
              >
                {purchasing ? 'Redirecting…' : 'Buy with Vipps'}
              </button>
            ) : (
              <a
                href={ticketUrl || '#'}
                className={`${styles.ticketBtn} btn btn-primary`}
                target="_blank"
                rel="noopener noreferrer"
                id={`buy-ticket-${eventId}`}
              >
                Buy ticket
              </a>
            )}
          </div>
        )}

        <div className={styles.actions}>
          {actions.map(({ key, icon, label }) => {
            const active = user ? hasInteraction(eventId, key) : false;
            const count = counts[key];
            return (
              <button
                key={key}
                className={`${styles.actionBtn} ${active ? styles.active : ''}`}
                onClick={() => handleAction(key)}
                id={`event-${key}-${eventId}`}
                aria-label={label}
                aria-pressed={active}
              >
                <span className={styles.actionIcon}>{icon}</span>
                <span className={styles.actionLabel}>{label}</span>
                {count > 0 && <span className={styles.count}>{count}</span>}
              </button>
            );
          })}
        </div>

        {totalReactors > 0 && (
          <div className={styles.socialRow}>
            <div className={styles.avatarStack}>
              {visibleReactors.map(reactor => (
                <div key={reactor.id} className={styles.avatarCircle} title={reactor.name}>
                  <span className={styles.avatarInitial}>{reactor.name[0].toUpperCase()}</span>
                </div>
              ))}
              {remainingCount > 0 && (
                <div className={`${styles.avatarCircle} ${styles.avatarMore}`}>
                  +{remainingCount}
                </div>
              )}
            </div>
          </div>
        )}

        {!user && (
          <p className={styles.loginHint}>
            <button onClick={() => setShowAuth(true)} className={styles.loginLink}>Sign in</button>
            {' '}to save your event interactions
          </p>
        )}
      </div>

      {showAuth && <AuthModal onClose={handleAuthClose} />}
    </>
  );
}
