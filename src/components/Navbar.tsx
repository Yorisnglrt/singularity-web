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
  { href: '/about', key: 'nav.about' },
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
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.link} ${pathname === link.href ? styles.active : ''}`}
              id={`nav-${link.key.split('.')[1]}`}
              onClick={() => setMobileOpen(false)}
            >
              {t(link.key)}
            </Link>
          ))}

          {/* Language switcher */}
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

          {/* Auth button */}
          <div className={styles.authWrapper}>
            {user ? (
              <Link href="/profile" className={styles.userBtn} id="nav-profile" onClick={() => setMobileOpen(false)}>
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
