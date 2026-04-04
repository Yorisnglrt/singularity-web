'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);

  useEffect(() => {
    // Check if we have a session (the reset link auto-logs the user in temporarily)
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsValidSession(true);
      } else {
        setError('Your reset link is invalid or has expired.');
      }
    };
    checkSession();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess('Password updated successfully! Redirecting...');
        setTimeout(() => {
          router.push('/');
        }, 3000);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={`${styles.card} glass`}>
        <div className={styles.logo}>◈ SINGULARITY</div>
        <h1 className={styles.title}>New Password</h1>
        <p className={styles.subtitle}>
          Secure your account by setting a new strong password.
        </p>

        {!isValidSession && !error && <div className={styles.loading}>Verifying link...</div>}

        {(isValidSession || success) ? (
          <form onSubmit={handleReset} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>New Password</label>
              <input
                className={styles.input}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={!!success}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Confirm New Password</label>
              <input
                className={styles.input}
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                disabled={!!success}
              />
            </div>

            {error && <div className={styles.error}>{error}</div>}
            {success && <div className={styles.success}>{success}</div>}

            {!success && (
              <button className={styles.submitBtn} type="submit" disabled={loading}>
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            )}
          </form>
        ) : (
          <div className={styles.errorBox}>
            <div className={styles.error}>{error}</div>
            <button className={styles.backBtn} onClick={() => router.push('/')}>
              Back to Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
