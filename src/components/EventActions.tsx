'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import AuthModal from './AuthModal';
import styles from './EventActions.module.css';

interface EventActionsProps {
  eventId: string;
  ticketUrl?: string;
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
  avatarUrl?: string;
}

export default function EventActions({ eventId, ticketUrl, isFree, isPast }: EventActionsProps) {
  const { user, hasInteraction, toggleInteraction } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [pendingAction, setPendingAction] = useState<typeof actions[0]['key'] | null>(null);
  const [counts, setCounts] = useState<ReactionCounts>({ like: 0, interested: 0, attending: 0 });
  const [reactors, setReactors] = useState<Reactor[]>([]);
  const [totalReactors, setTotalReactors] = useState(0);

  const fetchInteractionStats = async () => {
    try {
      // 1. Fetch all actions to calculate counts
      // Use select('action') to keep payload small
      const { data: allReactions, error: reactionsError } = await supabase
        .from('event_reactions')
        .select('action, user_id, profiles(display_name, avatar_url)')
        .eq('event_id', eventId);
      
      if (reactionsError) throw reactionsError;

      // Calculate counts
      const newCounts: ReactionCounts = { like: 0, interested: 0, attending: 0 };
      const uniqueUserMap = new Map<string, Reactor>();

      allReactions?.forEach((row: any) => {
        // Counts
        if (row.action in newCounts) {
          newCounts[row.action as keyof ReactionCounts]++;
        }

        // Reactors for avatar stack (unique users)
        if (!uniqueUserMap.has(row.user_id) && row.profiles) {
          uniqueUserMap.set(row.user_id, {
            id: row.user_id,
            name: row.profiles.display_name,
            avatarUrl: row.profiles.avatar_url
          });
        }
      });

      setCounts(newCounts);
      setTotalReactors(uniqueUserMap.size);
      
      // Get the first 10 for the stack
      const reactorsList = Array.from(uniqueUserMap.values()).slice(0, 10);
      setReactors(reactorsList);

    } catch (err) {
      console.error('Error fetching interaction stats:', err);
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

  return (
    <>
      <div className={styles.wrapper}>
        {!isPast && (
          <div className={styles.ticketRow}>
            {isFree ? (
              <span className="tag">Free entry</span>
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
                  {reactor.avatarUrl ? (
                    <img src={reactor.avatarUrl} alt={reactor.name} className={styles.avatarImg} />
                  ) : (
                    <span className={styles.avatarInitial}>{reactor.name[0].toUpperCase()}</span>
                  )}
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
