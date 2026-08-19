'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';

type ViewMode = 'scanner' | 'result';
type InputMode = 'code' | 'email';
type StatusFilter = 'all' | 'valid' | 'used';

interface TicketRow {
  id: string;
  ticket_code: string;
  short_code: string | null;
  status: string;
  used_at: string | null;
  holder_name: string | null;
  holder_email: string | null;
  ticket_type: string | null;
  event_ticket_types?: { name: string } | null;
  events?: { title: string; date: string; venue: any } | null;
  ticket_orders?: { order_reference: string; customer_email: string } | null;
  wrongEvent?: boolean;
}

interface EventOption {
  id: string;
  title: string;
  date: string;
}

interface Stats {
  total: number;
  checkedIn: number;
  remaining: number;
}

export default function TicketScannerPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  // ── Event selector ──
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [showOlderEvents, setShowOlderEvents] = useState(false);

  // ── Stats ──
  const [stats, setStats] = useState<Stats>({ total: 0, checkedIn: 0, remaining: 0 });

  // ── Ticket list ──
  const [eventTickets, setEventTickets] = useState<TicketRow[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // ── View state ──
  const [viewMode, setViewMode] = useState<ViewMode>('scanner');
  const [inputMode, setInputMode] = useState<InputMode>('code');

  // ── Scan result ──
  const [resultTicket, setResultTicket] = useState<TicketRow | null>(null);
  const [resultError, setResultError] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInSuccess, setCheckInSuccess] = useState(false);

  // ── Manual input ──
  const [codeQuery, setCodeQuery] = useState('');
  const [emailQuery, setEmailQuery] = useState('');
  const [emailResults, setEmailResults] = useState<TicketRow[]>([]);
  const [emailSearching, setEmailSearching] = useState(false);

  // ── Scanner ──
  const [cameraError, setCameraError] = useState('');
  const scannerRef = useRef<any>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const lastScannedRef = useRef('');

  // ── Auth guard ──
  useEffect(() => {
    if (!isLoading && (!user || !user.isAdmin)) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  // ── Fetch events ──
  useEffect(() => {
    if (!user?.isAdmin) return;

    const fetchEvents = async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, date')
        .order('date', { ascending: false });

      if (error || !data) return;

      setEvents(data);

      // Auto-select most relevant event
      if (data.length > 0 && !selectedEventId) {
        const now = new Date();
        const upcoming = data
          .filter((e: EventOption) => new Date(e.date) >= now)
          .sort((a: EventOption, b: EventOption) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (upcoming.length > 0) {
          setSelectedEventId(upcoming[0].id);
        } else {
          // Most recent past event
          setSelectedEventId(data[0].id);
        }
      }
    };

    fetchEvents();
  }, [user?.isAdmin]);

  // ── Filter events for display ──
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const displayedEvents = showOlderEvents
    ? events
    : events.filter(e => new Date(e.date) >= threeMonthsAgo);

  // ── Fetch stats + ticket list when event changes ──
  const fetchEventData = useCallback(async (eventId: string) => {
    if (!eventId) return;
    setTicketsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/tickets/stats?eventId=${eventId}`, {
        headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
      });

      if (res.ok) {
        const data = await res.json();
        setStats({ total: data.total, checkedIn: data.checkedIn, remaining: data.remaining });
        setEventTickets(data.tickets || []);
      }
    } catch (err) {
      console.error('Stats fetch error:', err);
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      fetchEventData(selectedEventId);
      // Clear email search when event changes
      setEmailResults([]);
      setEmailQuery('');
    }
  }, [selectedEventId, fetchEventData]);

  // ── Camera lifecycle ──
  const killAllVideoTracks = useCallback(() => {
    try {
      const videos = document.querySelectorAll('video');
      videos.forEach((video) => {
        const stream = (video as HTMLVideoElement).srcObject as MediaStream | null;
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
          (video as HTMLVideoElement).srcObject = null;
        }
      });
    } catch {}
  }, []);

  const stopScanner = useCallback(async () => {
    const instance = scannerRef.current;
    if (!instance) return;
    try {
      const state = instance.getState();
      if (state === 2 || state === 3) {
        await instance.stop();
      }
      instance.clear();
    } catch {}
    scannerRef.current = null;
    killAllVideoTracks();
  }, [killAllVideoTracks]);

  // ── Lookup ticket (scan or code entry) ──
  const lookupTicket = useCallback(async (value: string) => {
    if (!value.trim()) return;

    setViewMode('result');
    setResultTicket(null);
    setResultError('');
    setCheckInSuccess(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams({ query: value.trim() });
      if (selectedEventId) params.set('eventId', selectedEventId);

      const res = await fetch(`/api/admin/tickets/lookup?${params}`, {
        headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
      });

      if (res.ok) {
        const data = await res.json();
        setResultTicket(data);
      } else {
        const err = await res.json();
        setResultError(err.error || 'Ticket not found');
      }
    } catch {
      setResultError('Connection error');
    }
  }, [selectedEventId]);

  // ── Start camera scanner ──
  const startScanner = useCallback(async () => {
    if (!scannerContainerRef.current) return;
    setCameraError('');

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      await stopScanner();

      if (!mountedRef.current || !scannerContainerRef.current) return;
      scannerContainerRef.current.innerHTML = '';

      const scannerId = 'qr-scanner-viewport';
      const div = document.createElement('div');
      div.id = scannerId;
      scannerContainerRef.current.appendChild(div);

      const html5QrCode = new Html5Qrcode(scannerId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, aspectRatio: 1.333333 },
        (decodedText: string) => {
          if (decodedText === lastScannedRef.current) return;
          lastScannedRef.current = decodedText;
          stopScanner();
          lookupTicket(decodedText);
        },
        () => {}
      );
    } catch (err: any) {
      setCameraError('Camera error. Use manual input.');
    }
  }, [stopScanner, lookupTicket]);

  // ── Auto-start scanner ──
  useEffect(() => {
    mountedRef.current = true;
    if (viewMode === 'scanner' && user?.isAdmin) {
      const timer = setTimeout(() => startScanner(), 300);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    }
  }, [viewMode, user?.isAdmin, startScanner, stopScanner]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopScanner();
    };
  }, [stopScanner]);

  // ── Scroll to top on result ──
  useEffect(() => {
    if (viewMode === 'result') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [viewMode]);

  // ── Manual code lookup ──
  const handleCodeLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeQuery.trim()) return;
    stopScanner();
    lookupTicket(codeQuery.trim());
    setCodeQuery('');
  };

  // ── Email search ──
  const handleEmailSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailQuery.trim() || !selectedEventId) return;
    setEmailSearching(true);
    setEmailResults([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams({
        mode: 'search',
        query: emailQuery.trim(),
        eventId: selectedEventId,
      });

      const res = await fetch(`/api/admin/tickets/lookup?${params}`, {
        headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
      });

      if (res.ok) {
        const data = await res.json();
        setEmailResults(data);
      }
    } catch (err) {
      console.error('Email search error:', err);
    } finally {
      setEmailSearching(false);
    }
  };

  // ── Select a ticket from email results or ticket list ──
  const handleSelectTicket = (ticket: TicketRow) => {
    stopScanner();
    setResultTicket(ticket);
    setCheckInSuccess(false);
    setResultError('');
    setViewMode('result');
  };

  // ── Check-in ──
  const handleCheckIn = async () => {
    if (!resultTicket || resultTicket.status !== 'valid') return;
    setCheckingIn(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/tickets/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ ticketId: resultTicket.id })
      });

      if (res.ok) {
        const now = new Date().toISOString();
        setCheckInSuccess(true);
        setResultTicket({ ...resultTicket, status: 'used', used_at: now });

        // Optimistic update: ticket list + counters
        setEventTickets(prev => prev.map(t =>
          t.id === resultTicket.id ? { ...t, status: 'used', used_at: now } : t
        ));
        setStats(prev => ({
          ...prev,
          checkedIn: prev.checkedIn + 1,
          remaining: Math.max(0, prev.remaining - 1),
        }));
      } else {
        const err = await res.json();
        if (res.status === 409) {
          // Already used — update local state
          setResultTicket({ ...resultTicket, status: 'used', used_at: err.used_at });
          setResultError(err.message || 'Already checked in');
        } else {
          setResultError(err.error || 'Check-in failed');
        }
      }
    } catch {
      setResultError('Connection error');
    } finally {
      setCheckingIn(false);
    }
  };

  // ── Back to scanner ──
  const handleScanAnother = () => {
    lastScannedRef.current = '';
    setResultTicket(null);
    setResultError('');
    setCheckInSuccess(false);
    setViewMode('scanner');
  };

  // ── Filtered ticket list ──
  const filteredTickets = eventTickets.filter(t => {
    if (statusFilter === 'valid') return t.status === 'valid';
    if (statusFilter === 'used') return t.status === 'used';
    return true;
  });

  // ── Render guards ──
  if (isLoading || !user || !user.isAdmin) {
    return <div className={styles.page}><div className={styles.loadingState}>Authenticating...</div></div>;
  }

  const resolveEmail = (t: TicketRow) =>
    t.holder_email || t.ticket_orders?.customer_email || '';

  const resolveTypeName = (t: TicketRow) =>
    t.event_ticket_types?.name || (t.ticket_type === 'guest' ? 'Guest' : '');

  // ── RESULT VIEW ──
  if (viewMode === 'result') {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <header className={styles.header}>
            <Link href="/admin" className={styles.backLink}>← Admin</Link>
            <h1 className={styles.title}>Scanner</h1>
            <div className={styles.adminDot} />
          </header>

          <div className={styles.resultSection}>
            {/* Error / Not Found */}
            {resultError && !resultTicket && (
              <div className={`${styles.statusBadge} ${styles.badgeInvalid}`}>NOT FOUND</div>
            )}

            {/* Success flash */}
            {checkInSuccess && (
              <div className={`${styles.statusBadge} ${styles.badgeSuccess}`}>✓ CHECKED IN</div>
            )}

            {/* Wrong event warning */}
            {resultTicket?.wrongEvent && (
              <div className={`${styles.statusBadge} ${styles.badgeWarn}`}>⚠ WRONG EVENT</div>
            )}

            {/* Ticket status badges */}
            {resultTicket && !checkInSuccess && !resultTicket.wrongEvent && (
              <>
                {resultTicket.status === 'valid' && <div className={`${styles.statusBadge} ${styles.badgeValid}`}>VALID</div>}
                {resultTicket.status === 'used' && <div className={`${styles.statusBadge} ${styles.badgeUsed}`}>ALREADY USED</div>}
                {resultTicket.status === 'void' && <div className={`${styles.statusBadge} ${styles.badgeVoid}`}>VOID</div>}
              </>
            )}

            {/* Check-in button */}
            {resultTicket && resultTicket.status === 'valid' && !checkInSuccess && !resultTicket.wrongEvent && (
              <button className={styles.checkInBtn} onClick={handleCheckIn} disabled={checkingIn}>
                {checkingIn ? '...' : 'CHECK IN'}
              </button>
            )}

            {/* Message */}
            {(resultError || checkInSuccess || (resultTicket && resultTicket.status !== 'valid')) && (
              <p className={styles.resultMessage}>
                {resultError
                  || (checkInSuccess ? 'Entry granted' : '')
                  || (resultTicket?.status === 'used' && resultTicket.used_at
                    ? `Used ${new Date(resultTicket.used_at).toLocaleTimeString()}`
                    : 'Entry denied')
                }
              </p>
            )}

            {/* Compact details */}
            {resultTicket && (
              <div className={styles.detailsBox}>
                <div className={styles.detailsGrid}>
                  <div className={styles.detailItem}>
                    <label>Event</label>
                    <span>{resultTicket.events?.title || '—'}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <label>Type</label>
                    <span>{resolveTypeName(resultTicket) || '—'}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <label>Holder</label>
                    <span>{resultTicket.holder_name || resolveEmail(resultTicket) || '—'}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <label>Code</label>
                    <span className={styles.mono}>{resultTicket.short_code || resultTicket.ticket_code}</span>
                  </div>
                </div>
              </div>
            )}

            <button className={styles.scanNextBtn} onClick={handleScanAnother}>◈ Scan Another</button>
          </div>
        </div>
      </div>
    );
  }

  // ── SCANNER VIEW (default) ──
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/admin" className={styles.backLink}>← Admin</Link>
          <h1 className={styles.title}>Scanner</h1>
          <div className={styles.adminDot} />
        </header>

        {/* ── Event Selector ── */}
        <div className={styles.eventSelector}>
          <select
            className={styles.eventSelect}
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
          >
            <option value="">Select event...</option>
            {displayedEvents.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.title} — {new Date(ev.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </option>
            ))}
          </select>
          {!showOlderEvents && events.length > displayedEvents.length && (
            <button className={styles.showOlderBtn} onClick={() => setShowOlderEvents(true)}>
              Show older events ({events.length - displayedEvents.length} more)
            </button>
          )}
        </div>

        {/* ── Counters ── */}
        {selectedEventId && (
          <div className={styles.counters}>
            <span className={styles.counterMain}>{stats.checkedIn} / {stats.total} checked in</span>
            <span className={styles.counterSep}>·</span>
            <span className={styles.counterRemaining}>{stats.remaining} remaining</span>
          </div>
        )}

        {/* ── QR Scanner ── */}
        <div className={styles.scanSection}>
          <div className={styles.cameraFrame}>
            <div ref={scannerContainerRef} className={styles.viewfinder} />
            {cameraError && <div className={styles.cameraError}>{cameraError}</div>}
            <div className={styles.scanHint}>Point the camera at the ticket QR code</div>
          </div>
        </div>

        {/* ── Input Tabs ── */}
        <div className={styles.inputSection}>
          <div className={styles.inputTabs}>
            <button
              className={`${styles.inputTab} ${inputMode === 'code' ? styles.inputTabActive : ''}`}
              onClick={() => setInputMode('code')}
            >
              Enter code
            </button>
            <button
              className={`${styles.inputTab} ${inputMode === 'email' ? styles.inputTabActive : ''}`}
              onClick={() => setInputMode('email')}
            >
              Search email
            </button>
          </div>

          {inputMode === 'code' && (
            <form onSubmit={handleCodeLookup} className={styles.manualForm}>
              <input
                type="text"
                className={styles.manualInput}
                placeholder="Ticket code, e.g. 7K4P9X"
                value={codeQuery}
                onChange={(e) => setCodeQuery(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
              />
              <button type="submit" className={styles.manualBtn} disabled={!codeQuery.trim()}>GO</button>
            </form>
          )}

          {inputMode === 'email' && (
            <>
              <form onSubmit={handleEmailSearch} className={styles.manualForm}>
                <input
                  type="text"
                  className={styles.manualInput}
                  placeholder="Search by email..."
                  value={emailQuery}
                  onChange={(e) => setEmailQuery(e.target.value)}
                  autoComplete="off"
                />
                <button type="submit" className={styles.manualBtn} disabled={!emailQuery.trim() || emailSearching}>
                  {emailSearching ? '...' : 'Search'}
                </button>
              </form>

              {/* Email search results */}
              {emailResults.length > 0 && (
                <div className={styles.emailResults}>
                  {emailResults.map(t => (
                    <button
                      key={t.id}
                      className={styles.emailResultRow}
                      onClick={() => handleSelectTicket(t)}
                    >
                      <div className={styles.emailResultLeft}>
                        <span className={styles.emailResultEmail}>{resolveEmail(t)}</span>
                        {t.holder_name && <span className={styles.emailResultName}>{t.holder_name}</span>}
                      </div>
                      <div className={styles.emailResultRight}>
                        <span className={styles.emailResultCode}>{t.short_code || t.ticket_code}</span>
                        <span className={`${styles.emailResultStatus} ${t.status === 'valid' ? styles.statusValid : styles.statusUsed}`}>
                          {t.status === 'valid' ? 'Valid' : 'Used'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {emailResults.length === 0 && emailQuery && !emailSearching && (
                <div className={styles.noResults}>No results</div>
              )}
            </>
          )}
        </div>

        {/* ── Status Filters + Ticket List ── */}
        {selectedEventId && (
          <div className={styles.ticketListSection}>
            <div className={styles.filterTabs}>
              {(['all', 'valid', 'used'] as StatusFilter[]).map(f => (
                <button
                  key={f}
                  className={`${styles.filterTab} ${statusFilter === f ? styles.filterTabActive : ''}`}
                  onClick={() => setStatusFilter(f)}
                >
                  {f === 'all' ? `All (${eventTickets.length})` : f === 'valid' ? `Valid (${eventTickets.filter(t => t.status === 'valid').length})` : `Used (${eventTickets.filter(t => t.status === 'used').length})`}
                </button>
              ))}
            </div>

            {ticketsLoading ? (
              <div className={styles.listLoading}><div className={styles.spinner} /></div>
            ) : filteredTickets.length === 0 ? (
              <div className={styles.noResults}>No tickets</div>
            ) : (
              <div className={styles.ticketList}>
                {filteredTickets.map(t => (
                  <button
                    key={t.id}
                    className={`${styles.ticketRow} ${t.status === 'used' ? styles.ticketRowUsed : ''}`}
                    onClick={() => handleSelectTicket(t)}
                  >
                    <div className={styles.ticketRowLeft}>
                      <span className={styles.ticketRowCode}>{t.short_code || t.ticket_code}</span>
                      <span className={styles.ticketRowEmail}>{resolveEmail(t)}</span>
                      {t.holder_name && <span className={styles.ticketRowName}>{t.holder_name}</span>}
                    </div>
                    <div className={styles.ticketRowRight}>
                      {resolveTypeName(t) && <span className={styles.ticketRowType}>{resolveTypeName(t)}</span>}
                      <span className={`${styles.ticketRowStatus} ${t.status === 'valid' ? styles.statusValid : styles.statusUsed}`}>
                        {t.status === 'valid' ? 'Valid' : 'Used'}
                      </span>
                      {t.status === 'used' && t.used_at && (
                        <span className={styles.ticketRowTime}>{new Date(t.used_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
