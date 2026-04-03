'use client';

import { useState } from 'react';
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

export default function EventActions({ eventId, ticketUrl, isFree, isPast }: EventActionsProps) {
  const { user, hasInteraction, toggleInteraction } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [pendingAction, setPendingAction] = useState<typeof actions[0]['key'] | null>(null);

  const handleAction = (key: typeof actions[0]['key']) => {
    if (!user) {
      setPendingAction(key);
      setShowAuth(true);
      return;
    }
    toggleInteraction(eventId, key);
  };

  const handleAuthClose = () => {
    setShowAuth(false);
    // If they logged in and had a pending action, execute it
    if (user && pendingAction) {
      toggleInteraction(eventId, pendingAction);
    }
    setPendingAction(null);
  };

  return (
    <>
      <div className={styles.wrapper}>
        {/* Ticket / Free CTA — only for upcoming events */}
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

        {/* Interaction buttons */}
        <div className={styles.actions}>
          {actions.map(({ key, icon, label }) => {
            const active = user ? hasInteraction(eventId, key) : false;
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
