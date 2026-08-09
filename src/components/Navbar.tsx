'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n, Locale, localeLabels } from '@/i18n';
import { useAuth } from '@/context/AuthContext';
import AuthModal from './AuthModal';
import styles from './Navbar.module.css';

const navLinks = [
  { href: '/', key: 'nav.home' },
  { href: '/events', key: 'nav.events' },
  { href: '/artists', key: 'nav.artists' },
  { href: '/mixes', key: 'nav.mixes' },
  { href: '/membership', key: 'nav.membership' },
  { href: '/supporters', key: 'nav.supporters' },
];

const locales: Locale[] = ['en', 'no', 'cs', 'pl', 'de'];

export default function Navbar() {
  const { t, locale, setLocale } = useI18n();
  const { user, showAuthModal, setShowAuthModal } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <>
      <nav className={`${styles.nav} ${mobileOpen ? styles.navOpen : ''} glass`} id="navbar">
      <div className={`${styles.inner} container`}>
        <Link href="/" className={styles.logo} id="nav-logo" aria-label="Home">
          <div className={styles.logoImage} />
        </Link>

        <div className={`${styles.links} ${mobileOpen ? styles.open : ''}`}>
          {/* Mobile-only Auth button - top of drawer */}
          <div className={`${styles.authWrapper} ${styles.mobileOnly}`}>
            {user ? (
              <Link href="/profile" className={styles.userBtn} id="nav-profile-mobile" onClick={() => setMobileOpen(false)}>
                <span className={styles.userAvatar}>
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName} className={styles.avatarImg} />
                  ) : (
                    user.avatarInitial
                  )}
                </span>
                <span className={styles.userName}>{user.displayName}</span>
                {user.isAdmin && <span className={styles.adminTag}>Admin</span>}
              </Link>
            ) : (
              <button className={styles.signInBtn} onClick={() => { setShowAuthModal(true); setMobileOpen(false); }} id="nav-signin-mobile">
                Sign In / Account
              </button>
            )}
          </div>

          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.link} ${pathname === link.href ? styles.active : ''} ${styles.mobileLink}`}
              id={`nav-mobile-${link.key.split('.')[1]}`}
              onClick={() => setMobileOpen(false)}
            >
              {t(link.key)}
            </Link>
          ))}

          {user?.isAdmin && (
            <Link
              href="/admin"
              className={`${styles.link} ${pathname === '/admin' ? styles.active : ''} ${styles.mobileLink}`}
              id="nav-mobile-admin"
              onClick={() => setMobileOpen(false)}
            >
              {t('nav.admin')}
            </Link>
          )}

          {/* Mobile-only Language switcher */}
          <div className={`${styles.langWrapper} ${styles.mobileOnly}`}>
            <button
              className={styles.langBtn}
              onClick={() => setLangOpen(!langOpen)}
              id="lang-switcher-mobile"
              aria-label="Change language"
            >
              {localeLabels[locale]}
            </button>
            {langOpen && (
              <div className={styles.langDropdown}>
                {locales.map(l => (
                  <button
                    key={l}
                    className={`${styles.langOption} ${l === locale ? styles.langActive : ''}`}
                    onClick={() => {
                      setLocale(l);
                      setLangOpen(false);
                    }}
                    id={`lang-mobile-${l}`}
                  >
                    {localeLabels[l]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Desktop-only Actions - Right side (Includes Nav Links, Lang, Auth) */}
        <div className={styles.desktopActions}>
          <div className={styles.desktopNav}>
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`${styles.link} ${pathname === link.href ? styles.active : ''}`}
                id={`nav-desktop-${link.key.split('.')[1]}`}
              >
                {t(link.key)}
              </Link>
            ))}

            {user?.isAdmin && (
              <Link
                href="/admin"
                className={`${styles.link} ${pathname === '/admin' ? styles.active : ''}`}
                id="nav-desktop-admin"
              >
                {t('nav.admin')}
              </Link>
            )}
          </div>

          {/* Desktop Language switcher */}
          <div className={styles.langWrapper}>
            <button
              className={styles.langBtn}
              onClick={() => setLangOpen(!langOpen)}
              id="lang-switcher"
              aria-label="Change language"
            >
              {localeLabels[locale]}
            </button>
            {langOpen && (
              <div className={styles.langDropdown}>
                {locales.map(l => (
                  <button
                    key={l}
                    className={`${styles.langOption} ${l === locale ? styles.langActive : ''}`}
                    onClick={() => {
                      setLocale(l);
                      setLangOpen(false);
                    }}
                    id={`lang-${l}`}
                  >
                    {localeLabels[l]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.authWrapper}>
            {user ? (
              <Link href="/profile" className={styles.userBtn} id="nav-profile">
                <span className={styles.userAvatar}>
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName} className={styles.avatarImg} />
                  ) : (
                    user.avatarInitial
                  )}
                </span>
                <span className={styles.userName}>{user.displayName}</span>
              </Link>
            ) : (
              <button className={styles.signInBtn} onClick={() => setShowAuthModal(true)} id="nav-signin">
                Sign In
              </button>
            )}
          </div>
        </div>

        {/* Mobile burger */}
        <button
          className={`${styles.burger} ${mobileOpen ? styles.burgerOpen : ''}`}
          onClick={() => setMobileOpen(!mobileOpen)}
          id="nav-burger"
          aria-label="Toggle menu"
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </nav>

    {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
  </>
  );
}
