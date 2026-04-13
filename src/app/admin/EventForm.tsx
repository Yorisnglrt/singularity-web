'use client';

import { useState, useCallback } from 'react';
import styles from './EventForm.module.css';

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
  isFree: boolean;
  ticketUrl?: string;
  isPast: boolean;
  isFeatured?: boolean;
}

interface Props {
  item: EventLike;
  allArtists: Artist[];
  onSave: (item: EventLike) => void;
  onDuplicate: (item: EventLike) => void;
  onCancel: () => void;
  onUpload: (file: File) => Promise<string>;
  uploading: boolean;
}

const LOCALES = [
  { key: 'en', label: 'EN' },
  { key: 'no', label: 'NO' },
  { key: 'cs', label: 'CZ' },
  { key: 'pl', label: 'PL' },
] as const;

type Locale = typeof LOCALES[number]['key'];

export default function EventForm({ item, allArtists, onSave, onDuplicate, onCancel, onUpload, uploading }: Props) {
  const [ev, setEv] = useState<EventLike>(item);
  const [descLocale, setDescLocale] = useState<Locale>('en');

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

          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>Ticket URL</label>
              <input className={styles.input} value={ev.ticketUrl || ''} onChange={e => update({ ticketUrl: e.target.value })} placeholder="https://..." />
            </div>
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
