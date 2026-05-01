'use client';

import React, { useEffect, useState, use, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import styles from './page.module.css';

function TicketContent({ ticketCode }: { ticketCode: string }) {
  const { user, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const from = searchParams.get('from');
  const accessToken = searchParams.get('access');
  
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const backHref = from === 'admin-sales' ? '/admin/ticket-sales' : '/profile';
  const backLabel = from === 'admin-sales' ? '← Back to Ticket Sales' : '← Back to Profile';

  useEffect(() => {
    const fetchTicket = async () => {
      if (authLoading) return;

      // If no user AND no accessToken, then block
      if (!user && !accessToken) {
        setError('Please sign in to view your ticket.');
        setLoading(false);
        return;
      }

      try {
        let ticketData;

        if (accessToken) {
          // Guest fetch via internal API
          const response = await fetch(`/api/tickets/guest-view?ticketCode=${encodeURIComponent(ticketCode)}&accessToken=${accessToken}`);
          if (!response.ok) {
            throw new Error('Ticket not found or access denied');
          }
          ticketData = await response.json();
        } else if (user) {
          // Standard fetch via Supabase client (RLS enforced)
          const { data, error } = await supabase
            .from('tickets')
            .select(`
              *,
              events (
                title,
                date,
                venue
              ),
              event_ticket_types (
                name
              ),
              ticket_orders (
                order_reference
              )
            `)
            .eq('ticket_code', ticketCode)
            .single();

          if (error) throw error;
          ticketData = data;
        }

        if (!ticketData) {
          setError('Ticket not found or access denied.');
        } else {
          setTicket(ticketData);
        }
      } catch (err) {
        console.error('Ticket fetch error:', err);
        setError('Ticket not found or access denied.');
      } finally {
        setLoading(false);
      }
    };

    fetchTicket();
  }, [ticketCode, user, authLoading, accessToken]);

  if (loading || authLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>↻ Validating Ticket...</div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>
          <h2 className={styles.errorTitle}>Error</h2>
          <p>{error || 'Ticket not found.'}</p>
          <Link href={backHref} className={styles.backLink}>{backLabel}</Link>
        </div>
      </div>
    );
  }

  // Venue resolution
  const venue = ticket.events?.venue;
  const resolvedVenue = typeof venue === 'string' 
    ? venue 
    : (venue?.en && venue.en !== 'TB' ? venue.en : (venue?.no && venue.no !== 'TB' ? venue.no : 'Oslo'));

  return (
    <div className={styles.page}>
      <Link href={backHref} className={styles.backLink}>{backLabel}</Link>
      
      <div className={styles.ticketContainer}>
        <div className={styles.ticketHeader}>
          <h1 className={styles.eventTitle}>{ticket.events?.title || 'Unknown Event'}</h1>
          <div className={styles.eventDate}>
            {ticket.events?.date ? new Date(ticket.events.date).toLocaleDateString('en-GB', { 
              weekday: 'short',
              day: 'numeric', 
              month: 'long', 
              year: 'numeric' 
            }) : 'Date TBA'}
          </div>
          <div className={styles.venueName}>{resolvedVenue}</div>
        </div>

        <div className={styles.qrSection}>
          <div className={styles.qrWrapper}>
            <QRCodeSVG 
              value={ticket.qr_payload || ticket.ticket_code} 
              size={200}
              level="H"
              includeMargin={false}
            />
          </div>
          <div className={styles.qrInstruction}>Show this QR at the entrance</div>
          <div className={styles.ticketCode}>{ticket.ticket_code}</div>
        </div>

        <div className={styles.ticketInfo}>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.label}>Ticket Type</span>
              <span className={styles.value}>{ticket.event_ticket_types?.name || 'Standard Entry'}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>Status</span>
              <span className={`${styles.statusBadge} ${styles[ticket.status] || ''}`}>
                {ticket.status.toUpperCase()}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>Holder</span>
              <div className={styles.holderInfo}>
                <span className={styles.value}>
                  {ticket.holder_name || ticket.holder_email || 'Ticket holder'}
                </span>
                {ticket.holder_name && ticket.holder_email && (
                  <span className={styles.holderSecondary}>{ticket.holder_email}</span>
                )}
              </div>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>Order Ref</span>
              <span className={styles.value}>{ticket.ticket_orders?.order_reference || '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TicketDetailPage({ params }: { params: Promise<{ ticketCode: string }> }) {
  const { ticketCode } = use(params);

  return (
    <Suspense fallback={<div className={styles.page}><div className={styles.loading}>Loading...</div></div>}>
      <TicketContent ticketCode={ticketCode} />
    </Suspense>
  );
}
