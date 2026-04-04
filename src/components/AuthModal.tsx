'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import styles from './AuthModal.module.css';

interface AuthModalProps {
  onClose: () => void;
  defaultMode?: 'login' | 'register';
}

export default function AuthModal({ onClose, defaultMode = 'login' }: AuthModalProps) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("AUTH TEST 777");
    setError('');
    setLoading(true);
    
    try {
      console.log("AUTH START", { mode, email });
      
      if (mode === 'login') {
        console.log("DIRECT LOGIN START", email);
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        console.log("DIRECT LOGIN RESPONSE", { data, error });
        
        if (error) {
          setError(error.message);
          alert(error.message);
          return;
        }
        
        console.log("DIRECT LOGIN SUCCESS - CLOSING MODAL");
        onClose();
      } else {
        const result = await register(email, password, displayName);
        console.log("AUTH RESULT (REGISTER)", result);
        
        if (result?.error) {
          setError(result.error);
          alert(result.error || "Registration failed");
        } else {
          console.log("AUTH SUCCESS (REGISTER) - CLOSING MODAL");
          onClose();
        }
      }
    } catch (err: any) {
      console.error("AUTH MODAL ERROR", err);
      alert("Unexpected auth error: " + (err.message || "Unknown"));
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>

        <div className={styles.logo}>◈ SINGULARITY</div>
        <h2 className={styles.title}>{mode === 'login' ? 'Sign In' : 'Create Account'}</h2>
        <p className={styles.subtitle}>
          {mode === 'login'
            ? 'Sign in to save events, track your attendance, and earn points.'
            : 'Join Singularity to interact with events and build your history.'}
        </p>

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

          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <input
              className={styles.input}
              type="password"
              placeholder={mode === 'register' ? 'Min. 6 characters' : '••••••••'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button className={styles.submitBtn} type="submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className={styles.switchMode}>
          {mode === 'login' ? (
            <>Don&apos;t have an account?{' '}
              <button onClick={() => { setMode('register'); setError(''); }}>Register</button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button onClick={() => { setMode('login'); setError(''); }}>Sign In</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
