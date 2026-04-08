'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './AppleWalletButton.module.css';

export default function AppleWalletButton() {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setToken(session.access_token);
        }
      } catch (err) {
        console.error('Error fetching session:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSession();
  }, []);

  // Define the target URL
  const downloadUrl = token ? `/api/membership/apple?token=${token}` : '#';

  return (
    <div className={styles.walletActions}>
      <a 
        href={downloadUrl}
        className={`${styles.walletBtn} ${(!token || isLoading) ? styles.disabled : ''}`}
        title="Add to Apple Wallet"
        onClick={(e) => {
          if (!token) {
            e.preventDefault();
            if (!isLoading) {
              alert('Please sign in to download your membership pass.');
            }
          }
        }}
      >
        <span className={styles.walletIcon}></span> 
        {isLoading ? 'Preparing...' : 'Add to Apple Wallet'}
      </a>
    </div>
  );
}
