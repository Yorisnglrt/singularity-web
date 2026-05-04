'use client';

import { useState, useCallback, useEffect } from 'react';
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
}

const LOCALES = [
  { key: 'en', label: 'EN' },
  { key: 'no', label: 'NO' },
  { key: 'cs', label: 'CZ' },
  { key: 'pl', label: 'PL' },
] as const;

type Locale = typeof LOCALES[number]['key'];

export default function EventForm({ item, allArtists, ticketTypes, onSave, onDuplicate, onCancel, onUpload, uploading, onSaveTicketType, onDeleteTicketType }: Props) {
  const [ev, setEv] = useState<EventLike>(item);
  const [descLocale, setDescLocale] = useState<Locale>('en');

  // ── Ticket-type editing state ──
  const [editingTT, setEditingTT] = useState<EventTicketType | null>(null);
  const [ttErrors, setTtErrors] = useState<Record<string, string>>({});

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
  const [lineupSearch, setLineupSearch] = useState('');

  // Guest list states
  const [guestList, setGuestList] = useState<any[]>([]);
  const [newGuest, setNewGuest] = useState({ name: '', email: '', quantity: 1, note: '' });
  const [issuingGuest, setIssuingGuest] = useState(false);

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
    fetchGuestList();
  }, [fetchGuestList]);

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
    } catch (err) {
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
        <h2 className={styles.heading}>Edit Event</h2>

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
                  <input type="datetime-local" className={styles.input} value={editingTT.saleStartsAt ? editingTT.saleStartsAt.slice(0, 16) : ''} onChange={e => setEditingTT({ ...editingTT, saleStartsAt: e.target.value ? e.target.value + ':00Z' : null })} />
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
                  <input type="datetime-local" className={styles.input} value={editingTT.saleEndsAt ? editingTT.saleEndsAt.slice(0, 16) : ''} disabled={!editingTT.saleEndsAt && editingTT.saleEndsAt !== ''} style={!editingTT.saleEndsAt && editingTT.saleEndsAt !== '' ? { opacity: 0.4, cursor: 'not-allowed' } : {}} onChange={e => setEditingTT({ ...editingTT, saleEndsAt: e.target.value ? e.target.value + ':00Z' : null })} />
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

        {/* ── Guest List ── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Guest List</h3>
          {ev.id?.startsWith('new-') ? (
            <div style={{ padding: '1.5rem', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
              Guest List management is available after saving the event.
            </div>
          ) : (
            <>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                Create free tickets and send them to guests via email.
              </p>

              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add to Guest List</h4>
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
                    <input className={styles.input} value={newGuest.note} onChange={e => setNewGuest({ ...newGuest, note: e.target.value })} placeholder="e.g. DJ Guest" />
                  </div>
                </div>
                <button 
                  className={styles.addBtn} 
                  style={{ marginTop: '1rem', width: '100%' }}
                  onClick={handleIssueGuest}
                  disabled={issuingGuest || !newGuest.name || !newGuest.email}
                >
                  {issuingGuest ? 'Issuing...' : 'Issue Guest Ticket(s) & Send Email'}
                </button>
              </div>

              {guestList.length > 0 ? (
                <div className={styles.guestList}>
                  {guestList.map(t => (
                    <div key={t.id} className={styles.guestItem}>
                      <div className={styles.guestInfo}>
                        <span className={styles.guestName}>{t.holder_name}</span>
                        <span className={styles.guestEmail}>{t.holder_email} · {t.ticket_code}</span>
                        {t.note && <span className={styles.guestNote}>{t.note}</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span className={`${styles.guestBadge} ${t.status === 'void' ? styles.guestBadgeVoid : ''}`}>
                          {t.status.toUpperCase()}
                        </span>
                        {t.status !== 'void' && (
                          <button className={styles.removeBtn} onClick={() => handleVoidGuest(t.id)} title="Void Ticket">✕</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '1rem' }}>Guest list is empty.</p>
              )}
            </>
          )}
        </section>

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
      </div>

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
