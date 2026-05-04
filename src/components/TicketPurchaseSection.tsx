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

  useEffect(() => {
    if (user) {
      if (user.email) setEmail(user.email);
      if (user.displayName) setName(user.displayName);
    }
  }, [user]);

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
                  {tt.priceNok} NOK
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
                Create an account with the same email after checkout and your ticket points will be added to your profile.
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
                  ? <>Earn <strong>+{quantity * 150} RP</strong> after payment</>
                  : <>Create an account after checkout to collect <strong>+{quantity * 150} RP</strong></>
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
