'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import styles from './AuthModal.module.css';

interface AuthModalProps {
  onClose: () => void;
  defaultMode?: 'login' | 'register';
}

export default function AuthModal({ onClose, defaultMode = 'login' }: AuthModalProps) {
  const { login, register, forgotPassword } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    
    try {
      if (mode === 'login') {
        const result = await login(email, password);
        if (result?.error) {
          setError(result.error);
          return;
        }
        onClose();
      } else if (mode === 'register') {
        const result = await register(email, password, displayName);
        if (result?.error) {
          setError(result.error);
          return;
        }
        onClose();
      } else {
        const result = await forgotPassword(email);
        if (result?.error) {
          setError(result.error);
        } else {
          setSuccess('Check your email for reset instructions.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const titles = {
    login: 'Sign In',
    register: 'Create Account',
    forgot: 'Reset Password'
  };

  const subtitles = {
    login: 'Sign in to save events, track your attendance, and earn points.',
    register: 'Join Singularity to interact with events and build your history.',
    forgot: 'Enter your email to receive a password reset link.'
  };

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>

        <div className={styles.logo}>◈ SINGULARITY</div>
        <h2 className={styles.title}>{titles[mode]}</h2>
        <p className={styles.subtitle}>{subtitles[mode]}</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          {mode === 'register' && (
            <div className={styles.field}>
              <label className={styles.label}>Display name</label>
              <input
                className={styles.input}
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                required
              />
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              className={styles.input}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          {mode !== 'forgot' && (
            <div className={styles.field}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className={styles.label}>Password</label>
                {mode === 'login' && (
                  <button 
                    type="button" 
                    className={styles.forgotLink}
                    onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                className={styles.input}
                type="password"
                placeholder={mode === 'register' ? 'Min. 6 characters' : '••••••••'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
          )}

          {error && <div className={styles.error}>{error}</div>}
          {success && <div className={styles.successMessage}>{success}</div>}

          <button className={styles.submitBtn} type="submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'forgot' ? 'Send Reset Link' : titles[mode]}
          </button>
        </form>

        <div className={styles.switchMode}>
          {mode === 'login' ? (
            <>Don&apos;t have an account?{' '}
              <button onClick={() => { setMode('register'); setError(''); setSuccess(''); }}>Register</button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button onClick={() => { setMode('login'); setError(''); setSuccess(''); }}>Sign In</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
