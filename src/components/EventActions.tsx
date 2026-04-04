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

export default function EventActions({ eventId, ticketUrl, isFree, isPast }: EventActionsProps) {
  const { user, hasInteraction, toggleInteraction } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [pendingAction, setPendingAction] = useState<typeof actions[0]['key'] | null>(null);
  const [counts, setCounts] = useState<ReactionCounts>({ like: 0, interested: 0, attending: 0 });

  const fetchCounts = async () => {
    try {
      const { data, error } = await supabase
        .from('event_reactions')
        .select('action')
        .eq('event_id', eventId);
      
      if (error) throw error;

      const newCounts: ReactionCounts = { like: 0, interested: 0, attending: 0 };
      data?.forEach((row: any) => {
        if (row.action in newCounts) {
          newCounts[row.action as keyof ReactionCounts]++;
        }
      });
      setCounts(newCounts);
    } catch (err) {
      console.error('Error fetching reaction counts:', err);
    }
  };

  useEffect(() => {
    fetchCounts();
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
    // Refresh counts from server to be sure
    fetchCounts();
  };

  const handleAuthClose = () => {
    setShowAuth(false);
    if (user && pendingAction) {
      handleAction(pendingAction);
    }
    setPendingAction(null);
  };

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
