'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './AppleWalletButton.module.css';

export default function AppleWalletButton() {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session found. Please sign in again.');

      // Direct navigation to the GET endpoint with the token.
      // This is the most reliable way for Safari to pick up the .pkpass MIME type
      // and trigger the native Wallet 'Add' screen.
      window.location.href = `/api/membership/apple?token=${session.access_token}`;
      
      // Since window.location.href doesn't provide a callback, we reset 
      // the loading state after a short delay.
      setTimeout(() => setIsDownloading(false), 2000);
    } catch (err: any) {
      console.error('Apple Wallet download error:', err);
      alert(err.message || 'An unexpected error occurred while downloading your pass.');
      setIsDownloading(false);
    }
  };

  return (
    <div className={styles.walletActions}>
      <button 
        onClick={handleDownload}
        className={styles.walletBtn}
        disabled={isDownloading}
        title="Download Apple Wallet Pass"
      >
        <span className={styles.walletIcon}></span> 
        {isDownloading ? 'Generating Pass...' : 'Add to Apple Wallet'}
      </button>
    </div>
  );
}
