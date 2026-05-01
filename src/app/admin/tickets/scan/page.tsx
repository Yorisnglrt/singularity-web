'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';

export default function TicketScannerPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  
  const [query, setQuery] = useState('');
  const [ticket, setTicket] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && (!user || !user.isAdmin)) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  // Focus input on load
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setError(null);
    setTicket(null);
    setSuccess(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/tickets/lookup?query=${encodeURIComponent(query.trim())}`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        setTicket(data);
        setQuery(''); // Clear for next scan
      } else {
        const err = await res.json();
        setError(err.error || 'Ticket not found');
      }
    } catch (err) {
      console.error('Lookup error:', err);
      setError('Connection error');
    } finally {
      setSearching(false);
    }
  };

  const handleCheckIn = async () => {
    if (!ticket || ticket.status !== 'valid') return;

    setCheckingIn(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/tickets/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ ticketId: ticket.id })
      });

      if (res.ok) {
        setSuccess(true);
        // Refresh ticket info locally
        setTicket({
          ...ticket,
          status: 'used',
          used_at: new Date().toISOString()
        });
      } else {
        const err = await res.json();
        setError(err.error || 'Check-in failed');
      }
    } catch (err) {
      console.error('Check-in error:', err);
      setError('Connection error');
    } finally {
      setCheckingIn(false);
    }
  };

  if (isLoading || !user || !user.isAdmin) {
    return <div className={styles.adminPage}><div className={styles.alert}>Authenticating...</div></div>;
  }

  return (
    <div className={styles.adminPage}>
      <div className={styles.scannerContainer}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <Link href="/admin" className={styles.backLink}>← Dashboard</Link>
            <h1 className={styles.title}>Ticket Scanner</h1>
          </div>
          <div className={styles.statusIndicator}>
            Admin: {user.displayName}
          </div>
        </header>

        <div className={styles.scanSection}>
          <form onSubmit={handleLookup} className={styles.scanForm}>
            <input
              ref={inputRef}
              type="text"
              className={styles.scanInput}
              placeholder="Scan QR or enter ticket code..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={searching}
              autoComplete="off"
            />
            <button type="submit" className={styles.scanBtn} disabled={searching || !query.trim()}>
              {searching ? '...' : 'Search'}
            </button>
          </form>
        </div>

        {error && (
          <div className={`${styles.alert} ${styles.alertError}`}>
            ◈ {error}
          </div>
        )}

        {success && (
          <div className={`${styles.alert} ${styles.alertSuccess}`}>
            ◈ CHECK-IN SUCCESSFUL
          </div>
        )}

        {ticket && (
          <div className={`${styles.ticketDetails} ${styles[ticket.status]}`}>
            <div className={styles.ticketHeader}>
              <div className={styles.statusBadgeLarge}>
                {ticket.status.toUpperCase()}
              </div>
              <div className={styles.ticketMeta}>
                <span className={styles.orderRef}>Ref: {ticket.ticket_orders?.order_reference || 'N/A'}</span>
                <span className={styles.ticketCode}>{ticket.ticket_code}</span>
              </div>
            </div>

            <div className={styles.infoGrid}>
              <div className={styles.infoGroup}>
                <label>Event</label>
                <div className={styles.infoValue}>{ticket.events?.title}</div>
                <div className={styles.infoSub}>{new Date(ticket.events?.date).toLocaleDateString()} · {ticket.events?.venue}</div>
              </div>

              <div className={styles.infoGroup}>
                <label>Ticket Type</label>
                <div className={styles.infoValue}>{ticket.event_ticket_types?.name}</div>
              </div>

              <div className={styles.infoGroup}>
                <label>Holder</label>
                <div className={styles.infoValue}>{ticket.holder_name || 'N/A'}</div>
                <div className={styles.infoSub}>{ticket.holder_email}</div>
              </div>

              {ticket.status === 'used' && (
                <div className={styles.infoGroup}>
                  <label>Used At</label>
                  <div className={styles.infoValue} style={{color: '#ffcc00'}}>
                    {new Date(ticket.used_at).toLocaleString('en-GB')}
                  </div>
                </div>
              )}
            </div>

            {ticket.status === 'valid' && !success && (
              <button 
                className={styles.checkInBtn} 
                onClick={handleCheckIn} 
                disabled={checkingIn}
              >
                {checkingIn ? 'Processing...' : 'CHECK IN NOW'}
              </button>
            )}

            {ticket.status === 'used' && (
              <div className={styles.statusMessage}>
                This ticket was already scanned.
              </div>
            )}

            {ticket.status === 'void' && (
              <div className={styles.statusMessage} style={{color: '#ff3b5c'}}>
                ENTRY DENIED: Ticket is void.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
