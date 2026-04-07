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

      const response = await fetch('/api/membership/apple', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        let errorMessage = 'Failed to generate pass';
        try {
          const errorData = await response.json();
          errorMessage = errorData.details 
            ? `${errorData.error}: ${errorData.details}`
            : (errorData.error || errorMessage);
        } catch (e) {
          // Fallback if not JSON
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'singularity_membership.pkpass';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Apple Wallet download error:', err);
      alert(err.message || 'An unexpected error occurred while downloading your pass.');
    } finally {
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
