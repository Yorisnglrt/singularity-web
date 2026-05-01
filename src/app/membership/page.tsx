'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import styles from './page.module.css';

export default function MembershipPage() {
  const { t } = useI18n();
  const { user, register, login, isLoading } = useAuth();
  
  // Form state
  const [formMode, setFormMode] = useState<'register' | 'login'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (formMode === 'register') {
        const result = await register(email, password, displayName, marketingConsent);
        if (result?.error) {
          setError(result.error);
        } else {
          setSuccess('Welcome to the crew! Your Rave Pass is ready.');
        }
      } else {
        const result = await login(email, password);
        if (result?.error) {
          setError(result.error);
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={`container ${styles.grid}`}>
        
        {/* Left Column: Info & Rewards Timeline */}
        <div className={styles.infoCol}>
          <div>
            <h1 className={styles.title}>{t('membership.title')}</h1>
            <p className={styles.desc}>{t('membership.subtitle')}</p>
            <br />
            <p className={styles.desc}>{t('membership.platform')}</p>
            <br />
            <p className={styles.desc}>{t('membership.instructions')}</p>
          </div>

          <div className={styles.timeline}>
            <div className={styles.timelineStep}>
              <div className={styles.timelineDot} />
              <div className={styles.timelineContent}>
                <span className={styles.stepName}>{t('membership.flow.start')}</span>
                <span className={styles.stepPoints}>0 RP</span>
              </div>
            </div>

            <div className={styles.timelineStep}>
              <div className={styles.timelineDot} />
              <div className={styles.timelineContent}>
                <span className={styles.stepName}>{t('membership.flow.free_entry')}</span>
                <span className={styles.stepPoints}>{t('membership.flow.points')}</span>
              </div>
            </div>

            <div className={styles.timelineStep}>
              <div className={styles.timelineDot} />
              <div className={styles.timelineContent}>
                <span className={styles.stepName}>{t('membership.flow.merch')}</span>
                <span className={styles.stepPoints}>{t('membership.flow.points')}</span>
              </div>
            </div>

            <div className={styles.timelineStep}>
              <div className={styles.timelineDot} />
              <div className={styles.timelineContent}>
                <span className={styles.stepName}>{t('membership.flow.repeat')}</span>
                <span className={styles.stepPoints}>∞</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Internal Registration Form or Status */}
        <div className={styles.cardCol}>
          <div className={styles.passCard}>
            
            <div className={styles.howSection}>
              <h3 className={styles.howTitle}>{t('membership.how.title')}</h3>
              <div className={styles.howList}>
                <span>{t('membership.how.door')}</span>
                <span>{t('membership.how.presale')}</span>
                <span>{t('membership.how.friend')}</span>
              </div>
            </div>

            {isLoading ? (
              <div className={styles.loading}>↻ Loading your pass...</div>
            ) : user ? (
              /* Authenticated View */
              <div className={styles.form}>
                <h2 className={styles.formTitle}>Your Rave Pass</h2>
                
                <div className={styles.statusGrid}>
                  <div className={styles.statusItem}>
                    <span className={styles.statusLabel}>Tier</span>
                    <span className={styles.statusValue}>{user.tier || 'Member'}</span>
                  </div>
                  <div className={styles.statusItem}>
                    <span className={styles.statusLabel}>Points</span>
                    <span className={styles.statusValue}>{user.points} RP</span>
                  </div>
                  <div className={styles.statusItem} style={{ gridColumn: 'span 2' }}>
                    <span className={styles.statusLabel}>Member Code</span>
                    <span className={styles.statusValue} style={{fontFamily: 'var(--font-mono)', letterSpacing: '0.1em'}}>
                      {user.memberCode || '—'}
                    </span>
                  </div>
                </div>

                <Link href="/profile" className={styles.viewProfileBtn}>
                  View My Profile
                </Link>
                
                <p className={styles.legalNote}>
                  Manage your favorites and history in your profile.
                </p>
              </div>
            ) : (
              /* Registration / Login Form */
              <form onSubmit={handleAuth} className={styles.form}>
                <h2 className={styles.formTitle}>
                  {formMode === 'register' ? 'Create your Rave Pass' : 'Welcome back'}
                </h2>

                {formMode === 'register' && (
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
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Password</label>
                  <input
                    className={styles.input}
                    type="password"
                    placeholder={formMode === 'register' ? 'Min. 6 characters' : '••••••••'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                </div>

                {formMode === 'register' && (
                  <label className={styles.checkboxField}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={marketingConsent}
                      onChange={(e) => setMarketingConsent(e.target.checked)}
                    />
                    <div className={styles.checkboxText}>
                      <span className={styles.checkboxLabel}>
                        I want to receive event announcements and updates.
                      </span>
                      <span className={styles.checkboxHelper}>
                        Optional. Unsubscribe at any time.
                      </span>
                    </div>
                  </label>
                )}

                {error && <div className={styles.error}>{error}</div>}
                {success && <div className={styles.successMessage}>{success}</div>}

                <button className={styles.submitBtn} type="submit" disabled={loading}>
                  {loading ? 'Processing...' : formMode === 'register' ? 'Create Rave Pass' : 'Sign In'}
                </button>

                <div className={styles.switchMode}>
                  {formMode === 'register' ? (
                    <>
                      Already have an account?
                      <button type="button" className={styles.switchBtn} onClick={() => setFormMode('login')}>
                        Sign In
                      </button>
                    </>
                  ) : (
                    <>
                      Don&apos;t have a pass?
                      <button type="button" className={styles.switchBtn} onClick={() => setFormMode('register')}>
                        Register
                      </button>
                    </>
                  )}
                </div>

                {formMode === 'register' && (
                  <p className={styles.legalNote}>
                    By creating an account, you agree to our{' '}
                    <Link href="/privacy-policy">Privacy Policy</Link>.
                  </p>
                )}
              </form>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
