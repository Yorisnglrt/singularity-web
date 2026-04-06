'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { toSlug } from '@/lib/slug';
import EventForm from './EventForm';
import ImageUpload from '@/components/ImageUpload';
import styles from './page.module.css';

type Tab = 'artists' | 'events' | 'mixes' | 'supporters';

export default function AdminPage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('artists');
  
  const [data, setData] = useState<{artists: any[], events: any[], mixes: any[], supporters: any[]}>({
    artists: [],
    events: [],
    mixes: [],
    supporters: []
  });

  const [activeItem, setActiveItem] = useState<any>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [uploading, setUploading] = useState(false);

  const fetchData = async (type: Tab) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/data?type=${type}`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });
      if (res.ok) {
        const json = await res.json();
        setData(prev => ({ ...prev, [type]: json }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!isLoading && (!user || !user.isAdmin)) {
      router.push('/');
    } else if (user?.isAdmin) {
      fetchData('artists');
      fetchData('events');
      fetchData('mixes');
      fetchData('supporters');
    }
  }, [user, isLoading, router]);

  const saveToApi = async (type: Tab, newData: any[]) => {
    try {
      setStatusMsg('Saving...');
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/save', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ type, data: newData })
      });
      if (res.ok) {
        setData(prev => ({ ...prev, [type]: newData }));
        setStatusMsg('Saved successfully!');
        setTimeout(() => setStatusMsg(''), 3000);
      } else {
        setStatusMsg('Failed to save.');
      }
    } catch (e) {
      setStatusMsg('Error saving.');
    }
  };

  const handleSaveItem = () => {
    if (!activeItem) return;
    const currentArray = [...data[activeTab]];
    const index = currentArray.findIndex(i => i.id === activeItem.id);
    if (index >= 0) {
      currentArray[index] = activeItem;
    } else {
      currentArray.push(activeItem);
    }
    saveToApi(activeTab, currentArray);
  };

  const handleDeleteItem = (id: string) => {
    if (!confirm('Delete this item?')) return;
    const currentArray = data[activeTab].filter(i => i.id !== id);
    saveToApi(activeTab, currentArray);
    if (activeItem?.id === id) setActiveItem(null);
  };

  const handleUploadAudio = async (file: File) => {
    setUploading(true);
    setStatusMsg('Uploading audio...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/upload', { 
        method: 'POST', 
        body: formData,
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });
      if (res.ok) {
        const json = await res.json();
        setActiveItem((prev: any) => ({ ...prev, audioSrc: json.path }));
        setStatusMsg(`Uploaded: ${json.filename}`);
        setTimeout(() => setStatusMsg(''), 4000);
      } else {
        const err = await res.json();
        setStatusMsg(`Upload failed: ${err.error}`);
      }
    } catch (e) {
      setStatusMsg('Upload error.');
    } finally {
      setUploading(false);
    }
  };

  // Shared upload helper (images for events/artists)
  const handleUploadFile = async (file: File): Promise<string> => {
    setUploading(true);
    setStatusMsg('Uploading...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/upload', { 
        method: 'POST', 
        body: formData,
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });
      if (res.ok) {
        const json = await res.json();
        setStatusMsg(`Uploaded: ${json.filename}`);
        setTimeout(() => setStatusMsg(''), 4000);
        return json.path as string;
      } else {
        setStatusMsg('Upload failed.');
        return '';
      }
    } catch {
      setStatusMsg('Upload error.');
      return '';
    } finally {
      setUploading(false);
    }
  };

  const handleMigrate = async () => {
    if (!confirm('Tímto nahrajete všechna lokální JSON data do Supabase. Pokračovat?')) return;
    setStatusMsg('Migrating data...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/migrate', {
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });
      const json = await res.json();
      if (json.success) {
        setStatusMsg('Migration successful!');
        console.log('Migration summary:', json.summary);
        // Refresh data
        tables.forEach(t => fetchData(t as Tab));
      } else {
        setStatusMsg(`Migration failed: ${json.error}`);
      }
    } catch (e) {
      setStatusMsg('Migration error.');
    } finally {
      setTimeout(() => setStatusMsg(''), 5000);
    }
  };

  const tables = ['artists', 'events', 'mixes', 'supporters'];

  const createNewItem = () => {
    const idStr = `new-${Date.now()}`;
    if (activeTab === 'artists') {
      setActiveItem({
        id: idStr,
        name: 'New Artist',
        bio: {en:'', cs:'', no:'', pl:'', de:''},
        isCrew: false,
        isInvited: true,
        avatarGradient: 'linear-gradient(135deg, #000, #333)',
        socialLinks: {},
        _isNew: true
      });
    } else if (activeTab === 'events') {
      setActiveItem({ id: idStr, title: 'New Event', date: new Date().toISOString().split('T')[0], time: '22:00 - 04:00', venue: 'TBA', type: 'club', description: {en:'', cs:'', no:'', pl:''}, lineup: [], posterColor: 'linear-gradient(135deg, #000, #333)', isFree: false, isPast: false });
    } else if (activeTab === 'mixes') {
      setActiveItem({ id: idStr, title: '', artist: '', eventId: '', label: 'Full set', duration: '', date: new Date().toISOString().split('T')[0], coverGradient: 'linear-gradient(135deg, #000, #333)', audioSrc: '', soundcloudUrl: '' });
    } else {
      setActiveItem({ id: idStr, name: 'New Supporter', amount: 0 });
    }
  };

  if (isLoading) {
    return <div className={styles.adminPage}><div className={styles.alert}>Loading...</div></div>;
  }

  if (!user || !user.isAdmin) {
    return null; // Will redirect via useEffect
  }

  // ── Mix editor (dedicated layout) ─────────────────────────────
  const renderMixForm = () => {
    if (!activeItem) return null;
    const eventOptions = data.events.map((e: any) => ({ id: e.id, label: e.title }));

    return (
      <div>
        <h2 style={{marginBottom: '2rem'}}>Edit Mix</h2>

        <div className={styles.formGroup}>
          <label className={styles.label}>ID (Unique slug)</label>
          <input className={styles.input} value={activeItem.id} onChange={e => setActiveItem({...activeItem, id: e.target.value})} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>DJ / Artist name</label>
          <input className={styles.input} value={activeItem.artist} placeholder="e.g. Hany B" onChange={e => setActiveItem({...activeItem, artist: e.target.value})} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Mix title</label>
          <input className={styles.input} value={activeItem.title} placeholder="e.g. 27. 3. 26 DNB Takeover Labyrinth" onChange={e => setActiveItem({...activeItem, title: e.target.value})} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Label / descriptor</label>
          <select className={styles.input} value={activeItem.label} onChange={e => setActiveItem({...activeItem, label: e.target.value})}>
            <option value="Full set">Full set</option>
            <option value="Recorded live">Recorded live</option>
            <option value="DJ mix">DJ mix</option>
            <option value="Exclusive mix">Exclusive mix</option>
          </select>
          <input className={styles.input} style={{marginTop: '0.5rem'}} value={activeItem.label} placeholder="Or type a custom label…" onChange={e => setActiveItem({...activeItem, label: e.target.value})} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Event folder</label>
          <select className={styles.input} value={activeItem.eventId} onChange={e => setActiveItem({...activeItem, eventId: e.target.value})}>
            <option value="">— select event —</option>
            {eventOptions.map((opt: any) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
          <input className={styles.input} style={{marginTop: '0.5rem'}} value={activeItem.eventId} placeholder="Or type a custom event ID" onChange={e => setActiveItem({...activeItem, eventId: e.target.value})} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Date</label>
          <input type="date" className={styles.input} value={activeItem.date} onChange={e => setActiveItem({...activeItem, date: e.target.value})} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Duration (e.g. 59:06)</label>
          <input className={styles.input} value={activeItem.duration} placeholder="60:00" onChange={e => setActiveItem({...activeItem, duration: e.target.value})} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>SoundCloud URL (Primary)</label>
          <input 
            className={styles.input} 
            value={activeItem.soundcloudUrl || ''} 
            placeholder="https://soundcloud.com/artist/track" 
            onChange={e => setActiveItem({...activeItem, soundcloudUrl: e.target.value})} 
          />
          <p style={{fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.4rem'}}>When provided, this will use the SoundCloud mini-widget for playback.</p>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Audio file (MP3 or WAV)</label>
          {activeItem.audioSrc && (
            <div style={{marginBottom: '0.75rem', padding: '0.75rem', background: 'rgba(0,255,178,0.08)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '1rem'}}>
              <span style={{fontSize: '0.85rem', color: 'var(--color-accent-primary)', fontFamily: 'monospace'}}>{activeItem.audioSrc}</span>
              <button onClick={() => setActiveItem({...activeItem, audioSrc: ''})} style={{background: 'none', border: 'none', color: '#ff3b5c', cursor: 'pointer', fontSize: '1rem'}}>✕ Remove</button>
            </div>
          )}
          <input
            type="file"
            accept=".mp3,.wav,audio/mpeg,audio/wav"
            disabled={uploading}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleUploadAudio(file);
            }}
            style={{color: 'var(--color-text-primary)', fontSize: '0.9rem'}}
          />
          <p style={{fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.4rem'}}>Supports MP3 and WAV. File will be saved to /public/audio/</p>
          <div style={{marginTop: '0.5rem'}}>
            <label className={styles.label} style={{marginBottom: '0.25rem', display: 'block'}}>Or paste a URL / path directly</label>
            <input className={styles.input} value={activeItem.audioSrc || ''} placeholder="/audio/filename.mp3" onChange={e => setActiveItem({...activeItem, audioSrc: e.target.value})} />
          </div>
        </div>

        <div className={styles.formActions}>
          <button className={styles.button} onClick={handleSaveItem} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Save Changes'}
          </button>
          <button className={`${styles.button} ${styles.buttonOutline}`} onClick={() => setActiveItem(null)}>Cancel</button>
        </div>
      </div>
    );
  };

  // ── Artist editor (dedicated layout) ─────────────────────────
  const renderArtistForm = () => {
    if (!activeItem) return null;
    return (
      <div>
        <h2 style={{marginBottom: '2rem'}}>Edit Artist</h2>

        <div className={styles.formGroup}>
          <label className={styles.label}>ID (Unique slug)</label>
          <input className={styles.input} value={activeItem.id} onChange={e => setActiveItem({...activeItem, id: e.target.value})} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Name</label>
          <input
            className={styles.input}
            value={activeItem.name}
            onChange={e => {
              const newName = e.target.value;
              const updates: any = { name: newName };
              if (activeItem._isNew) {
                updates.id = toSlug(newName);
              }
              setActiveItem({...activeItem, ...updates});
            }}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Profile Photo (Portrait 3:4)</label>
          <ImageUpload 
            currentUrl={activeItem.photoUrl}
            onUploadSuccess={(url) => setActiveItem({ ...activeItem, photoUrl: url })}
            bucket="artists-avatar"
            uploadPath={`${activeItem.id}/profile.jpg`}
            aspectRatio={3/4}
            circular={false}
            outputWidth={600}
            outputHeight={800}
            label="Change Artist Photo"
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Bio (English)</label>
          <textarea className={`${styles.input} ${styles.textarea}`} value={activeItem.bio?.en || ''} onChange={e => setActiveItem({...activeItem, bio: {...activeItem.bio, en: e.target.value}})} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>SoundCloud URL</label>
          <input className={styles.input} value={activeItem.socialLinks?.soundcloud || ''} placeholder="https://soundcloud.com/..." onChange={e => setActiveItem({...activeItem, socialLinks: {...activeItem.socialLinks, soundcloud: e.target.value}})} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Instagram URL</label>
          <input className={styles.input} value={activeItem.socialLinks?.instagram || ''} placeholder="https://instagram.com/..." onChange={e => setActiveItem({...activeItem, socialLinks: {...activeItem.socialLinks, instagram: e.target.value}})} />
        </div>

        <div className={styles.formGroup} style={{flexDirection: 'row', alignItems: 'center', gap: '1rem'}}>
          <input type="checkbox" id="isCrew" checked={activeItem.isCrew || false} onChange={e => setActiveItem({...activeItem, isCrew: e.target.checked})} />
          <label htmlFor="isCrew" className={styles.label} style={{margin: 0}}>Crew member</label>
        </div>

        <div className={styles.formActions}>
          <button className={styles.button} onClick={handleSaveItem} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Save Changes'}
          </button>
          <button className={`${styles.button} ${styles.buttonOutline}`} onClick={() => setActiveItem(null)}>Cancel</button>
        </div>
      </div>
    );
  };

  // ── Generic field renderer ─────────────────────────────────────
  const renderField = (key: string, value: any) => {
    if (key === 'id') {
      return (
        <div key={key} className={styles.formGroup}>
          <label className={styles.label}>ID (Unique)</label>
          <input className={styles.input} value={value} onChange={e => setActiveItem({...activeItem, [key]: e.target.value})} />
        </div>
      );
    }
    if (typeof value === 'boolean') {
      return (
        <div key={key} className={styles.formGroup} style={{flexDirection: 'row', alignItems: 'center'}}>
          <input type="checkbox" checked={value} onChange={e => setActiveItem({...activeItem, [key]: e.target.checked})} />
          <label className={styles.label} style={{margin:0}}>{key}</label>
        </div>
      );
    }
    if (Array.isArray(value)) {
      return (
        <div key={key} className={styles.formGroup}>
          <label className={styles.label}>{key} (Comma separated)</label>
          <input className={styles.input} value={value.join(', ')} onChange={e => setActiveItem({...activeItem, [key]: e.target.value.split(',').map((s:string)=>s.trim()).filter(Boolean)})} />
        </div>
      );
    }
    if (typeof value === 'object' && value !== null) {
      return (
        <div key={key} className={styles.formGroup}>
          <label className={styles.label}>{key} (Locale Object)</label>
          <textarea className={`${styles.input} ${styles.textarea}`} value={JSON.stringify(value, null, 2)} onChange={e => {
            try { setActiveItem({...activeItem, [key]: JSON.parse(e.target.value)}); } catch(err) {}
          }} />
        </div>
      );
    }
    return (
      <div key={key} className={styles.formGroup}>
        <label className={styles.label}>{key}</label>
        <input className={styles.input} value={value ?? ''} onChange={e => setActiveItem({...activeItem, [key]: e.target.value})} />
      </div>
    );
  };

  const isMixTab = activeTab === 'mixes';
  const isArtistTab = activeTab === 'artists';
  const isEventTab = activeTab === 'events';

  const handleEventSave = (updated: any) => {
    const currentArray = [...data.events];
    const index = currentArray.findIndex(i => i.id === updated.id);
    if (index >= 0) { currentArray[index] = updated; } else { currentArray.push(updated); }
    saveToApi('events', currentArray);
    setActiveItem(updated);
  };

  const handleEventDuplicate = (dup: any) => {
    const currentArray = [...data.events, dup];
    saveToApi('events', currentArray);
    setActiveItem(dup);
  };

  return (
    <div className={styles.adminPage}>
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <h1 className={styles.authTitle}>System Console</h1>
          <button onClick={logout} className={`${styles.button} ${styles.buttonOutline}`} style={{width: 'auto'}}>Logout</button>
        </header>

        {statusMsg && <div className={styles.alert}>{statusMsg}</div>}

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${activeTab === 'artists' ? styles.tabActive : ''}`} onClick={() => { setActiveTab('artists'); setActiveItem(null); }}>Artists</button>
          <button className={`${styles.tab} ${activeTab === 'events' ? styles.tabActive : ''}`} onClick={() => { setActiveTab('events'); setActiveItem(null); }}>Events</button>
          <button className={`${styles.tab} ${activeTab === 'mixes' ? styles.tabActive : ''}`} onClick={() => { setActiveTab('mixes'); setActiveItem(null); }}>Mixes</button>
          <button className={`${styles.tab} ${activeTab === 'supporters' ? styles.tabActive : ''}`} onClick={() => { setActiveTab('supporters'); setActiveItem(null); }}>Supporters</button>
        </div>

        <div className={styles.editorGrid}>
          <aside className={styles.sidebar}>
            <div style={{display:'flex', gap:'0.5rem', flexDirection:'column'}}>
              <button className={styles.button} onClick={createNewItem}>+ Add New</button>
              <button 
                className={`${styles.button} ${styles.buttonOutline}`} 
                onClick={handleMigrate}
                style={{fontSize:'0.75rem', borderColor: 'var(--color-accent-primary)', color: 'var(--color-accent-primary)'}}
              >
                🔄 Migrate Local Data
              </button>
            </div>
            <div style={{marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
              {data[activeTab].map((item: any) => (
                <div
                  key={item.id}
                  className={`${styles.sidebarItem} ${activeItem?.id === item.id ? styles.sidebarItemActive : ''}`}
                  onClick={() => setActiveItem(item)}
                >
                  <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                    {isMixTab ? `${item.artist} — ${item.label || ''}` : (item.name || item.title)}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }} style={{background:'none', border:'none', color:'#ff3b5c', cursor:'pointer'}}>×</button>
                </div>
              ))}
            </div>
          </aside>

          <main className={styles.mainArea} style={isEventTab && activeItem ? { maxWidth: '100%' } : {}}>
            {activeItem ? (
              isMixTab ? renderMixForm() :
              isArtistTab ? renderArtistForm() :
              isEventTab ? (
                <EventForm
                  item={activeItem}
                  allArtists={data.artists}
                  onSave={handleEventSave}
                  onDuplicate={handleEventDuplicate}
                  onCancel={() => setActiveItem(null)}
                  onUpload={handleUploadFile}
                  uploading={uploading}
                />
              ) : (
                <div>
                  <h2 style={{marginBottom: '2rem'}}>Edit Record</h2>
                  {Object.keys(activeItem).map(key => renderField(key, activeItem[key]))}
                  <div className={styles.formActions}>
                    <button className={styles.button} onClick={handleSaveItem}>Save Changes</button>
                    <button className={`${styles.button} ${styles.buttonOutline}`} onClick={() => setActiveItem(null)}>Cancel</button>
                  </div>
                </div>
              )
            ) : (
              <div style={{color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '5rem'}}>
                Select an item from the sidebar to edit, or create a new one.
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
