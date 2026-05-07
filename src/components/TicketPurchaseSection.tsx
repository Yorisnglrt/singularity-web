'use client';

import { useState, useEffect } from 'react';
import { Event, EventTicketType } from '@/data/events';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import styles from './TicketPurchaseSection.module.css';

interface Props {
  event: Event;
  ticketTypes: EventTicketType[];
}

export default function TicketPurchaseSection({ event, ticketTypes }: Props) {
  const [selectedType, setSelectedType] = useState<EventTicketType | null>(ticketTypes[0] || null);
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

  useEffect(() => {
    if (user) {
      if (user.email) setEmail(user.email);
      if (user.displayName) setName(user.displayName);
      checkPendingOrder();
    }
  }, [user]);

  const checkPendingOrder = async () => {
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
  };

  const handleCancelOrder = async () => {
    if (!pendingOrder || !user) return;
    if (!confirm('Er du sikker på at du vil avbryte denne bestillingen?')) return;
    
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/checkout/cancel-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { 'Authorization': `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({ orderReference: pendingOrder.orderReference })
      });
      
      if (res.ok) {
        setPendingOrder(null);
      } else {
        const data = await res.json();
        alert(data.error || 'Kunne ikke avbryte bestillingen');
        // Refresh status if something changed server-side
        checkPendingOrder();
      }
    } catch (err) {
      console.error('Cancel error:', err);
      alert('En uventet feil oppstod');
    } finally {
      setLoading(false);
    }
  };

  const handleContinuePayment = async () => {
    if (!pendingOrder) return;
    setLoading(true);
    
    // 1. Primárně použít uloženou URL z pending-status
    if (pendingOrder.paymentUrl) {
      window.location.href = pendingOrder.paymentUrl;
      return;
    }

    // 2. Fallback: Zkusit zavolat create endpoint pro získání URL (pro starší objednávky)
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
        // Zobrazíme norskou chybu pokud URL chybí
        alert('Betalingslenken mangler. Avbryt bestillingen og start på nytt.');
      }
    } catch (err: any) {
      alert('En uventet feil oppstod. Prøv igjen senere.');
    } finally {
      setLoading(false);
    }
  };

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

  const handleSubmit = async (e?: React.FormEvent, methodOverride?: 'WALLET' | 'CARD') => {
    if (e) e.preventDefault();
    const method = methodOverride || paymentMethod;
    
    if (!selectedType) return;
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    if (selectedType.isSupporter && (!name || name.trim().length < 2)) {
      setError('A name is required for Supporter tickets to be listed on our /supporters page.');
      return;
    }
    if (!agree) {
      setError('You must agree to the Terms of Sale');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Step 1: Create pending order in ticket_orders
      const orderRes = await fetch('/api/checkout/create-pending-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { 'Authorization': `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          eventId: event.id,
          ticketTypeId: selectedType.id,
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

      // Step 2: Initiate Vipps payment
      setSuccess({ redirecting: true, orderReference: orderData.orderReference });

      const vippsRes = await fetch('/api/payments/vipps/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderReference: orderData.orderReference })
      });

      const vippsData = await vippsRes.json();

      if (!vippsRes.ok) {
        throw new Error(vippsData.error || 'Failed to start Vipps payment');
      }

      if (vippsData.redirectUrl) {
        // Step 3: Redirect to Vipps
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
  };

  if (success) {
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

  if (pendingOrder) {
    return (
      <div className={styles.container}>
        <div className={styles.recoveryBox}>
          <h2 className={styles.recoveryTitle}>Du har en pågående bestilling som ikke er betalt ennå.</h2>
          <div className={styles.recoveryDetails}>
            <div className={styles.recoveryItem}>
              <span className={styles.recoveryLabel}>Billettype</span>
              <span className={styles.recoveryValue}>{pendingOrder.ticketTypeName}</span>
            </div>
            <div className={styles.recoveryItem}>
              <span className={styles.recoveryLabel}>Antall</span>
              <span className={styles.recoveryValue}>{pendingOrder.quantity} stk</span>
            </div>
            <div className={styles.recoveryItem}>
              <span className={styles.recoveryLabel}>Totalpris</span>
              <span className={styles.recoveryValue}>{pendingOrder.totalAmountNok} NOK</span>
            </div>
          </div>
          <div className={styles.recoveryActions}>
            <button 
              className={`${styles.paymentBtn} btn btn-primary`}
              onClick={handleContinuePayment}
              disabled={loading}
            >
              {loading ? 'Laster...' : 'Gå tilbake til betaling'}
            </button>
            <button 
              className={styles.cancelBtn}
              onClick={handleCancelOrder}
              disabled={loading}
            >
              {loading ? '...' : 'Avbryt bestilling'}
            </button>
          </div>
          <p className={styles.recoveryHint}>
            Hvis du vil kjøpe andre billetter eller endre antall, må du først avbryte den pågående bestillingen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Get Tickets</h2>
        <div className={styles.ticketList}>
          {ticketTypes.map(tt => {
            const isSoldOut = tt.totalQuantity !== null && tt.soldQuantity >= tt.totalQuantity;
            const isSelected = selectedType?.id === tt.id;
            
            return (
              <div 
                key={tt.id} 
                className={`${styles.ticketItem} ${isSelected ? styles.ticketItemSelected : ''} ${isSoldOut ? styles.soldOut : ''}`}
                onClick={() => !isSoldOut && setSelectedType(tt)}
              >
                <div className={styles.ticketInfo}>
                  <span className={styles.ticketName}>
                    {tt.name}
                    {tt.isSupporter && !tt.name.toLowerCase().includes('supporter') && ' Supporter'}
                  </span>
                  <div className={styles.ticketStatus}>
                    {isSoldOut ? 'SOLD OUT' : tt.saleEndsAt ? `Until ${new Date(tt.saleEndsAt).toLocaleDateString()}` : 'Available'}
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

      <form className={styles.checkoutGrid} onSubmit={(e) => e.preventDefault()}>
        <div className={styles.checkoutDetails}>
          <div className={styles.field}>
            <div className={styles.quantityRow}>
              <label className={styles.label}>Quantity</label>
              <div className={styles.quantitySelector}>
                <button type="button" className={styles.qtyBtn} onClick={handleDecrement} disabled={quantity <= 1}>−</button>
                <span className={styles.qtyValue}>{quantity}</span>
                <button type="button" className={styles.qtyBtn} onClick={handleIncrement} disabled={!selectedType || (selectedType.totalQuantity !== null && quantity >= (selectedType.totalQuantity - selectedType.soldQuantity))}>+</button>
              </div>
            </div>
          </div>

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
              <input 
                className={styles.input} 
                type="email"
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="email@example.com"
                required
              />
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

          {error && <div className={styles.error}>{error}</div>}
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
                  <span>{selectedType?.priceNok || 0} NOK</span>
                </div>
              </div>
              <div className={`${styles.summaryRow} ${styles.totalRow}`}>
                <span>Total</span>
                <span className={styles.totalPrice}>{(selectedType?.priceNok || 0) * quantity} NOK</span>
              </div>
            </div>

            <div className={styles.rpBadge}>
              <span className={styles.rpIcon}>⚡</span>
              <span>
                {isLoggedIn 
                  ? <>Earn <strong>+{quantity * (selectedType?.isSupporter ? 200 : 150)} RP</strong> after payment</>
                  : <>Create an account after checkout to collect <strong>+{quantity * (selectedType?.isSupporter ? 200 : 150)} RP</strong></>
                }
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

            <div className={styles.paymentActions}>
              <button 
                type="button"
                className={`${styles.paymentBtn} ${styles.vippsBtn}`}
                onClick={() => { setPaymentMethod('WALLET'); handleSubmit(undefined, 'WALLET'); }}
                disabled={loading || !selectedType || !agree}
              >
                {loading && paymentMethod === 'WALLET' ? '...' : 'VIPPS'}
              </button>
              <button 
                type="button"
                className={`${styles.paymentBtn} ${styles.cardBtn}`}
                onClick={() => { setPaymentMethod('CARD'); handleSubmit(undefined, 'CARD'); }}
                disabled={loading || !selectedType || !agree}
              >
                {loading && paymentMethod === 'CARD' ? '...' : 'Card'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
