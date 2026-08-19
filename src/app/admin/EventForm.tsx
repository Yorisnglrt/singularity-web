'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './EventForm.module.css';
import type { EventTicketType } from './page';

// Helper to extract colors from existing posterColor gradient
function parseGradient(css: string): { colorA: string; colorB: string; dir: string } {
  const dirs: Record<string, string> = {
    'to bottom': 'vertical',
    'to right': 'horizontal',
    '135deg': 'diagonal',
    '45deg': 'diagonal-rev',
  };
  const dirMatch = css.match(/(to bottom|to right|135deg|45deg)/);
  const colorMatches = css.match(/#[0-9a-fA-F]{3,6}/g) || ['#000000', '#333333'];
  return {
    colorA: colorMatches[0] || '#000000',
    colorB: colorMatches[1] || '#333333',
    dir: dirMatch ? (dirs[dirMatch[0]] || 'diagonal') : 'diagonal',
  };
}

function buildGradient(colorA: string, colorB: string, dir: string): string {
  const dirs: Record<string, string> = {
    vertical: 'to bottom',
    horizontal: 'to right',
    diagonal: '135deg',
    'diagonal-rev': '45deg',
  };
  return `linear-gradient(${dirs[dir] || '135deg'}, ${colorA}, ${colorB})`;
}

function convertLocalToUtc(localDateTimeStr: string, timeZone: string = 'Europe/Oslo'): string | null {
  if (!localDateTimeStr) return null;
  const date = new Date(localDateTimeStr + ':00Z');
  if (isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find(p => p.type === type)!.value;
  
  const year = parseInt(getPart('year'), 10);
  const month = parseInt(getPart('month'), 10) - 1;
  const day = parseInt(getPart('day'), 10);
  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);
  const second = parseInt(getPart('second'), 10);
  
  const tzDateInUtc = Date.UTC(year, month, day, hour, minute, second);
  const offsetMs = tzDateInUtc - date.getTime();
  const utcTimestamp = date.getTime() - offsetMs;
  return new Date(utcTimestamp).toISOString();
}

function convertUtcToLocal(utcDateStr: string | null | undefined, timeZone: string = 'Europe/Oslo'): string {
  if (!utcDateStr) return '';
  const date = new Date(utcDateStr);
  if (isNaN(date.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find(p => p.type === type)!.value;

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const hour = getPart('hour');
  const minute = getPart('minute');

  return `${year}-${month}-${day}T${hour}:${minute}`;
}


interface Artist { id: string; name: string; }
interface EventLike {
  id: string;
  title: string;
  date: string;
  time: string;
  venue: { en: string; cs: string; no: string; pl: string };
  type: string;
  description: { en: string; cs: string; no: string; pl: string };
  lineup: string[];
  posterColor: string;
  posterImage?: string;
  posterVertical?: string;
  coverWide?: string;
  isFree: boolean;
  ticketUrl?: string;
  ticketProvider?: string;
  ticketPriceOre?: number | null;
  isPast: boolean;
  isFeatured?: boolean;
  isTestEvent?: boolean;
  ageRestriction?: '18+' | '20+' | '21+';
}

interface Props {
  item: EventLike;
  allArtists: Artist[];
  ticketTypes: EventTicketType[];
  onSave: (item: EventLike) => void;
  onDuplicate: (item: EventLike) => void;
  onCancel: () => void;
  onUpload: (file: File) => Promise<string>;
  uploading: boolean;
  onSaveTicketType: (tt: EventTicketType) => void;
  onDeleteTicketType: (id: string) => void;
  onDeleteSuccess?: () => void;
}

const LOCALES = [
  { key: 'en', label: 'EN' },
  { key: 'no', label: 'NO' },
  { key: 'cs', label: 'CZ' },
  { key: 'pl', label: 'PL' },
] as const;

type Locale = typeof LOCALES[number]['key'];

export default function EventForm({ item, allArtists, ticketTypes, onSave, onDuplicate, onCancel, onUpload, uploading, onSaveTicketType, onDeleteTicketType, onDeleteSuccess }: Props) {
  const [ev, setEv] = useState<EventLike>(item);
  const [descLocale, setDescLocale] = useState<Locale>('en');

  // ── Ticket-type editing state ──
  const [editingTT, setEditingTT] = useState<EventTicketType | null>(null);
  const [ttErrors, setTtErrors] = useState<Record<string, string>>({});

  // ── Test event delete modal state ──
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteStats, setDeleteStats] = useState<any>(null);
  const [deleteStatsLoading, setDeleteStatsLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingTestEvent, setDeletingTestEvent] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleOpenDeleteModal = async () => {
    setDeleteModalOpen(true);
    setDeleteStats(null);
    setDeleteStatsLoading(true);
    setDeleteConfirmText('');
    setDeleteError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/events/delete-test-event?eventId=${ev.id}`, {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDeleteStats(data);
      } else {
        const err = await res.json();
        setDeleteError(err.error || 'Failed to load test event stats');
      }
    } catch (err: any) {
      setDeleteError(err?.message || 'Connection error');
    } finally {
      setDeleteStatsLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeletingTestEvent(true);
    setDeleteError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/events/delete-test-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ eventId: ev.id }),
      });

      if (res.ok) {
        setDeleteModalOpen(false);
        onDeleteSuccess?.();
        onCancel();
      } else {
        const err = await res.json();
        setDeleteError(err.error || 'Failed to delete test event');
      }
    } catch (err: any) {
      setDeleteError(err?.message || 'Connection error');
    } finally {
      setDeletingTestEvent(false);
    }
  };

  // Parse out date/time parts
  const dateOnly = ev.date?.split('T')[0] || '';
  const timeStart = ev.time?.split(' - ')[0] || '';
  const timeEnd = ev.time?.split(' - ')[1] || '';

  // Gradient state
  const parsed = parseGradient(ev.posterColor || '');
  const [colorA, setColorA] = useState(parsed.colorA);
  const [colorB, setColorB] = useState(parsed.colorB);
  const [gradDir, setGradDir] = useState(parsed.dir);
  const [posterMode, setPosterMode] = useState<'gradient' | 'image'>(ev.posterImage ? 'image' : 'gradient');

  // Lineup
  const [newName, setNewName] = useState('');

  // Email Attendees state
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [campaignKey, setCampaignKey] = useState('location-info');
  const [sendMode, setSendMode] = useState<'all' | 'unsent_only'>('unsent_only');
  const [autoSendToLateBuyers, setAutoSendToLateBuyers] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [testEmail, setTestEmail] = useState('');

  interface ImageItem {
    id: string;
    file?: File;
    previewUrl: string;
    publicUrl?: string;
    status: 'uploading' | 'success' | 'error';
    error?: string;
  }

  const [imageItems, setImageItems] = useState<ImageItem[]>([]);

  const itemsRef = useRef(imageItems);
  useEffect(() => {
    itemsRef.current = imageItems;
  }, [imageItems]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach(item => {
        if (item.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, []);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (imageItems.length + files.length > 5) {
      alert('You can upload a maximum of 5 images.');
      return;
    }

    const newItems = files.map(file => {
      const id = Math.random().toString(36).substring(2, 9);
      const previewUrl = URL.createObjectURL(file);
      return {
        id,
        file,
        previewUrl,
        status: 'uploading' as const
      };
    });

    setImageItems(prev => [...prev, ...newItems]);

    // Reset input value so same files can be re-selected if needed
    e.target.value = '';

    // Upload files sequentially
    for (const item of newItems) {
      if (!item.file) continue;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const formData = new FormData();
        formData.append('file', item.file);

        const res = await fetch('/api/admin/upload', {
          method: 'POST',
          body: formData,
          headers: {
            'Authorization': `Bearer ${session?.access_token || ''}`
          }
        });

        if (res.ok) {
          const json = await res.json();
          if (json.path) {
            URL.revokeObjectURL(item.previewUrl);
            setImageItems(prev => prev.map(p => p.id === item.id ? {
              ...p,
              status: 'success',
              previewUrl: json.path,
              publicUrl: json.path
            } : p));
          } else {
            setImageItems(prev => prev.map(p => p.id === item.id ? {
              ...p,
              status: 'error',
              error: 'No path returned'
            } : p));
          }
        } else {
          const err = await res.json();
          setImageItems(prev => prev.map(p => p.id === item.id ? {
            ...p,
            status: 'error',
            error: err.error || 'Failed to upload'
          } : p));
        }
      } catch (err: any) {
        setImageItems(prev => prev.map(p => p.id === item.id ? {
          ...p,
          status: 'error',
          error: err.message || 'Upload error'
        } : p));
      }
    }
  };

  const handleRemoveImage = (id: string) => {
    setImageItems(prev => {
      const itemToRemove = prev.find(item => item.id === id);
      if (itemToRemove && itemToRemove.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(itemToRemove.previewUrl);
      }
      return prev.filter(item => item.id !== id);
    });
  };

  const handleToggleAutoSend = (checked: boolean) => {
    setAutoSendToLateBuyers(checked);
    if (checked && !startsAt) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setStartsAt(`${year}-${month}-${day}T${hours}:${minutes}`);
    }
  };

  // Guest list & DJ Guest Codes state
  const [guestCodes, setGuestCodes] = useState<any[]>([]);
  const [loadingGuestCodes, setLoadingGuestCodes] = useState(false);
  const [expandedCodeId, setExpandedCodeId] = useState<string | null>(null);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<any | null>(null);
  const [codeForm, setCodeForm] = useState({
    dj_name: '',
    code: '',
    guest_limit: 5,
    price_nok: 0,
    note: '',
    expires_at: '',
    is_active: true,
  });
  const [codeFormSaving, setCodeFormSaving] = useState(false);
  const [codeFormError, setCodeFormError] = useState<string | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [showManualGuestSection, setShowManualGuestSection] = useState(false);

  // Manual guest list state (legacy fallback)
  const [guestList, setGuestList] = useState<any[]>([]);
  const [newGuest, setNewGuest] = useState({ name: '', email: '', quantity: 1, note: '' });
  const [issuingGuest, setIssuingGuest] = useState(false);

  const fetchGuestCodes = useCallback(async () => {
    if (!ev.id || ev.id.startsWith('new-')) return;
    setLoadingGuestCodes(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/guest-codes?event_id=${ev.id}`, {
        headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
      });
      if (res.ok) {
        const json = await res.json();
        setGuestCodes(json);
      }
    } catch (err) {
      console.error('Failed to fetch guest codes:', err);
    } finally {
      setLoadingGuestCodes(false);
    }
  }, [ev.id]);

  const fetchGuestList = useCallback(async () => {
    if (!ev.id || ev.id.startsWith('new-')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/guest-tickets?event_id=${ev.id}`, {
        headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
      });
      if (res.ok) {
        const json = await res.json();
        setGuestList(json);
      }
    } catch (err) {
      console.error('Failed to fetch guest list:', err);
    }
  }, [ev.id]);

  useEffect(() => {
    fetchGuestCodes();
    fetchGuestList();
  }, [fetchGuestCodes, fetchGuestList]);

  const handleOpenAddCodeModal = () => {
    setEditingCode(null);
    setCodeForm({
      dj_name: '',
      code: '',
      guest_limit: 5,
      price_nok: 0,
      note: '',
      expires_at: '',
      is_active: true,
    });
    setCodeFormError(null);
    setCodeModalOpen(true);
  };

  const handleOpenEditCodeModal = (gc: any) => {
    setEditingCode(gc);
    setCodeForm({
      dj_name: gc.dj_name,
      code: gc.code,
      guest_limit: gc.guest_limit,
      price_nok: gc.price_nok !== undefined ? gc.price_nok : Math.round((gc.price_ore || 0) / 100),
      note: gc.note || '',
      expires_at: gc.expires_at ? gc.expires_at.slice(0, 16) : '',
      is_active: gc.is_active,
    });
    setCodeFormError(null);
    setCodeModalOpen(true);
  };

  const handleSaveCodeForm = async () => {
    if (!codeForm.dj_name.trim() || !codeForm.code.trim()) {
      setCodeFormError('DJ Name and Guest Code are required');
      return;
    }

    setCodeFormSaving(true);
    setCodeFormError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const payload: any = {
        action: editingCode ? 'update' : 'create',
        event_id: ev.id,
        id: editingCode?.id,
        dj_name: codeForm.dj_name.trim(),
        code: codeForm.code.trim().toUpperCase(),
        guest_limit: codeForm.guest_limit,
        price_nok: codeForm.price_nok || 0,
        note: codeForm.note.trim() || null,
        expires_at: codeForm.expires_at ? new Date(codeForm.expires_at).toISOString() : null,
        is_active: codeForm.is_active,
      };

      const res = await fetch('/api/admin/guest-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setCodeModalOpen(false);
        fetchGuestCodes();
      } else {
        setCodeFormError(data.error || 'Failed to save guest code');
      }
    } catch (err: any) {
      setCodeFormError(err.message || 'Connection error');
    } finally {
      setCodeFormSaving(false);
    }
  };

  const handleToggleCodeActive = async (gc: any) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/admin/guest-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          action: 'toggle_active',
          id: gc.id,
          is_active: !gc.is_active,
        })
      });
      fetchGuestCodes();
    } catch (err) {
      console.error('Failed to toggle code status:', err);
    }
  };

  const handleDeleteCode = async (gc: any) => {
    if (!confirm(`Delete unused guest code "${gc.code}"?`)) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/guest-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          action: 'delete',
          id: gc.id,
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchGuestCodes();
      } else {
        alert(data.error || 'Failed to delete guest code');
      }
    } catch (err) {
      console.error('Failed to delete code:', err);
    }
  };

  const handleCopyLink = (code: string, id: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/guest?code=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const handleResendClaimEmail = async (ticketId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/guest-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          action: 'resend_email',
          ticket_id: ticketId,
        })
      });
      if (res.ok) {
        alert('Ticket confirmation email resent successfully!');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to resend ticket email');
      }
    } catch (err) {
      console.error('Resend email error:', err);
    }
  };

  const handleVoidClaimedTicket = async (ticketId: string) => {
    if (!confirm('Void this guest ticket? This will restore 1 available slot in the DJ allocation.')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/guest-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          action: 'void_ticket',
          ticket_id: ticketId,
        })
      });
      if (res.ok) {
        fetchGuestCodes();
        fetchGuestList();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to void ticket');
      }
    } catch (err) {
      console.error('Void ticket error:', err);
    }
  };

  const handleIssueGuest = async () => {
    if (!newGuest.name || !newGuest.email) {
      alert('Name and email are required');
      return;
    }
    setIssuingGuest(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/guest-tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          event_id: ev.id,
          guest_name: newGuest.name,
          guest_email: newGuest.email,
          quantity: newGuest.quantity,
          note: newGuest.note
        })
      });
      if (res.ok) {
        setNewGuest({ name: '', email: '', quantity: 1, note: '' });
        fetchGuestList();
        alert('Guest tickets issued and email sent!');
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } catch (_err) {
      alert('Failed to issue guest tickets');
    } finally {
      setIssuingGuest(false);
    }
  };

  const handleVoidGuest = async (id: string) => {
    if (!confirm('Void this guest ticket? It will no longer be valid for entry.')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ 
          type: 'tickets', 
          data: [{ id, status: 'void' }] 
        })
      });
      if (res.ok) {
        fetchGuestList();
      }
    } catch (err) {
      console.error('Failed to void ticket:', err);
    }
  };

  const handleEmailAttendees = async () => {
    if (!emailSubject.trim() || !emailMessage.trim()) {
      alert('Subject and Message are required.');
      return;
    }

    if (testMode) {
      if (!testEmail.trim() || !testEmail.includes('@')) {
        alert('Please enter a valid test recipient email address.');
        return;
      }
    } else {
      if (!campaignKey.trim()) {
        alert('Campaign Key is required.');
        return;
      }
    }

    const confirmMessage = testMode
      ? `Send this test email to ${testEmail.trim()}?`
      : autoSendToLateBuyers
        ? 'Send this campaign now and automatically send it to late ticket buyers after the selected time?'
        : 'Send this email to all valid/checked-in ticket holders for this event?';

    if (!confirm(confirmMessage)) {
      return;
    }

    setEmailSending(true);
    setEmailSuccess(null);
    setEmailError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/email-attendees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          eventId: ev.id,
          subject: emailSubject,
          message: emailMessage,
          campaignKey,
          sendMode,
          autoSendToLateBuyers,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          images: imageItems.filter(item => item.status === 'success').map(item => item.publicUrl),
          testMode,
          testEmail: testMode ? testEmail.trim() : null
        })
      });

      if (res.ok) {
        const json = await res.json();
        if (testMode) {
          setEmailSuccess(`Test email sent successfully to ${testEmail.trim()}.`);
        } else {
          setEmailSuccess(`Email sent to ${json.sentCount} attendees. ${json.skippedAlreadySentCount} already had this campaign and were skipped.`);
          setEmailSubject('');
          setEmailMessage('');
          setImageItems([]);
        }
      } else {
        const err = await res.json();
        setEmailError(err.error || 'Failed to send emails.');
      }
    } catch (err) {
      console.error('Failed to send broadcast emails:', err);
      setEmailError('An unexpected error occurred.');
    } finally {
      setEmailSending(false);
    }
  };

  const [selectedArtist, setSelectedArtist] = useState('');

  const update = useCallback((patch: Partial<EventLike>) => setEv(prev => ({ ...prev, ...patch })), []);

  const updateGradient = (a: string, b: string, d: string) => {
    const g = buildGradient(a, b, d);
    update({ posterColor: g });
  };

  const setDate = (d: string) => update({ date: `${d}T${timeStart || '22:00'}:00` });
  const setTimeStart = (t: string) => update({ time: `${t} - ${timeEnd || '04:00'}` });
  const setTimeEnd = (t: string) => update({ time: `${timeStart || '22:00'} - ${t}` });

  const addLineupName = (name: string) => {
    if (!name.trim() || ev.lineup.includes(name.trim())) return;
    update({ lineup: [...ev.lineup, name.trim()] });
  };

  const removeLineup = (name: string) => update({ lineup: ev.lineup.filter(n => n !== name) });

  const moveLineup = (idx: number, dir: -1 | 1) => {
    const arr = [...ev.lineup];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    update({ lineup: arr });
  };

  const handleImageUpload = async (file: File) => {
    const path = await onUpload(file);
    update({ posterImage: path });
    setPosterMode('image');
  };

  const handleSave = () => onSave(ev);

  const handleDuplicate = () => {
    const dup = { ...ev, id: `event-${Date.now()}`, title: ev.title + ' (copy)' };
    onDuplicate(dup);
  };

  // ── Ticket-type helpers ──
  const newBlankTT = (): EventTicketType => ({
    id: `new-tt-${Date.now()}`,
    eventId: ev.id,
    name: '',
    description: '',
    priceNok: 0,
    currency: 'NOK',
    totalQuantity: null,
    soldQuantity: 0,
    isActive: true,
    isSupporter: false,
    saleStartsAt: null,
    saleEndsAt: null,
    sortOrder: (ticketTypes.length + 1) * 10,
  });

  const validateTT = (tt: EventTicketType): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!tt.name.trim()) errs.name = 'Name is required';
    const price = Number(tt.priceNok);
    if (!Number.isInteger(price) || price < 0) errs.priceNok = 'Must be an integer ≥ 0';
    if (tt.totalQuantity != null && tt.totalQuantity !== ('' as any)) {
      const qty = Number(tt.totalQuantity);
      if (!Number.isInteger(qty) || qty < tt.soldQuantity) {
        errs.totalQuantity = `Must be an integer ≥ ${tt.soldQuantity} (sold)`;
      }
    }
    if (tt.saleStartsAt && tt.saleEndsAt && tt.saleEndsAt < tt.saleStartsAt) {
      errs.saleEndsAt = 'End cannot be before start';
    }
    return errs;
  };

  const handleSaveTT = () => {
    if (!editingTT) return;
    const errs = validateTT(editingTT);
    setTtErrors(errs);
    if (Object.keys(errs).length > 0) return;
    // Normalize empty-string sentinel back to null for the DB
    const toSave = { ...editingTT, saleEndsAt: editingTT.saleEndsAt || null };
    onSaveTicketType(toSave);
    setEditingTT(null);
    setTtErrors({});
  };

  const handleCancelTT = () => {
    setEditingTT(null);
    setTtErrors({});
  };

  const currentGradient = buildGradient(colorA, colorB, gradDir);
  const previewBg = posterMode === 'image' && ev.posterImage ? `url(${ev.posterImage}) center/cover` : currentGradient;
  const previewDate = dateOnly ? new Date(dateOnly) : null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.formArea}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 className={styles.heading} style={{ margin: 0 }}>
            {ev.id?.startsWith('new-') ? 'Create Event' : 'Edit Event'}
          </h2>
          {ev.isTestEvent && (
            <span style={{
              background: '#ff8c00',
              color: '#000',
              padding: '0.3rem 0.8rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 900,
              letterSpacing: '1px'
            }}>
              TEST EVENT
            </span>
          )}
        </div>

        {/* ── Basic Info ── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Basic Info</h3>

          <div className={styles.field}>
            <label className={styles.label}>Event Title</label>
            <input className={styles.input} value={ev.title} onChange={e => update({ title: e.target.value })} placeholder="e.g. GRILL & BASS" />
          </div>

          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>Date</label>
              <input type="date" className={styles.input} value={dateOnly} onChange={e => setDate(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Venue</label>
              <input 
                className={styles.input} 
                value={typeof ev.venue === 'object' ? ev.venue[descLocale] || ev.venue['en'] || '' : ev.venue || ''} 
                onChange={e => {
                  const val = e.target.value;
                  if (typeof ev.venue === 'object') {
                    update({ venue: { ...ev.venue, [descLocale]: val } });
                  } else {
                    update({ venue: { en: val, cs: val, no: val, pl: val } });
                  }
                }} 
                placeholder="e.g. Faksen" 
              />
              <p style={{fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.2rem'}}>Venue name in {descLocale.toUpperCase()}</p>
            </div>
          </div>

          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>Start Time</label>
              <input type="time" className={styles.input} value={timeStart} onChange={e => setTimeStart(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>End Time</label>
              <input type="time" className={styles.input} value={timeEnd.replace('???', '')} onChange={e => setTimeEnd(e.target.value)} placeholder="04:00" />
            </div>
          </div>

          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>Type</label>
              <select className={styles.input} value={ev.type} onChange={e => update({ type: e.target.value })}>
                <option value="club">Club</option>
                <option value="outdoor">Outdoor</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Status</label>
              <select className={styles.input} value={ev.isPast ? 'archive' : 'upcoming'} onChange={e => update({ isPast: e.target.value === 'archive' })}>
                <option value="upcoming">Upcoming</option>
                <option value="archive">Archive</option>
              </select>
            </div>
          </div>

          <div className={styles.field} style={{ marginBottom: '1rem' }}>
            <label className={styles.label}>Age Restriction</label>
            <select className={styles.input} value={ev.ageRestriction || '18+'} onChange={e => update({ ageRestriction: e.target.value as '18+' | '20+' | '21+' })}>
              <option value="18+">18+</option>
              <option value="20+">20+</option>
              <option value="21+">21+</option>
            </select>
          </div>

          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>Ticket Provider</label>
              <select className={styles.input} value={(ev as any).ticketProvider || 'external'} onChange={e => update({ ticketProvider: e.target.value } as any)}>
                <option value="external">External URL</option>
                <option value="vipps">Vipps (internal)</option>
              </select>
            </div>
            <div className={styles.field}>
              {(ev as any).ticketProvider === 'vipps' ? (
                <>
                  <label className={styles.label}>Ticket Price (øre)</label>
                  <input type="number" className={styles.input} value={(ev as any).ticketPriceOre || ''} onChange={e => update({ ticketPriceOre: e.target.value ? parseInt(e.target.value) : null } as any)} placeholder="e.g. 19900 = 199 NOK" />
                  <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>Amount in øre (19900 = 199.00 NOK)</p>
                </>
              ) : (
                <>
                  <label className={styles.label}>Ticket URL</label>
                  <input className={styles.input} value={ev.ticketUrl || ''} onChange={e => update({ ticketUrl: e.target.value })} placeholder="https://..." />
                </>
              )}
            </div>
          </div>

          <div className={styles.row2}>
            <div className={styles.field} style={{ justifyContent: 'flex-end' }}>
              <div className={styles.toggleRow}>
                <input type="checkbox" id="isFree" checked={ev.isFree} onChange={e => update({ isFree: e.target.checked })} />
                <label htmlFor="isFree">Free entry</label>
              </div>
              <div className={styles.toggleRow}>
                <input type="checkbox" id="isFeatured" checked={ev.isFeatured || false} onChange={e => update({ isFeatured: e.target.checked })} />
                <label htmlFor="isFeatured">Featured event</label>
              </div>
            </div>
          </div>

          <div style={{
            marginTop: '0.75rem',
            padding: '0.75rem 1rem',
            background: ev.isTestEvent ? 'rgba(255, 140, 0, 0.12)' : 'rgba(255, 255, 255, 0.03)',
            border: ev.isTestEvent ? '1px solid #ff8c00' : '1px solid var(--color-border)',
            borderRadius: '8px',
            transition: 'all 0.2s'
          }}>
            <div className={styles.toggleRow} style={{ margin: 0, alignItems: 'flex-start', gap: '0.75rem' }}>
              <input 
                type="checkbox" 
                id="isTestEvent" 
                checked={ev.isTestEvent || false} 
                onChange={e => update({ isTestEvent: e.target.checked })} 
                style={{ marginTop: '0.25rem', width: '18px', height: '18px' }}
              />
              <label htmlFor="isTestEvent" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span style={{ fontWeight: 800, color: ev.isTestEvent ? '#ff8c00' : '#fff', fontSize: '0.9rem' }}>
                  Test event
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 400, lineHeight: 1.4 }}>
                  Only admins can see and access this event. Use this for testing checkout, tickets, emails and check-in.
                </span>
              </label>
            </div>
          </div>
        </section>

        {/* ── Poster / Visual ── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Poster Visual</h3>

          <div className={styles.posterModeToggle}>
            <button className={`${styles.modeBtn} ${posterMode === 'gradient' ? styles.modeBtnActive : ''}`} onClick={() => setPosterMode('gradient')}>Color Gradient</button>
            <button className={`${styles.modeBtn} ${posterMode === 'image' ? styles.modeBtnActive : ''}`} onClick={() => setPosterMode('image')}>Upload Image</button>
          </div>

          {posterMode === 'gradient' && (
            <div className={styles.gradientEditor}>
              <div className={styles.row3}>
                <div className={styles.field}>
                  <label className={styles.label}>Color A</label>
                  <div className={styles.colorRow}>
                    <input type="color" value={colorA} onChange={e => { setColorA(e.target.value); updateGradient(e.target.value, colorB, gradDir); }} className={styles.colorPicker} />
                    <input className={styles.input} value={colorA} onChange={e => { setColorA(e.target.value); updateGradient(e.target.value, colorB, gradDir); }} style={{ flex: 1 }} />
                  </div>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Color B</label>
                  <div className={styles.colorRow}>
                    <input type="color" value={colorB} onChange={e => { setColorB(e.target.value); updateGradient(colorA, e.target.value, gradDir); }} className={styles.colorPicker} />
                    <input className={styles.input} value={colorB} onChange={e => { setColorB(e.target.value); updateGradient(colorA, e.target.value, gradDir); }} style={{ flex: 1 }} />
                  </div>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Direction</label>
                  <select className={styles.input} value={gradDir} onChange={e => { setGradDir(e.target.value); updateGradient(colorA, colorB, e.target.value); }}>
                    <option value="diagonal">↘ Diagonal</option>
                    <option value="diagonal-rev">↗ Diagonal Rev</option>
                    <option value="vertical">↓ Vertical</option>
                    <option value="horizontal">→ Horizontal</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {posterMode === 'image' && (
            <div className={styles.field}>
              {ev.posterImage && (
                <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <img src={ev.posterImage} alt="poster" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6 }} />
                  <button onClick={() => { update({ posterImage: '' }); setPosterMode('gradient'); }} style={{ background: 'none', border: 'none', color: '#ff3b5c', cursor: 'pointer' }}>✕ Remove</button>
                </div>
              )}
              <input type="file" accept=".jpg,.jpeg,.png,.webp,image/*" disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                style={{ color: 'var(--color-text-primary)', fontSize: '0.9rem' }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.4rem' }}>JPG, PNG or WebP</p>
            </div>
          )}

          {/* Dedicated image URL fields */}
          <div className={styles.field}>
            <label className={styles.label}>Poster Vertical (4:5 portrait — for cards / Instagram)</label>
            {(ev as any).posterVertical && (
              <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <img src={(ev as any).posterVertical} alt="vertical" style={{ width: 48, height: 60, objectFit: 'cover', borderRadius: 4 }} />
                <button onClick={() => update({ posterVertical: '' } as any)} style={{ background: 'none', border: 'none', color: '#ff3b5c', cursor: 'pointer', fontSize: '0.85rem' }}>✕ Remove</button>
              </div>
            )}
            <input className={styles.input} value={(ev as any).posterVertical || ''} onChange={e => update({ posterVertical: e.target.value } as any)} placeholder="https://... or /images/..." />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Cover Wide (1.91:1 landscape — for event detail hero / Facebook)</label>
            {(ev as any).coverWide && (
              <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <img src={(ev as any).coverWide} alt="wide cover" style={{ width: 96, height: 50, objectFit: 'cover', borderRadius: 4 }} />
                <button onClick={() => update({ coverWide: '' } as any)} style={{ background: 'none', border: 'none', color: '#ff3b5c', cursor: 'pointer', fontSize: '0.85rem' }}>✕ Remove</button>
              </div>
            )}
            <input className={styles.input} value={(ev as any).coverWide || ''} onChange={e => update({ coverWide: e.target.value } as any)} placeholder="https://... or /images/..." />
          </div>
        </section>

        {/* ── Lineup ── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Lineup</h3>

          <div className={styles.lineupList}>
            {ev.lineup.map((name, idx) => (
              <div key={name} className={styles.lineupChip}>
                <button onClick={() => moveLineup(idx, -1)} disabled={idx === 0} className={styles.moveBtn}>↑</button>
                <button onClick={() => moveLineup(idx, 1)} disabled={idx === ev.lineup.length - 1} className={styles.moveBtn}>↓</button>
                <span className={styles.lineupName}>{name}</span>
                <button onClick={() => removeLineup(name)} className={styles.removeBtn}>✕</button>
              </div>
            ))}
          </div>

          <div className={styles.lineupAdd}>
            <select className={styles.input} value={selectedArtist}
              onChange={e => { setSelectedArtist(e.target.value); if (e.target.value) { addLineupName(e.target.value); setSelectedArtist(''); } }}>
              <option value="">Select from artists…</option>
              {allArtists.filter(a => !ev.lineup.includes(a.name)).map(a => (
                <option key={a.id} value={a.name}>{a.name}</option>
              ))}
            </select>

            <div className={styles.lineupManualRow}>
              <input className={styles.input} value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Or type name manually…"
                onKeyDown={e => { if (e.key === 'Enter') { addLineupName(newName); setNewName(''); } }}
              />
              <button className={styles.addBtn} onClick={() => { addLineupName(newName); setNewName(''); }}>+ Add</button>
            </div>
          </div>
        </section>

        {/* ── Ticket Types ── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Ticket Types</h3>

          {/* List existing ticket types */}
          {ticketTypes.length === 0 && !editingTT && (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>No ticket types yet.</p>
          )}

          {ticketTypes.map(tt => (
            <div key={tt.id} className={styles.lineupChip} style={{ marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span className={styles.lineupName} style={{ flex: 1, minWidth: 120 }}>
                <strong>{tt.name}</strong>{' '}
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                  {tt.priceNok} NOK · {tt.isActive ? '✓ Active' : '✗ Inactive'}
                  {tt.totalQuantity != null ? ` · ${tt.soldQuantity}/${tt.totalQuantity} sold` : ` · ${tt.soldQuantity} sold`}
                </span>
              </span>
              <button
                className={styles.addBtn}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                onClick={() => { setEditingTT({ ...tt }); setTtErrors({}); }}
              >Edit</button>
              <button className={styles.removeBtn} onClick={() => onDeleteTicketType(tt.id)}>✕</button>
            </div>
          ))}

          {/* Editing / adding form */}
          {editingTT ? (
            <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.02)' }}>
              <h4 style={{ fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--color-text-secondary)' }}>
                {editingTT.id.startsWith('new-tt-') ? 'New Ticket Type' : `Edit: ${editingTT.name || '…'}`}
              </h4>

              <div className={styles.row2}>
                <div className={styles.field}>
                  <label className={styles.label}>Name *</label>
                  <input className={styles.input} value={editingTT.name} onChange={e => setEditingTT({ ...editingTT, name: e.target.value })} placeholder="e.g. Early Bird" />
                  <div className={styles.presetRow}>
                    {['Early Bird', 'Regular', 'Final Release'].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        className={`${styles.presetChip} ${editingTT.name === preset ? styles.presetChipActive : ''}`}
                        onClick={() => setEditingTT({ ...editingTT, name: preset })}
                      >{preset}</button>
                    ))}
                  </div>
                  {ttErrors.name && <span style={{ color: '#ff3b5c', fontSize: '0.75rem' }}>{ttErrors.name}</span>}
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Description</label>
                  <input className={styles.input} value={editingTT.description || ''} onChange={e => setEditingTT({ ...editingTT, description: e.target.value })} placeholder="Optional description" />
                </div>
              </div>

              <div className={styles.row2} style={{ marginTop: '0.5rem' }}>
                <div className={styles.field}>
                  <label className={styles.label}>Price (NOK) *</label>
                  <input type="number" className={styles.input} value={editingTT.priceNok} onChange={e => setEditingTT({ ...editingTT, priceNok: e.target.value === '' ? 0 : parseInt(e.target.value) })} min={0} step={1} />
                  {ttErrors.priceNok && <span style={{ color: '#ff3b5c', fontSize: '0.75rem' }}>{ttErrors.priceNok}</span>}
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Total Quantity</label>
                  <input type="number" className={styles.input} value={editingTT.totalQuantity ?? ''} onChange={e => setEditingTT({ ...editingTT, totalQuantity: e.target.value === '' ? null : parseInt(e.target.value) })} min={0} step={1} placeholder="Unlimited if empty" />
                  {ttErrors.totalQuantity && <span style={{ color: '#ff3b5c', fontSize: '0.75rem' }}>{ttErrors.totalQuantity}</span>}
                </div>
              </div>

              <div className={styles.row2} style={{ marginTop: '0.5rem' }}>
                <div className={styles.field}>
                  <label className={styles.label}>Sold Quantity</label>
                  <input type="number" className={styles.input} value={editingTT.soldQuantity} readOnly style={{ opacity: 0.6, cursor: 'not-allowed' }} />
                  <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>Read-only (managed by system)</p>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Sort Order</label>
                  <input type="number" className={styles.input} value={editingTT.sortOrder} onChange={e => setEditingTT({ ...editingTT, sortOrder: parseInt(e.target.value) || 0 })} step={1} />
                </div>
              </div>

              <div className={styles.row2} style={{ marginTop: '0.5rem' }}>
                <div className={styles.field}>
                  <label className={styles.label}>Sale Starts At</label>
                  <input type="datetime-local" className={styles.input} value={editingTT.saleStartsAt ? convertUtcToLocal(editingTT.saleStartsAt) : ''} onChange={e => setEditingTT({ ...editingTT, saleStartsAt: e.target.value ? convertLocalToUtc(e.target.value) : null })} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Sale Ends At</label>
                  <div className={styles.toggleRow} style={{ marginBottom: '0.35rem' }}>
                    <input type="checkbox" id="ttSellUntilSoldOut" checked={!editingTT.saleEndsAt} onChange={e => {
                      if (e.target.checked) {
                        setEditingTT({ ...editingTT, saleEndsAt: null });
                      } else {
                        // Enable the date picker with a placeholder value so admin can set a date
                        setEditingTT({ ...editingTT, saleEndsAt: '' as any });
                      }
                    }} />
                    <label htmlFor="ttSellUntilSoldOut" style={{ fontSize: '0.78rem' }}>Sell until sold out</label>
                  </div>
                  <input type="datetime-local" className={styles.input} value={editingTT.saleEndsAt ? convertUtcToLocal(editingTT.saleEndsAt) : ''} disabled={!editingTT.saleEndsAt && editingTT.saleEndsAt !== ''} style={!editingTT.saleEndsAt && editingTT.saleEndsAt !== '' ? { opacity: 0.4, cursor: 'not-allowed' } : {}} onChange={e => setEditingTT({ ...editingTT, saleEndsAt: e.target.value ? convertLocalToUtc(e.target.value) : null })} />
                  <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>Leave empty to sell until sold out or manually disabled.</p>
                  {ttErrors.saleEndsAt && <span style={{ color: '#ff3b5c', fontSize: '0.75rem' }}>{ttErrors.saleEndsAt}</span>}
                </div>
              </div>

              <div className={styles.toggleRow} style={{ marginTop: '0.75rem' }}>
                <input type="checkbox" id="ttIsActive" checked={editingTT.isActive} onChange={e => setEditingTT({ ...editingTT, isActive: e.target.checked })} />
                <label htmlFor="ttIsActive">Active (visible for purchase)</label>
              </div>

              <div className={styles.toggleRow} style={{ marginTop: '0.5rem' }}>
                <input type="checkbox" id="ttIsSupporter" checked={editingTT.isSupporter} onChange={e => setEditingTT({ ...editingTT, isSupporter: e.target.checked })} />
                <label htmlFor="ttIsSupporter">Supporter ticket (requires name, appears on /supporters)</label>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button className={styles.saveBtn} style={{ padding: '0.5rem 1.25rem' }} onClick={handleSaveTT}>Save Ticket Type</button>
                <button className={styles.cancelBtn} onClick={handleCancelTT}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className={styles.addBtn} style={{ marginTop: '0.75rem' }} onClick={() => setEditingTT(newBlankTT())}>
              + Add Ticket Type
            </button>
          )}
        </section>

        {/* ── Guest Lists (DJ Allocations & Codes) ── */}
        <section className={styles.section}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 className={styles.sectionTitle} style={{ margin: 0 }}>Guest Lists</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0 0' }}>
                Self-service guest allocations with custom DJ codes and direct claim links.
              </p>
            </div>
            {!ev.id?.startsWith('new-') && (
              <button
                type="button"
                className={styles.addBtn}
                style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
                onClick={handleOpenAddCodeModal}
              >
                + Add Guest Code
              </button>
            )}
          </div>

          {ev.id?.startsWith('new-') ? (
            <div style={{ padding: '1.5rem', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
              Guest List management is available after saving the event.
            </div>
          ) : (
            <>
              {loadingGuestCodes ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  Loading guest lists...
                </div>
              ) : guestCodes.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
                  {guestCodes.map(gc => {
                    const isExpanded = expandedCodeId === gc.id;
                    const isCopied = copiedCodeId === gc.id;
                    const percent = gc.guest_limit > 0 ? Math.min(100, Math.round((gc.claimed_count / gc.guest_limit) * 100)) : 0;
                    const isFullyClaimed = gc.claimed_count >= gc.guest_limit;

                    return (
                      <div
                        key={gc.id}
                        style={{
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: gc.is_active ? '1px solid var(--color-border)' : '1px dashed rgba(255, 255, 255, 0.1)',
                          borderRadius: '10px',
                          padding: '1rem 1.25rem',
                          opacity: gc.is_active ? 1 : 0.65,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {/* Top row: DJ name, Code, Price, Status, Quick Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <strong style={{ fontSize: '1rem', color: '#fff' }}>{gc.dj_name}</strong>
                                <span style={{
                                  background: 'rgba(0, 255, 178, 0.12)',
                                  color: '#00ffb2',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '4px',
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 800,
                                  fontSize: '0.8rem',
                                  letterSpacing: '1px'
                                }}>
                                  {gc.code}
                                </span>
                                {gc.price_nok > 0 ? (
                                  <span style={{
                                    background: 'rgba(255, 140, 0, 0.15)',
                                    color: '#ff8c00',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '4px',
                                    fontWeight: 800,
                                    fontSize: '0.75rem'
                                  }}>
                                    {gc.price_nok} NOK
                                  </span>
                                ) : (
                                  <span style={{
                                    background: 'rgba(0, 255, 178, 0.12)',
                                    color: '#00ffb2',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '4px',
                                    fontWeight: 800,
                                    fontSize: '0.75rem'
                                  }}>
                                    FREE
                                  </span>
                                )}
                                {!gc.is_active && (
                                  <span style={{ background: '#444', color: '#aaa', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.65rem' }}>
                                    Inactive
                                  </span>
                                )}
                              </div>
                              {gc.note && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                                  {gc.note}
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => handleCopyLink(gc.code, gc.id)}
                              style={{
                                background: isCopied ? 'rgba(0, 255, 178, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                color: isCopied ? '#00ffb2' : '#fff',
                                border: '1px solid var(--color-border)',
                                borderRadius: '6px',
                                padding: '0.35rem 0.75rem',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              {isCopied ? '✓ Link Copied' : '📋 Copy Link'}
                            </button>

                            <button
                              type="button"
                              onClick={() => setExpandedCodeId(isExpanded ? null : gc.id)}
                              style={{
                                background: isExpanded ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                color: '#fff',
                                border: '1px solid var(--color-border)',
                                borderRadius: '6px',
                                padding: '0.35rem 0.75rem',
                                fontSize: '0.75rem',
                                cursor: 'pointer'
                              }}
                            >
                              👥 Guests ({gc.claimed_count}) {isExpanded ? '▲' : '▼'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenEditCodeModal(gc)}
                              style={{
                                background: 'transparent',
                                color: 'var(--color-text-secondary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '6px',
                                padding: '0.35rem 0.6rem',
                                fontSize: '0.75rem',
                                cursor: 'pointer'
                              }}
                            >
                              ✏ Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleCodeActive(gc)}
                              style={{
                                background: 'transparent',
                                color: gc.is_active ? '#ff8c00' : '#00ffb2',
                                border: '1px solid var(--color-border)',
                                borderRadius: '6px',
                                padding: '0.35rem 0.6rem',
                                fontSize: '0.75rem',
                                cursor: 'pointer'
                              }}
                            >
                              {gc.is_active ? 'Disable' : 'Enable'}
                            </button>

                            {gc.claimed_count === 0 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCode(gc)}
                                style={{
                                  background: 'transparent',
                                  color: '#ff3b5c',
                                  border: '1px solid rgba(255, 59, 92, 0.3)',
                                  borderRadius: '6px',
                                  padding: '0.35rem 0.6rem',
                                  fontSize: '0.75rem',
                                  cursor: 'pointer'
                                }}
                                title="Delete unused code"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div style={{ marginTop: '0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem', flexWrap: 'wrap', gap: '0.25rem' }}>
                            <span style={{ color: isFullyClaimed ? '#ff8c00' : 'var(--color-text-muted)' }}>
                              <strong>{gc.claimed_count}</strong> / {gc.guest_limit} claimed {isFullyClaimed && '(Fully claimed)'}
                              {gc.pending_count > 0 && (
                                <span style={{ color: '#ff8c00', marginLeft: '0.5rem', fontWeight: 600 }}>
                                  ({gc.pending_count} payment pending)
                                </span>
                              )}
                            </span>
                            <span style={{ color: 'var(--color-text-muted)' }}>{percent}%</span>
                          </div>
                          <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${percent}%`,
                              height: '100%',
                              background: isFullyClaimed ? '#ff8c00' : '#00ffb2',
                              borderRadius: '3px',
                              transition: 'width 0.3s ease'
                            }} />
                          </div>
                        </div>

                        {/* Expanded Claimed Guests List */}
                        {isExpanded && (
                          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                            <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Claimed Guests ({gc.tickets?.length || 0})
                            </h5>

                            {gc.tickets && gc.tickets.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {gc.tickets.map((t: any) => (
                                  <div
                                    key={t.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      background: 'rgba(0, 0, 0, 0.4)',
                                      padding: '0.6rem 0.75rem',
                                      borderRadius: '6px',
                                      fontSize: '0.8rem',
                                      flexWrap: 'wrap',
                                      gap: '0.5rem'
                                    }}
                                  >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <strong style={{ color: '#fff' }}>{t.holder_name || 'Guest'}</strong>
                                        <span style={{ color: 'var(--color-text-muted)' }}>·</span>
                                        <span style={{ color: '#aaa' }}>{t.holder_email}</span>
                                        {t.order_id && (
                                          <span style={{ background: 'rgba(255, 140, 0, 0.2)', color: '#ff8c00', fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '3px', fontWeight: 700 }}>
                                            PAID
                                          </span>
                                        )}
                                      </div>
                                      <div style={{ fontSize: '0.7rem', color: '#666', fontFamily: 'var(--font-mono)' }}>
                                        Code: <strong style={{ color: '#00ffb2' }}>{t.short_code}</strong> · {t.ticket_code}
                                        {t.used_at && ` · Checked in at ${new Date(t.used_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                      </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                      <span style={{
                                        background: t.status === 'used' ? 'rgba(0, 150, 255, 0.2)' : t.status === 'void' ? 'rgba(255, 59, 92, 0.2)' : 'rgba(0, 255, 178, 0.15)',
                                        color: t.status === 'used' ? '#00b4ff' : t.status === 'void' ? '#ff3b5c' : '#00ffb2',
                                        padding: '0.15rem 0.45rem',
                                        borderRadius: '4px',
                                        fontWeight: 800,
                                        fontSize: '0.65rem'
                                      }}>
                                        {t.status.toUpperCase()}
                                      </span>

                                      {t.status !== 'void' && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => handleResendClaimEmail(t.id)}
                                            style={{
                                              background: 'transparent',
                                              color: 'var(--color-text-secondary)',
                                              border: '1px solid var(--color-border)',
                                              borderRadius: '4px',
                                              padding: '0.2rem 0.5rem',
                                              fontSize: '0.7rem',
                                              cursor: 'pointer'
                                            }}
                                            title="Resend ticket email"
                                          >
                                            ✉ Resend
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleVoidClaimedTicket(t.id)}
                                            style={{
                                              background: 'transparent',
                                              color: '#ff3b5c',
                                              border: '1px solid rgba(255, 59, 92, 0.3)',
                                              borderRadius: '4px',
                                              padding: '0.2rem 0.5rem',
                                              fontSize: '0.7rem',
                                              cursor: 'pointer'
                                            }}
                                            title="Void ticket"
                                          >
                                            ✕ Void
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: 0 }}>
                                No tickets claimed yet with this code.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: '1.25rem', border: '1px dashed var(--color-border)', borderRadius: '8px', textAlign: 'center', marginTop: '1rem' }}>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: '0 0 0.75rem 0' }}>
                    No DJ guest codes created yet for this event.
                  </p>
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={handleOpenAddCodeModal}
                  >
                    + Create First DJ Guest Code
                  </button>
                </div>
              )}

              {/* ── Secondary Accordion: Issue Guest Ticket Manually ── */}
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => setShowManualGuestSection(!showManualGuestSection)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: 0
                  }}
                >
                  <span>{showManualGuestSection ? '▼' : '►'}</span>
                  <span>Issue Guest Ticket Manually (Admin Override / VIP)</span>
                </button>

                {showManualGuestSection && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginTop: '1rem' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                      Manually issue free guest tickets and send them directly to an email address without a DJ code.
                    </p>
                    <div className={styles.row2}>
                      <div className={styles.field}>
                        <label className={styles.label}>Guest Name *</label>
                        <input className={styles.input} value={newGuest.name} onChange={e => setNewGuest({ ...newGuest, name: e.target.value })} placeholder="Full name" />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Guest Email *</label>
                        <input className={styles.input} value={newGuest.email} onChange={e => setNewGuest({ ...newGuest, email: e.target.value })} placeholder="email@example.com" />
                      </div>
                    </div>
                    <div className={styles.row2} style={{ marginTop: '0.75rem' }}>
                      <div className={styles.field}>
                        <label className={styles.label}>Quantity</label>
                        <input type="number" className={styles.input} value={newGuest.quantity} onChange={e => setNewGuest({ ...newGuest, quantity: parseInt(e.target.value) || 1 })} min={1} max={20} />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Note (Optional)</label>
                        <input className={styles.input} value={newGuest.note} onChange={e => setNewGuest({ ...newGuest, note: e.target.value })} placeholder="e.g. VIP Door Pass" />
                      </div>
                    </div>
                    <button 
                      className={styles.addBtn} 
                      style={{ marginTop: '1rem', width: '100%' }}
                      onClick={handleIssueGuest}
                      disabled={issuingGuest || !newGuest.name || !newGuest.email}
                    >
                      {issuingGuest ? 'Issuing...' : 'Issue Manual Guest Ticket(s) & Send Email'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* ── Email Attendees ── */}
        {!ev.id?.startsWith('new-') && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Email Attendees</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Broadcast a message to all users holding valid or checked-in tickets for this event.
            </p>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
              <div className={styles.field} style={{ marginBottom: '1rem' }}>
                <label className={styles.label}>Subject *</label>
                <input 
                  className={styles.input} 
                  value={emailSubject} 
                  onChange={e => setEmailSubject(e.target.value)} 
                  placeholder="e.g. Venue change update / Important information" 
                  disabled={emailSending}
                />
              </div>

              <div className={styles.field} style={{ marginBottom: '1rem' }}>
                <label className={styles.label}>Campaign Key *</label>
                <input 
                  className={styles.input} 
                  value={campaignKey} 
                  onChange={e => setCampaignKey(e.target.value)} 
                  placeholder="e.g. location-info" 
                  disabled={emailSending}
                />
              </div>

              <div className={styles.field} style={{ marginBottom: '1rem' }}>
                <label className={styles.label}>Send Mode</label>
                <select 
                  className={styles.input} 
                  value={sendMode} 
                  onChange={e => setSendMode(e.target.value as 'all' | 'unsent_only')}
                  disabled={emailSending}
                >
                  <option value="unsent_only">Send only to attendees who have not received this campaign yet</option>
                  <option value="all">Send to everyone</option>
                </select>
              </div>

              <div className={styles.toggleRow} style={{ marginBottom: '1rem' }}>
                <input 
                  type="checkbox" 
                  id="autoSendToLateBuyers" 
                  checked={autoSendToLateBuyers} 
                  onChange={e => handleToggleAutoSend(e.target.checked)} 
                  disabled={emailSending}
                />
                <label htmlFor="autoSendToLateBuyers" style={{ fontSize: '0.85rem' }}>Automatically send this campaign to late ticket buyers</label>
              </div>

              {autoSendToLateBuyers && (
                <div className={styles.field} style={{ marginBottom: '1.25rem' }}>
                  <label className={styles.label}>Campaign active from</label>
                  <input 
                    type="datetime-local" 
                    className={styles.input} 
                    value={startsAt} 
                    onChange={e => setStartsAt(e.target.value)} 
                    disabled={emailSending}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                    Late buyers after this time will automatically receive this email.
                  </p>
                </div>
              )}

              <div className={styles.toggleRow} style={{ marginBottom: '1rem' }}>
                <input 
                  type="checkbox" 
                  id="testMode" 
                  checked={testMode} 
                  onChange={e => setTestMode(e.target.checked)} 
                  disabled={emailSending}
                />
                <label htmlFor="testMode" style={{ fontSize: '0.85rem' }}>Send as test email</label>
              </div>

              {testMode && (
                <div className={styles.field} style={{ marginBottom: '1.25rem' }}>
                  <label className={styles.label}>Test recipient email *</label>
                  <input 
                    type="email"
                    className={styles.input} 
                    value={testEmail} 
                    onChange={e => setTestEmail(e.target.value)} 
                    placeholder="e.g. admin@example.com" 
                    disabled={emailSending}
                  />
                </div>
              )}

              <div className={styles.field} style={{ marginBottom: '1rem' }}>
                <label className={styles.label}>Message *</label>
                <textarea 
                  className={`${styles.input} ${styles.textarea}`} 
                  value={emailMessage} 
                  onChange={e => setEmailMessage(e.target.value)} 
                  placeholder="Type your message here..." 
                  disabled={emailSending}
                  style={{ minHeight: '150px' }}
                />
              </div>

              {/* Inline Images Upload Section */}
              <div className={styles.field} style={{ marginBottom: '1rem' }}>
                <label className={styles.label}>Images (Max 5)</label>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                  {imageItems.map((item) => (
                    <div key={item.id} style={{ position: 'relative', width: '80px', height: '80px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: '#1a1a1a' }}>
                      <img src={item.previewUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: item.status === 'uploading' ? 0.4 : 1 }} />
                      
                      {item.status === 'uploading' && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
                          <span style={{ fontSize: '0.65rem', color: '#fff', textAlign: 'center', width: '100%' }}>Uploading...</span>
                        </div>
                      )}
                      
                      {item.status === 'error' && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,59,92,0.8)' }} title={item.error || 'Upload failed'}>
                          <span style={{ fontSize: '0.65rem', color: '#fff', textAlign: 'center', width: '100%' }}>Failed</span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveImage(item.id)}
                        style={{
                          position: 'absolute',
                          top: '2px',
                          right: '2px',
                          background: 'rgba(255, 59, 92, 0.9)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: '10px',
                          padding: 0,
                          lineHeight: 1
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  {imageItems.length < 5 && (
                    <label 
                      style={{ 
                        width: '80px', 
                        height: '80px', 
                        border: '1px dashed var(--color-border)', 
                        borderRadius: 'var(--radius-sm)', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        cursor: 'pointer', 
                        background: 'rgba(255,255,255,0.01)',
                        transition: 'border-color 0.2s, color 0.2s',
                        color: 'var(--color-text-muted)'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-primary)'; e.currentTarget.style.color = 'var(--color-accent-primary)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                    >
                      <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>+</span>
                      <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>Upload</span>
                      <input 
                        type="file" 
                        multiple 
                        accept="image/*" 
                        onChange={handleImageSelect} 
                        style={{ display: 'none' }} 
                        disabled={emailSending}
                      />
                    </label>
                  )}
                </div>
                {imageItems.some(item => item.status === 'error') && (
                  <div style={{ color: '#ff3b5c', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    ✕ Some images failed to upload. Please remove them to send.
                  </div>
                )}
              </div>

              {emailSuccess && (
                <div style={{ color: '#00ffb2', fontSize: '0.85rem', marginBottom: '1rem', padding: '0.5rem', background: 'rgba(0,255,178,0.1)', borderRadius: '4px' }}>
                  ✓ {emailSuccess}
                </div>
              )}

              {emailError && (
                <div style={{ color: '#ff3b5c', fontSize: '0.85rem', marginBottom: '1rem', padding: '0.5rem', background: 'rgba(255,59,92,0.1)', borderRadius: '4px' }}>
                  ✕ {emailError}
                </div>
              )}

              <button 
                className={styles.saveBtn} 
                style={{ width: '100%', padding: '0.75rem' }}
                onClick={handleEmailAttendees}
                disabled={
                  emailSending || 
                  !emailSubject.trim() || 
                  !emailMessage.trim() || 
                  (testMode && (!testEmail.trim() || !testEmail.includes('@'))) ||
                  imageItems.some(item => item.status === 'uploading') || 
                  imageItems.some(item => item.status === 'error')
                }
              >
                {emailSending 
                  ? (testMode ? 'Sending Test Email...' : 'Sending Email Broadcast...') 
                  : (testMode ? 'SEND TEST EMAIL' : 'Send Email to Attendees')}
              </button>
            </div>
          </section>
        )}

        {/* ── Description ── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Description <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span></h3>
          <div className={styles.localeTabs}>
            {LOCALES.map(l => (
              <button key={l.key} className={`${styles.localeTab} ${descLocale === l.key ? styles.localeTabActive : ''}`} onClick={() => setDescLocale(l.key)}>
                {l.label}
              </button>
            ))}
          </div>
          <textarea
            className={`${styles.input} ${styles.textarea}`}
            value={ev.description?.[descLocale] || ''}
            onChange={e => update({ description: { ...ev.description, [descLocale]: e.target.value } })}
            placeholder={`Event description in ${descLocale.toUpperCase()}...`}
          />
        </section>


        {/* ── Actions ── */}
        <div className={styles.actions}>
          <button className={styles.saveBtn} onClick={handleSave} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Save Event'}
          </button>
          <button className={styles.dupBtn} onClick={handleDuplicate}>Duplicate</button>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        </div>

        {/* ── Destructive Test Event Cleanup Section ── */}
        {ev.isTestEvent && !ev.id?.startsWith('new-') && (
          <section style={{
            marginTop: '2.5rem',
            padding: '1.25rem',
            background: 'rgba(255, 59, 92, 0.05)',
            border: '1px solid rgba(255, 59, 92, 0.3)',
            borderRadius: '10px'
          }}>
            <h3 style={{ color: '#ff3b5c', margin: '0 0 0.4rem 0', fontSize: '0.95rem', fontWeight: 800 }}>
              Test Event Cleanup
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0 0 1rem 0', lineHeight: 1.4 }}>
              Completely remove this test event and all its tickets (valid and used), ticket types, check-in records, and exclusive test orders from the database.
            </p>
            <button
              type="button"
              onClick={handleOpenDeleteModal}
              style={{
                background: '#ff3b5c',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '0.6rem 1.25rem',
                fontWeight: 800,
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              🗑 Delete Test Event and All Test Data
            </button>
          </section>
        )}
      </div>

      {/* ── Delete Test Event Modal ── */}
      {deleteModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: '#111',
            border: '1px solid #ff3b5c',
            borderRadius: '12px',
            maxWidth: '480px',
            width: '100%',
            padding: '1.5rem',
            color: '#fff'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#ff3b5c', fontSize: '1.15rem' }}>
              Delete Test Event
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              This will permanently delete <strong>{ev.title}</strong> and all related test data. This action cannot be undone.
            </p>

            {deleteStatsLoading ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                Analyzing test records to be deleted...
              </div>
            ) : deleteStats ? (
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '0.75rem',
                marginBottom: '1rem',
                fontSize: '0.8rem'
              }}>
                <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#ff8c00' }}>
                  Records to be deleted:
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <li><strong>1</strong> Event: {deleteStats.title}</li>
                  <li><strong>{deleteStats.ticketTypesCount}</strong> Ticket type(s)</li>
                  <li><strong>{deleteStats.ticketsTotal}</strong> Total tickets ({deleteStats.ticketsValid} valid, {deleteStats.ticketsUsed} used, {deleteStats.ticketsGuest} guest)</li>
                  <li><strong>{deleteStats.exclusiveOrdersCount}</strong> Exclusive test order(s)</li>
                  {deleteStats.sharedOrdersCount > 0 && (
                    <li style={{ color: '#aaa' }}>
                      <strong>{deleteStats.sharedOrdersCount}</strong> Shared orders (parent orders retained, only items for this event removed)
                    </li>
                  )}
                  <li><strong>{deleteStats.checkinsCount}</strong> Event check-in(s)</li>
                </ul>
              </div>
            ) : null}

            {deleteError && (
              <div style={{ color: '#ff3b5c', fontSize: '0.8rem', marginBottom: '1rem' }}>
                ⚠ {deleteError}
              </div>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem' }}>
                To confirm, type <strong style={{ color: '#fff' }}>DELETE</strong> below:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                style={{
                  width: '100%',
                  background: '#000',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  padding: '0.6rem 0.75rem',
                  color: '#fff',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={deletingTestEvent}
                style={{
                  background: 'transparent',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  padding: '0.5rem 1rem',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteConfirmText !== 'DELETE' || deletingTestEvent}
                style={{
                  background: deleteConfirmText === 'DELETE' ? '#ff3b5c' : 'rgba(255, 59, 92, 0.3)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.5rem 1.2rem',
                  fontWeight: 800,
                  cursor: deleteConfirmText === 'DELETE' && !deletingTestEvent ? 'pointer' : 'not-allowed',
                  fontSize: '0.8rem'
                }}
              >
                {deletingTestEvent ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit DJ Guest Code Modal ── */}
      {codeModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: '#111',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            maxWidth: '480px',
            width: '100%',
            padding: '1.5rem',
            color: '#fff'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#fff', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>{editingCode ? '✏ Edit Guest Code' : '➕ Create DJ Guest Code'}</span>
            </h3>

            {codeFormError && (
              <div style={{ background: 'rgba(255, 59, 92, 0.1)', border: '1px solid rgba(255, 59, 92, 0.3)', color: '#ff3b5c', padding: '0.6rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '1rem' }}>
                ⚠ {codeFormError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className={styles.field}>
                <label className={styles.label}>DJ / Artist Name *</label>
                <input
                  className={styles.input}
                  value={codeForm.dj_name}
                  onChange={e => setCodeForm({ ...codeForm, dj_name: e.target.value })}
                  placeholder="e.g. XCSTNZ or Yori"
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>
                  <span>Guest Code *</span>
                  <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'none' }}>Unique code for guests</span>
                </label>
                <input
                  className={styles.input}
                  style={{ fontFamily: 'var(--font-mono)', letterSpacing: '1px', textTransform: 'uppercase' }}
                  value={codeForm.code}
                  onChange={e => setCodeForm({ ...codeForm, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. XCSTNZ25"
                  disabled={!!editingCode}
                  required
                />
              </div>

              <div className={styles.row2}>
                <div className={styles.field}>
                  <label className={styles.label}>Guest Limit *</label>
                  <input
                    type="number"
                    className={styles.input}
                    value={codeForm.guest_limit}
                    onChange={e => setCodeForm({ ...codeForm, guest_limit: parseInt(e.target.value, 10) || 0 })}
                    min={0}
                    max={1000}
                    required
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>
                    <span>Ticket Price (NOK)</span>
                    <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'none' }}>0 = Free</span>
                  </label>
                  <input
                    type="number"
                    className={styles.input}
                    value={codeForm.price_nok}
                    onChange={e => setCodeForm({ ...codeForm, price_nok: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    min={0}
                    step={1}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Expiration (Optional)</label>
                <input
                  type="datetime-local"
                  className={styles.input}
                  value={codeForm.expires_at}
                  onChange={e => setCodeForm({ ...codeForm, expires_at: e.target.value })}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Admin Note (Optional)</label>
                <input
                  className={styles.input}
                  value={codeForm.note}
                  onChange={e => setCodeForm({ ...codeForm, note: e.target.value })}
                  placeholder="e.g. 5 complimentary passes for warm-up DJ"
                />
              </div>

              <div className={styles.toggleRow} style={{ marginTop: '0.25rem' }}>
                <input
                  type="checkbox"
                  id="codeIsActive"
                  checked={codeForm.is_active}
                  onChange={e => setCodeForm({ ...codeForm, is_active: e.target.checked })}
                />
                <label htmlFor="codeIsActive" style={{ fontSize: '0.85rem' }}>
                  Active (allows guests to claim tickets)
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={() => setCodeModalOpen(false)}
                disabled={codeFormSaving}
                style={{
                  background: 'transparent',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  padding: '0.5rem 1rem',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCodeForm}
                disabled={codeFormSaving || !codeForm.dj_name.trim() || !codeForm.code.trim()}
                className={styles.saveBtn}
                style={{ padding: '0.5rem 1.25rem' }}
              >
                {codeFormSaving ? 'Saving...' : editingCode ? 'Save Changes' : 'Create Guest Code'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Live Preview ── */}
      <div className={styles.preview}>
        <p className={styles.previewLabel}>Live Preview</p>
        <div className={styles.previewCard}>
          <div className={styles.previewPoster} style={{ background: previewBg }}>
            <div className={styles.previewOverlay} />
            <div className={styles.previewDateBlock}>
              <span className={styles.previewDay}>{previewDate ? previewDate.getDate() : '—'}</span>
              <span className={styles.previewMonth}>{previewDate ? previewDate.toLocaleString('en', { month: 'short' }).toUpperCase() : '—'}</span>
            </div>
            <span className={`${styles.previewTag} ${ev.type === 'outdoor' ? styles.previewTagPurple : ''}`}>{ev.type || 'club'}</span>
            <span className={styles.previewTag} style={{ marginLeft: '0.25rem' }}>{ev.ageRestriction || '18+'}</span>
          </div>
          <div className={styles.previewInfo}>
            <div className={styles.previewTitle}>{ev.title || 'Event title'}</div>
            <div className={styles.previewMeta}>{timeStart || '22:00'} · {typeof ev.venue === 'object' ? ev.venue['en'] || 'Venue' : ev.venue || 'Venue'}</div>
            {ev.lineup.length > 0 && (
              <div className={styles.previewLineup}>
                <span className={styles.previewLineupLabel}>Lineup</span>
                <div className={styles.previewNames}>{ev.lineup.join(', ')}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
