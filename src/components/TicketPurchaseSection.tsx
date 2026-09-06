'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Event, EventTicketType } from '@/data/events';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import styles from './TicketPurchaseSection.module.css';
import { PENDING_ORDER_TTL_MINUTES } from '@/app/api/checkout/create-pending-order/route';

interface Props {
  event: Event;
  ticketTypes: EventTicketType[];
}

interface AlertModalState {
  type: 'confirm' | 'error';
  title: string;
  message: string;
  onConfirm?: () => void;
}

const GUEST_ORDER_KEY = (eventId: string) => `pending_order_${eventId}`;

function parseUtcDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  let sanitized = dateStr;
  if (!/[Zz]|[+-]\d{2}(:\d{2})?$/.test(sanitized)) {
    sanitized += 'Z';
  }
  return new Date(sanitized);
}

export default function TicketPurchaseSection({ event, ticketTypes }: Props) {
  const { t } = useI18n();
  const [nowTime, setNowTime] = useState(Date.now());

  const isTicketTypeAvailable = (tt: EventTicketType) => {
    const saleEnd = parseUtcDate(tt.saleEndsAt);
    const isDeadlinePassed = saleEnd ? saleEnd.getTime() < nowTime : false;
    const isSoldOut = (tt.totalQuantity !== null && tt.soldQuantity >= tt.totalQuantity) || isDeadlinePassed;
    return tt.isActive && !isSoldOut;
  };

  const availableTypes = ticketTypes.filter(isTicketTypeAvailable);
  const defaultSelected = availableTypes.length > 0
    ? [...availableTypes].sort((a, b) => a.priceNok - b.priceNok)[0]
    : null;

  const [selectedType, setSelectedType] = useState<EventTicketType | null>(defaultSelected);
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<any>(null);
  const { user, isLoading: authLoading } = useAuth();
  const isLoggedIn = !!user;
  const [paymentMethod, setPaymentMethod] = useState<'WALLET' | 'CARD'>('WALLET');
  const [pendingOrder, setPendingOrder] = useState<any>(null);
  const [checkingPending, setCheckingPending] = useState(false);
  const [freeTicketsCount, setFreeTicketsCount] = useState(0);
  const [useFreeTicket, setUseFreeTicket] = useState(false);

  // ── P4: email emphasis state (replaces the old confirm modal) ──────
  const [emailHighlight, setEmailHighlight] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // ── P3: alert/confirm modal (replaces native confirm/alert) ────────
  const [alertModal, setAlertModal] = useState<AlertModalState | null>(null);

  const showAlert = useCallback((title: string, message: string) => {
    setAlertModal({ type: 'error', title, message });
  }, []);

  const showConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
    setAlertModal({ type: 'confirm', title, message, onConfirm });
  }, []);

  const closeAlertModal = useCallback(() => {
    setAlertModal(null);
  }, []);

  // Keyboard: close alert modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && alertModal) closeAlertModal();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [alertModal, closeAlertModal]);

  // ── P1 Gap 2: check sessionStorage for guest pending order ────────
  const checkGuestPendingOrder = useCallback(async () => {
    try {
      const raw = sessionStorage.getItem(GUEST_ORDER_KEY(event.id));
      if (!raw) return;
      const { orderReference, claimToken } = JSON.parse(raw);
      const res = await fetch(
        `/api/checkout/pending-status?eventId=${event.id}&orderReference=${encodeURIComponent(orderReference)}&claimToken=${encodeURIComponent(claimToken)}`
      );
      const data = await res.json();
      if (data.hasPending) {
        setPendingOrder({ ...data.order, claimToken });
      } else {
        sessionStorage.removeItem(GUEST_ORDER_KEY(event.id));
        setPendingOrder(null);
      }
    } catch {
      // sessionStorage not available or parse error — ignore
    }
  }, [event.id]);

  const checkPendingOrder = useCallback(async () => {
    if (!user) return;
    setCheckingPending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/checkout/pending-status?eventId=${event.id}`, {
        headers: {
          ...(session ? { 'Authorization': `Bearer ${session.access_token}` } : {})
        }
      });
      const data = await res.json();
      if (data.hasPending) {
        setPendingOrder(data.order);
      } else {
        setPendingOrder(null);
      }
    } catch (err) {
      console.error('Failed to check pending order:', err);
    } finally {
      setCheckingPending(false);
    }
  }, [user, event.id]);

  const fetchFreeTicketsCount = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('reward_claims')
        .select('id')
        .eq('profile_id', user.id)
        .eq('reward_type', 'free_ticket')
        .eq('status', 'available');
      if (!error) setFreeTicketsCount(data?.length || 0);
    } catch (err) {
      console.error('Failed to fetch free tickets count:', err);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      if (user.email) setEmail(user.email);
      if (user.displayName) setName(user.displayName);
      checkPendingOrder();
      fetchFreeTicketsCount();
    } else {
      setFreeTicketsCount(0);
      setUseFreeTicket(false);
      // Guest: check sessionStorage for a pending order on this event
      checkGuestPendingOrder();
    }
  }, [user]);

  // Ensure selected type is always valid/available
  useEffect(() => {
    if (selectedType && !isTicketTypeAvailable(selectedType)) {
      setSelectedType(defaultSelected);
    } else if (!selectedType && defaultSelected) {
      setSelectedType(defaultSelected);
    }
  }, [ticketTypes, defaultSelected, nowTime]);

  // Recalculate states based on start/end timers
  useEffect(() => {
    const hasFutureSales = ticketTypes.some(tt => {
      const start = parseUtcDate(tt.saleStartsAt);
      return start && start.getTime() > Date.now();
    });
    const hasFutureEnds = ticketTypes.some(tt => {
      const end = parseUtcDate(tt.saleEndsAt);
      return end && end.getTime() > Date.now();
    });

    if (!hasFutureSales && !hasFutureEnds) return;

    const interval = setInterval(() => {
      const current = Date.now();
      setNowTime(current);

      const stillFutureSales = ticketTypes.some(tt => {
        const start = parseUtcDate(tt.saleStartsAt);
        return start && start.getTime() > current;
      });
      const stillFutureEnds = ticketTypes.some(tt => {
        const end = parseUtcDate(tt.saleEndsAt);
        return end && end.getTime() > current;
      });

      if (!stillFutureSales && !stillFutureEnds) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [ticketTypes]);

  // Clear sale-start error when sales open
  useEffect(() => {
    if (selectedType && selectedType.saleStartsAt) {
      const start = parseUtcDate(selectedType.saleStartsAt);
      if (start && nowTime >= start.getTime() && error && error.includes('Ticket sales have not started yet')) {
        setError(null);
      }
    }
  }, [nowTime, selectedType, error]);

  // ── Cancel order ──────────────────────────────────────────────────
  const doCancel = useCallback(async () => {
    if (!pendingOrder) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/checkout/cancel-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { 'Authorization': `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          orderReference: pendingOrder.orderReference,
          ...(pendingOrder.claimToken ? { claimToken: pendingOrder.claimToken } : {})
        })
      });

      if (res.ok) {
        setPendingOrder(null);
        try { sessionStorage.removeItem(GUEST_ORDER_KEY(event.id)); } catch {}
      } else {
        const data = await res.json();
        showAlert(t('tickets.cancelOrder'), data.error || t('tickets.cancelOrderError'));
        // Refresh in case status changed server-side
        user ? checkPendingOrder() : checkGuestPendingOrder();
      }
    } catch {
      showAlert(t('tickets.cancelOrder'), t('tickets.unexpectedError'));
    } finally {
      setLoading(false);
    }
  }, [pendingOrder, user, event.id, t, showAlert, checkPendingOrder, checkGuestPendingOrder]);

  const handleCancelOrder = useCallback(() => {
    showConfirm(
      t('tickets.cancelOrder'),
      t('tickets.cancelOrderConfirm'),
      doCancel
    );
  }, [showConfirm, t, doCancel]);

  const handleContinuePayment = useCallback(async () => {
    if (!pendingOrder) return;
    setLoading(true);

    if (pendingOrder.paymentUrl) {
      window.location.href = pendingOrder.paymentUrl;
      return;
    }

    try {
      const vippsRes = await fetch('/api/payments/vipps/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderReference: pendingOrder.orderReference })
      });

      const vippsData = await vippsRes.json();
      if (vippsRes.ok && vippsData.redirectUrl) {
        window.location.href = vippsData.redirectUrl;
      } else {
        showAlert(t('tickets.continuePayment'), t('tickets.paymentUrlMissing'));
      }
    } catch {
      showAlert(t('tickets.continuePayment'), t('tickets.unexpectedError'));
    } finally {
      setLoading(false);
    }
  }, [pendingOrder, t, showAlert]);

  const handleIncrement = () => {
    if (!selectedType) return;
    const max = selectedType.totalQuantity
      ? Math.min(10, selectedType.totalQuantity - selectedType.soldQuantity)
      : 10;
    if (quantity < max) setQuantity(q => q + 1);
  };

  const handleDecrement = () => {
    if (quantity > 1) setQuantity(q => q - 1);
  };

  // ── P4: email emphasis helper ──────────────────────────────────────
  const emphasizeEmail = useCallback(() => {
    setEmailHighlight(true);
    emailInputRef.current?.focus();
    setTimeout(() => setEmailHighlight(false), 1600);
  }, []);

  const executeFreeTicketCheckout = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('You must be logged in to claim a free ticket reward.');

      const res = await fetch('/api/checkout/use-free-ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          eventId: event.id,
          ticketTypeId: selectedType?.id,
          customerEmail: email,
          customerName: name,
          customerPhone: phone
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process free ticket purchase');

      if (data.ok && data.orderId) {
        setSuccess({ isFreeTicket: true, orderId: data.orderId });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [event.id, selectedType, email, name, phone]);

  const executePaidCheckout = useCallback(async (method: 'WALLET' | 'CARD') => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const orderRes = await fetch('/api/checkout/create-pending-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { 'Authorization': `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          eventId: event.id,
          ticketTypeId: selectedType?.id,
          quantity,
          customerEmail: email,
          customerName: name,
          customerPhone: phone,
          paymentMethodType: method
        })
      });

      const orderData = await orderRes.json();

      if (!orderRes.ok) {
        throw new Error(orderData.error || 'Failed to create order');
      }

      // P1 Gap 2: persist claimToken for guest recovery
      if (!session && orderData.claimToken) {
        try {
          sessionStorage.setItem(GUEST_ORDER_KEY(event.id), JSON.stringify({
            orderReference: orderData.orderReference,
            claimToken: orderData.claimToken,
            eventId: event.id,
          }));
        } catch {}
      }

      setSuccess({ redirecting: true, orderReference: orderData.orderReference });

      const vippsRes = await fetch('/api/payments/vipps/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderReference: orderData.orderReference })
      });

      const vippsData = await vippsRes.json();

      if (!vippsRes.ok) throw new Error(vippsData.error || 'Failed to start Vipps payment');

      if (vippsData.redirectUrl) {
        window.location.href = vippsData.redirectUrl;
        return;
      } else {
        throw new Error('No redirect URL received from Vipps');
      }
    } catch (err: any) {
      setError(err.message);
      setSuccess(null);
    } finally {
      setLoading(false);
    }
  }, [event.id, selectedType, quantity, email, name, phone]);

  // ── Validation + submit ───────────────────────────────────────────
  const validate = (): boolean => {
    if (!selectedType || !isTicketTypeAvailable(selectedType)) {
      setError('Please select an available ticket type');
      return false;
    }
    const start = parseUtcDate(selectedType.saleStartsAt);
    if (start && Date.now() < start.getTime()) {
      setError('Ticket sales have not started yet');
      return false;
    }
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      emphasizeEmail();
      return false;
    }
    if (selectedType.isSupporter && (!name || name.trim().length < 2)) {
      setError('A name is required for Supporter tickets.');
      return false;
    }
    if (!agree) {
      setError('You must agree to the Terms of Sale');
      return false;
    }
    return true;
  };

  const handleFreeTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setError(null);
    // P4: emphasize email field inline, then proceed directly
    emphasizeEmail();
    setTimeout(() => executeFreeTicketCheckout(), 200);
  };

  const handleSubmit = async (e?: React.FormEvent, methodOverride?: 'WALLET' | 'CARD') => {
    if (e) e.preventDefault();
    const method = methodOverride || paymentMethod;
    if (!validate()) return;
    setError(null);
    // P4: emphasize email field inline, then proceed directly
    emphasizeEmail();
    setTimeout(() => executePaidCheckout(method), 200);
  };

  // ── Success states ────────────────────────────────────────────────
  if (success) {
    if (success.isFreeTicket) {
      return (
        <div className={styles.success}>
          <h3 className={styles.successTitle}>Billetten din er klar! ⚡</h3>
          <p className={styles.successText}>
            Gratulerer! Billetten din har blitt utstedt og sendt til <strong>{email}</strong>.
          </p>
          <div className={styles.orderRef}>Bestillings-ID: {success.orderId}</div>
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <a href="/profile" className="btn btn-primary" style={{ padding: '0.625rem 1.25rem', textDecoration: 'none' }}>Gå til profil</a>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.success}>
        <h3 className={styles.successTitle}>Redirecting to Vipps…</h3>
        <p className={styles.successText}>
          Your order has been created. You are being redirected to Vipps to complete payment.
        </p>
        <div className={styles.orderRef}>{success.orderReference}</div>
      </div>
    );
  }

  // ── Pending order recovery (both auth users and guests) ──────────
  if (pendingOrder) {
    const createdAt = pendingOrder.createdAt ? new Date(pendingOrder.createdAt).getTime() : null;
    const expiresInMin = createdAt
      ? Math.max(0, Math.round((PENDING_ORDER_TTL_MINUTES * 60 * 1000 - (Date.now() - createdAt)) / 60000))
      : null;

    return (
      <div className={styles.container}>
        <div className={styles.recoveryBox}>
          <h2 className={styles.recoveryTitle}>{t('tickets.pendingOrderTitle')}</h2>
          <div className={styles.recoveryDetails}>
            <div className={styles.recoveryItem}>
              <span className={styles.recoveryLabel}>{t('tickets.ticketType')}</span>
              <span className={styles.recoveryValue}>{pendingOrder.ticketTypeName}</span>
            </div>
            <div className={styles.recoveryItem}>
              <span className={styles.recoveryLabel}>{t('tickets.quantity')}</span>
              <span className={styles.recoveryValue}>{pendingOrder.quantity} stk</span>
            </div>
            <div className={styles.recoveryItem}>
              <span className={styles.recoveryLabel}>{t('tickets.totalPrice')}</span>
              <span className={styles.recoveryValue}>{pendingOrder.totalAmountNok} NOK</span>
            </div>
            {expiresInMin !== null && (
              <div className={styles.recoveryItem}>
                <span className={styles.recoveryLabel}>{t('tickets.expiresIn')}</span>
                <span className={styles.recoveryValue}>{expiresInMin} {t('tickets.minutes')}</span>
              </div>
            )}
          </div>
          <div className={styles.recoveryActions}>
            <button
              className={`${styles.paymentBtn} btn btn-primary`}
              onClick={handleContinuePayment}
              disabled={loading}
            >
              {loading ? t('tickets.loading') : t('tickets.continuePayment')}
            </button>
            <button
              className={styles.cancelBtn}
              onClick={handleCancelOrder}
              disabled={loading}
            >
              {loading ? '...' : t('tickets.cancelOrder')}
            </button>
          </div>
          <p className={styles.recoveryHint}>{t('tickets.pendingOrderHint')}</p>
        </div>

        {/* P3: Alert/Confirm modal */}
        {alertModal && (
          <div className={styles.modalOverlay} onClick={closeAlertModal}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
              <button type="button" className={styles.modalClose} onClick={closeAlertModal} aria-label="Close">✕</button>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>{alertModal.title}</h3>
              </div>
              <div className={styles.modalBody}>
                <p>{alertModal.message}</p>
              </div>
              <div className={styles.modalActions}>
                {alertModal.type === 'confirm' ? (
                  <>
                    <button type="button" className={styles.modalSecondaryBtn} onClick={closeAlertModal} disabled={loading}>
                      Avbryt
                    </button>
                    <button type="button" className={styles.modalPrimaryBtn} onClick={() => { closeAlertModal(); alertModal.onConfirm?.(); }} disabled={loading}>
                      {loading ? t('tickets.loading') : 'Bekreft'}
                    </button>
                  </>
                ) : (
                  <button type="button" className={styles.modalPrimaryBtn} onClick={closeAlertModal}>
                    OK
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const handleUseFreeTicketChange = (checked: boolean) => {
    setUseFreeTicket(checked);
    if (checked) setQuantity(1);
  };

  const salesStart = selectedType ? parseUtcDate(selectedType.saleStartsAt) : null;
  const salesNotStarted = salesStart ? nowTime < salesStart.getTime() : false;
  const salesStartError = salesNotStarted && salesStart
    ? `Ticket sales have not started yet. Sales open at ${salesStart.toLocaleString('en-GB', {
        timeZone: 'Europe/Oslo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).replace(',', '')}`
    : null;
  const displayError = error || salesStartError;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Get Tickets</h2>
        <div className={styles.ticketList}>
          {ticketTypes.map(tt => {
            const isAvailable = isTicketTypeAvailable(tt);
            const isSelected = selectedType?.id === tt.id;

            return (
              <div
                key={tt.id}
                className={`${styles.ticketItem} ${isSelected ? styles.ticketItemSelected : ''} ${!isAvailable ? styles.soldOut : ''}`}
                onClick={() => isAvailable && setSelectedType(tt)}
              >
                <div className={styles.ticketInfo}>
                  <span className={styles.ticketName}>
                    {tt.name}
                    {tt.isSupporter && !tt.name.toLowerCase().includes('supporter') && ' Supporter'}
                  </span>
                  <div className={styles.ticketStatus}>
                    {isAvailable ? 'AVAILABLE' : 'SOLD OUT'}
                  </div>
                </div>
                <div className={styles.ticketPrice}>
                  {tt.priceNok} NOK / +{tt.isSupporter ? 200 : 150} RP
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <form className={styles.checkoutGrid} onSubmit={e => e.preventDefault()}>
        <div className={styles.checkoutDetails}>
          <div className={styles.field}>
            <div className={styles.quantityRow}>
              <label className={styles.label}>Quantity</label>
              <div className={styles.quantitySelector}>
                <button type="button" className={styles.qtyBtn} onClick={handleDecrement} disabled={quantity <= 1 || useFreeTicket}>−</button>
                <span className={styles.qtyValue}>{quantity}</span>
                <button type="button" className={styles.qtyBtn} onClick={handleIncrement} disabled={useFreeTicket || !selectedType || (selectedType.totalQuantity !== null && quantity >= (selectedType.totalQuantity - selectedType.soldQuantity))}>+</button>
              </div>
            </div>
          </div>

          {isLoggedIn && freeTicketsCount > 0 && (
            <div className={styles.field} style={{ marginTop: '0.25rem', marginBottom: '1.25rem' }}>
              <label className={styles.checkboxContainer} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={useFreeTicket}
                  onChange={e => handleUseFreeTicketChange(e.target.checked)}
                />
                <span className={styles.checkboxLabel} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent-primary)', fontWeight: 'bold' }}>
                  Use available Free Ticket Reward ({freeTicketsCount} claim{freeTicketsCount > 1 ? 's' : ''} available)
                </span>
              </label>
            </div>
          )}

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Your Name {selectedType?.isSupporter && '*'}</label>
              <input
                className={styles.input}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={selectedType?.isSupporter ? "First name (required for supporters)" : "First name (optional)"}
                required={selectedType?.isSupporter}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Email Address *</label>
              {/* P4: inline email emphasis with animation class */}
              <input
                ref={emailInputRef}
                className={`${styles.input} ${emailHighlight ? styles.emailHighlight : ''}`}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
              />
              <p className={styles.emailHint}>
                We'll send your ticket and QR code here — double-check this address.
              </p>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Phone Number</label>
            <input
              className={styles.input}
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+47 000 00 000 (optional)"
            />
          </div>

          {!isLoggedIn && !authLoading && (
            <div className={styles.guestRpInfo}>
              <strong className={styles.guestRpTitle}>Want to collect Rave Points?</strong>
              <p className={styles.guestRpBody}>
                Create an account with the same email after checkout to collect <strong>+{quantity * (selectedType?.isSupporter ? 200 : 150)} RP</strong> from this purchase.
              </p>
              <a href="/membership" className={styles.guestRpLink}>Create account</a>
            </div>
          )}

          {displayError && <div className={styles.error}>{displayError}</div>}
        </div>

        <div className={styles.checkoutSummary}>
          <div className={styles.summaryCard}>
            <h3 className={styles.summaryTitle}>Order Summary</h3>
            <div className={styles.summaryContent}>
              <div className={styles.summaryItem}>
                <div className={styles.summaryItemName}>
                  {selectedType?.name}
                  {selectedType?.isSupporter && !selectedType?.name.toLowerCase().includes('supporter') && ' Supporter'}
                </div>
                <div className={styles.summaryItemDetails}>
                  <span>x {quantity}</span>
                  <span className={styles.summaryItemDot}>·</span>
                  <span>{useFreeTicket ? 0 : (selectedType?.priceNok || 0)} NOK</span>
                </div>
              </div>
              <div className={`${styles.summaryRow} ${styles.totalRow}`}>
                <span>Total</span>
                <span className={styles.totalPrice}>{useFreeTicket ? 0 : ((selectedType?.priceNok || 0) * quantity)} NOK</span>
              </div>
            </div>

            <div className={styles.rpBadge}>
              <span className={styles.rpIcon}>⚡</span>
              <span>
                {useFreeTicket ? (
                  <>Earn <strong>+0 RP</strong> (Free Ticket Reward applied)</>
                ) : isLoggedIn ? (
                  <>Earn <strong>+{quantity * (selectedType?.isSupporter ? 200 : 150)} RP</strong> after payment</>
                ) : (
                  <>Create an account after checkout to collect <strong>+{quantity * (selectedType?.isSupporter ? 200 : 150)} RP</strong></>
                )}
              </span>
            </div>

            <label className={styles.checkboxContainer}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={agree}
                onChange={e => setAgree(e.target.checked)}
              />
              <span className={styles.checkboxLabel}>
                I agree to the <a href="/terms-of-sale" target="_blank" rel="noopener noreferrer">Terms of Sale</a>
              </span>
            </label>

            {useFreeTicket ? (
              <button
                type="button"
                className={styles.paymentBtn}
                style={{ width: '100%', background: 'var(--color-accent-primary)', color: '#000', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                onClick={handleFreeTicketSubmit}
                disabled={loading || !selectedType || !isTicketTypeAvailable(selectedType) || !agree || salesNotStarted}
              >
                {loading ? 'Processing...' : 'Confirm Free Ticket Claim'}
              </button>
            ) : (
              <div className={styles.paymentActions}>
                <button
                  type="button"
                  className={`${styles.paymentBtn} ${styles.vippsBtn}`}
                  onClick={() => { setPaymentMethod('WALLET'); handleSubmit(undefined, 'WALLET'); }}
                  disabled={loading || !selectedType || !isTicketTypeAvailable(selectedType) || !agree || salesNotStarted}
                >
                  {loading && paymentMethod === 'WALLET' ? '...' : 'VIPPS'}
                </button>
                <button
                  type="button"
                  className={`${styles.paymentBtn} ${styles.cardBtn}`}
                  onClick={() => { setPaymentMethod('CARD'); handleSubmit(undefined, 'CARD'); }}
                  disabled={loading || !selectedType || !isTicketTypeAvailable(selectedType) || !agree || salesNotStarted}
                >
                  {loading && paymentMethod === 'CARD' ? '...' : 'Card'}
                </button>
              </div>
            )}
          </div>
        </div>
      </form>

      {/* P3: Alert/Confirm modal */}
      {alertModal && (
        <div className={styles.modalOverlay} onClick={closeAlertModal}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <button type="button" className={styles.modalClose} onClick={closeAlertModal} aria-label="Close modal">✕</button>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>{alertModal.title}</h3>
            </div>
            <div className={styles.modalBody}>
              <p>{alertModal.message}</p>
            </div>
            <div className={styles.modalActions}>
              {alertModal.type === 'confirm' ? (
                <>
                  <button type="button" className={styles.modalSecondaryBtn} onClick={closeAlertModal} disabled={loading}>
                    Avbryt
                  </button>
                  <button
                    type="button"
                    className={styles.modalPrimaryBtn}
                    onClick={() => { closeAlertModal(); alertModal.onConfirm?.(); }}
                    disabled={loading}
                  >
                    {loading ? t('tickets.loading') : 'Bekreft'}
                  </button>
                </>
              ) : (
                <button type="button" className={styles.modalPrimaryBtn} onClick={closeAlertModal}>
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
