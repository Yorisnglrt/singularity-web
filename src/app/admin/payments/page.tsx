'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import RateSelectButton from '@/components/RateSelectButton';
import SelectedPaymentItemRow from '@/components/SelectedPaymentItemRow';
import PaymentSummaryCard from '@/components/PaymentSummaryCard';
import PaymentQrCard from '@/components/PaymentQrCard';
import styles from './page.module.css';

/* ── Types ─────────────────────────────────────────────── */

interface PaymentRate {
  id: string;
  label: string;
  amount: number;
  currency: string;
}

interface SelectedItem {
  rateId: string;
  label: string;
  unitAmount: number;
  currency: string;
  quantity: number;
}

interface GeneratedSession {
  sessionCode: string;
  totalAmount: number;
  currency: string;
}

interface LinkedMember {
  id: string;
  displayName: string;
  memberCode: string;
  avatarUrl: string | null;
}

/* ── Inner component (uses useSearchParams) ─────────── */

function PaymentGeneratorInner() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Rates from DB
  const [rates, setRates] = useState<PaymentRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(true);

  // Cart state (local)
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSession, setGeneratedSession] = useState<GeneratedSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Linked member (fetched from DB by ID)
  const [linkedMember, setLinkedMember] = useState<LinkedMember | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);

  /* ── Redirect non-admin ──────────────────────────── */
  useEffect(() => {
    if (!isLoading && (!user || !user.isAdmin)) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  /* ── Fetch linked member from DB by ID ───────────── */
  useEffect(() => {
    const memberId = searchParams.get('memberId');
    if (!memberId || !user?.isAdmin) return;

    const fetchMember = async () => {
      setMemberLoading(true);
      try {
        const { data, error: fetchErr } = await supabase
          .from('profiles')
          .select('id, display_name, member_code, avatar_url')
          .eq('id', memberId)
          .single();

        if (fetchErr || !data) {
          console.error('Failed to fetch linked member:', fetchErr);
          // Don't block the flow — just proceed without member
        } else {
          setLinkedMember({
            id: data.id,
            displayName: data.display_name || 'Unknown',
            memberCode: data.member_code || '—',
            avatarUrl: data.avatar_url,
          });
        }
      } catch {
        console.error('Unexpected error fetching member');
      } finally {
        setMemberLoading(false);
      }
    };

    fetchMember();
  }, [searchParams, user?.isAdmin]);

  /* ── Fetch active payment rates ──────────────────── */
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from('payment_rates')
          .select('id, label, amount, currency')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (fetchErr) {
          console.error('Error fetching payment rates:', fetchErr);
          setError('Failed to load payment rates.');
        } else {
          setRates(data || []);
        }
      } catch {
        setError('An unexpected error occurred loading rates.');
      } finally {
        setRatesLoading(false);
      }
    };

    if (user?.isAdmin) {
      fetchRates();
    }
  }, [user?.isAdmin]);

  /* ── Cart operations ─────────────────────────────── */

  const handleAddRate = useCallback((rate: PaymentRate) => {
    setSelectedItems(prev => {
      const existing = prev.find(item => item.rateId === rate.id);
      if (existing) {
        return prev.map(item =>
          item.rateId === rate.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        rateId: rate.id,
        label: rate.label,
        unitAmount: rate.amount,
        currency: rate.currency,
        quantity: 1,
      }];
    });
  }, []);

  const handleIncrement = useCallback((rateId: string) => {
    setSelectedItems(prev =>
      prev.map(item =>
        item.rateId === rateId
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  }, []);

  const handleDecrement = useCallback((rateId: string) => {
    setSelectedItems(prev => {
      const item = prev.find(i => i.rateId === rateId);
      if (!item) return prev;
      if (item.quantity <= 1) {
        return prev.filter(i => i.rateId !== rateId);
      }
      return prev.map(i =>
        i.rateId === rateId
          ? { ...i, quantity: i.quantity - 1 }
          : i
      );
    });
  }, []);

  const handleRemove = useCallback((rateId: string) => {
    setSelectedItems(prev => prev.filter(i => i.rateId !== rateId));
  }, []);

  const handleClearSession = useCallback(() => {
    setSelectedItems([]);
    setGeneratedSession(null);
    setError(null);
  }, []);

  const handleClearMember = useCallback(() => {
    setLinkedMember(null);
    window.history.replaceState({}, '', '/admin/payments');
  }, []);

  /* ── Computed total ──────────────────────────────── */
  const total = selectedItems.reduce(
    (sum, item) => sum + item.unitAmount * item.quantity,
    0
  );
  const currency = selectedItems.length > 0 ? selectedItems[0].currency : 'NOK';
  const itemCount = selectedItems.reduce((sum, item) => sum + item.quantity, 0);

  /* ── Generate Payment Session (atomic RPC) ───────── */

  const handleGenerate = useCallback(async () => {
    if (selectedItems.length === 0 || !user) return;

    setIsGenerating(true);
    setError(null);

    try {
      // Build JSONB items array for the RPC
      const itemsPayload = selectedItems.map(item => ({
        rate_id: item.rateId,
        label: item.label,
        unit_amount: item.unitAmount,
        quantity: item.quantity,
      }));

      // Single atomic RPC call: creates session + items in one transaction
      const { data, error: rpcErr } = await supabase.rpc('create_payment_session', {
        p_currency: currency,
        p_created_by: user.id,
        p_member_profile_id: linkedMember?.id || null,
        p_items: itemsPayload,
      });

      if (rpcErr) {
        setError(`Failed to create payment session: ${rpcErr.message}`);
        setIsGenerating(false);
        return;
      }

      // RPC returns an array with one row
      const result = Array.isArray(data) ? data[0] : data;

      if (!result || !result.session_code) {
        setError('Payment session created but no session code returned.');
        setIsGenerating(false);
        return;
      }

      setGeneratedSession({
        sessionCode: result.session_code,
        totalAmount: Number(result.total_amount),
        currency,
      });
    } catch (err: any) {
      setError(`Unexpected error: ${err?.message || 'Unknown'}`);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedItems, user, linkedMember, currency]);

  /* ── New session (after generation) ──────────────── */
  const handleNewSession = useCallback(() => {
    setSelectedItems([]);
    setGeneratedSession(null);
    setError(null);
  }, []);

  /* ── Guards ──────────────────────────────────────── */

  if (isLoading) return null;
  if (!user || !user.isAdmin) {
    return (
      <div className={styles.page}>
        <div className={`container ${styles.authGate}`}>
          <span className={styles.authIcon}>◈</span>
          <h1>Admin Access Required</h1>
          <p>You must be an admin to use the payment generator.</p>
        </div>
      </div>
    );
  }

  /* ── Render ──────────────────────────────────────── */

  return (
    <div className={styles.page}>
      <div className="container">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>Payment Generator</h1>
            <p className={styles.subtitle}>Create payment sessions with selectable rates</p>
          </div>
          {(selectedItems.length > 0 || generatedSession) && (
            <button
              className={styles.clearBtn}
              onClick={handleClearSession}
              id="payment-clear-btn"
            >
              ✕ Clear Session
            </button>
          )}
        </div>

        {/* Linked member strip */}
        {memberLoading && (
          <div className={styles.memberStrip}>
            <div className={styles.memberStripInfo}>
              <span className={styles.memberStripName} style={{ color: 'var(--color-text-muted)' }}>Loading member...</span>
            </div>
          </div>
        )}
        {linkedMember && !memberLoading && (
          <div className={styles.memberStrip} id="payment-member-strip">
            <div className={styles.memberStripAvatar}>
              {linkedMember.avatarUrl ? (
                <img src={linkedMember.avatarUrl} alt={linkedMember.displayName} />
              ) : (
                linkedMember.displayName[0]?.toUpperCase() || '?'
              )}
            </div>
            <div className={styles.memberStripInfo}>
              <span className={styles.memberStripName}>{linkedMember.displayName}</span>
              <span className={styles.memberStripCode}>{linkedMember.memberCode}</span>
            </div>
            <button
              className={styles.memberStripRemove}
              onClick={handleClearMember}
              aria-label="Remove linked member"
            >
              ×
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className={styles.errorToast} id="payment-error">{error}</div>
        )}

        {/* Main layout (2-col on desktop) */}
        <div className={styles.layout}>
          {/* Left column: rates + items */}
          <div className={styles.leftCol}>
            {/* Rate selection */}
            {!generatedSession && (
              <div>
                <div className={styles.sectionLabel}>Available Rates</div>
                {ratesLoading ? (
                  <div className={styles.ratesLoading}>Loading rates...</div>
                ) : rates.length === 0 ? (
                  <div className={styles.ratesEmpty}>No active rates configured</div>
                ) : (
                  <div className={styles.ratesGrid}>
                    {rates.map(rate => (
                      <RateSelectButton
                        key={rate.id}
                        label={rate.label}
                        amount={rate.amount}
                        currency={rate.currency}
                        onSelect={() => handleAddRate(rate)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Selected items */}
            {!generatedSession && (
              <div>
                <div className={styles.sectionLabel}>
                  Selected Items {itemCount > 0 && `(${itemCount})`}
                </div>
                {selectedItems.length === 0 ? (
                  <div className={styles.emptyItems}>
                    Tap a rate above to add items
                  </div>
                ) : (
                  <div className={styles.itemsList}>
                    {selectedItems.map(item => (
                      <SelectedPaymentItemRow
                        key={item.rateId}
                        label={item.label}
                        unitAmount={item.unitAmount}
                        quantity={item.quantity}
                        currency={item.currency}
                        onIncrement={() => handleIncrement(item.rateId)}
                        onDecrement={() => handleDecrement(item.rateId)}
                        onRemove={() => handleRemove(item.rateId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right column: summary + generated QR */}
          <div className={styles.rightCol}>
            {/* Summary card (visible when not yet generated) */}
            {!generatedSession && (
              <PaymentSummaryCard
                total={total}
                currency={currency}
                itemCount={itemCount}
                isGenerating={isGenerating}
                onGenerate={handleGenerate}
              />
            )}

            {/* Generated payment QR */}
            {generatedSession && (
              <div className={styles.generatedSection}>
                <div className={styles.generatedLabel}>Payment Session Created</div>
                <PaymentQrCard
                  sessionCode={generatedSession.sessionCode}
                  totalAmount={generatedSession.totalAmount}
                  currency={generatedSession.currency}
                  onNewSession={handleNewSession}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Page wrapper with Suspense (Next.js requires this for useSearchParams) ─ */

export default function PaymentGeneratorPage() {
  return (
    <Suspense fallback={null}>
      <PaymentGeneratorInner />
    </Suspense>
  );
}
