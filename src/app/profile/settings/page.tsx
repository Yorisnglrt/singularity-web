'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import styles from './page.module.css';
import Link from 'next/link';
import AvatarUpload from '@/components/AvatarUpload';

export default function ProfileSettingsPage() {
  const { user, updateProfile, isLoading } = useAuth();
  const router = useRouter();

  // Local form state
  const [formData, setFormData] = useState({
    displayName: '',
    avatarUrl: '',
    bio: '',
    favoriteProducer: '',
    favoriteTrack: '',
    favoriteVenue: '',
    favoriteFestival: '',
    city: '',
    favoriteSubgenre: '',
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [errors, setErrors] = useState<{ displayName?: string }>({});

  // Initialize form when user data is available
  useEffect(() => {
    if (user) {
      setFormData({
        displayName: user.displayName || '',
        avatarUrl: user.avatarUrl || '',
        bio: user.bio || '',
        favoriteProducer: user.favoriteProducer || '',
        favoriteTrack: user.favoriteTrack || '',
        favoriteVenue: user.favoriteVenue || '',
        favoriteFestival: user.favoriteFestival || '',
        city: user.city || '',
        favoriteSubgenre: user.favoriteSubgenre || '',
      });
    }
  }, [user]);

  // Redirect if not logged in
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/profile');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}>◈</div>
      </div>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error for field
    if (name === 'displayName' && value.trim()) {
      setErrors(prev => ({ ...prev, displayName: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setErrors({});

    // Validation
    if (!formData.displayName.trim()) {
      setErrors({ displayName: 'Display name is required' });
      setSaving(false);
      return;
    }

    const { error } = await updateProfile({
      displayName: formData.displayName.trim(),
      avatarUrl: formData.avatarUrl.trim() || undefined,
      bio: formData.bio.trim() || undefined,
      favoriteProducer: formData.favoriteProducer.trim() || undefined,
      favoriteTrack: formData.favoriteTrack.trim() || undefined,
      favoriteVenue: formData.favoriteVenue.trim() || undefined,
      favoriteFestival: formData.favoriteFestival.trim() || undefined,
      city: formData.city.trim() || undefined,
      favoriteSubgenre: formData.favoriteSubgenre.trim() || undefined,
    });

    if (error) {
      setMessage({ text: error, type: 'error' });
    } else {
      setMessage({ text: 'Profile updated successfully!', type: 'success' });
      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    }
    setSaving(false);
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <header className={styles.header}>
          <Link href="/profile" className={styles.backLink}>← Back to Profile</Link>
          <h1 className={styles.title}>Edit Profile</h1>
          <p className={styles.subtitle}>Customize your public identity on the Singularity platform.</p>
        </header>

        <form onSubmit={handleSubmit} className={styles.form}>
          {message && (
            <div className={`${styles.message} ${styles[message.type]}`}>
              {message.type === 'success' ? '✓' : '✕'} {message.text}
            </div>
          )}

          {/* Group 1: Basic Info */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Basic Info</h2>
            <div className={styles.fieldGroup}>
              <div className={styles.field}>
                <label htmlFor="displayName">Display Name *</label>
                <input
                  type="text"
                  id="displayName"
                  name="displayName"
                  value={formData.displayName}
                  onChange={handleChange}
                  placeholder="How you appear to others"
                  className={errors.displayName ? styles.inputError : ''}
                />
                {errors.displayName && <p className={styles.errorText}>{errors.displayName}</p>}
              </div>

              <div className={styles.field}>
                <label>Profile Photo</label>
                <AvatarUpload 
                  currentUrl={formData.avatarUrl} 
                  onUploadSuccess={(url) => setFormData(prev => ({ ...prev, avatarUrl: url }))} 
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="bio">Bio</label>
                <textarea
                  id="bio"
                  name="bio"
                  value={formData.bio}
                  onChange={handleChange}
                  placeholder="Tell us about yourself..."
                  rows={4}
                />
              </div>
            </div>
          </section>

          {/* Group 2: Favorites */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Music & Scene Favorites</h2>
            <div className={styles.gridFields}>
              <div className={styles.field}>
                <label htmlFor="favoriteProducer">Favorite Producer</label>
                <input
                  type="text"
                  id="favoriteProducer"
                  name="favoriteProducer"
                  value={formData.favoriteProducer}
                  onChange={handleChange}
                  placeholder="e.g. Noisia, Alix Perez"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="favoriteTrack">Favorite Track</label>
                <input
                  type="text"
                  id="favoriteTrack"
                  name="favoriteTrack"
                  value={formData.favoriteTrack}
                  onChange={handleChange}
                  placeholder="The one that never gets old"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="favoriteSubgenre">Favorite Subgenre</label>
                <input
                  type="text"
                  id="favoriteSubgenre"
                  name="favoriteSubgenre"
                  value={formData.favoriteSubgenre}
                  onChange={handleChange}
                  placeholder="e.g. Neurofunk, Liquid, Deep"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="favoriteVenue">Favorite Venue</label>
                <input
                  type="text"
                  id="favoriteVenue"
                  name="favoriteVenue"
                  value={formData.favoriteVenue}
                  onChange={handleChange}
                  placeholder="Where the bass hits hardest"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="favoriteFestival">Favorite Festival</label>
                <input
                  type="text"
                  id="favoriteFestival"
                  name="favoriteFestival"
                  value={formData.favoriteFestival}
                  onChange={handleChange}
                  placeholder="Your annual pilgrimage"
                />
              </div>
            </div>
          </section>

          {/* Group 3: Location */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Location</h2>
            <div className={styles.field}>
              <label htmlFor="city">City</label>
              <input
                type="text"
                id="city"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="Where are you based?"
              />
            </div>
          </section>

          <footer className={styles.formFooter}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving changes...' : 'Save Profile'}
            </button>
            <Link href="/profile" className={styles.cancelBtn}>Cancel</Link>
          </footer>
        </form>
      </div>
    </div>
  );
}
