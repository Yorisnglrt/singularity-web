'use client';

import { useState, useEffect } from 'react';
import { Event, EventTicketType } from '@/data/events';
import { supabase } from '@/lib/supabase';
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'WALLET' | 'CARD'>('WALLET');

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsLoggedIn(!!session);
      if (session?.user?.email) {
        setEmail(session.user.email);
      }
      if (session?.user?.user_metadata?.full_name) {
        setName(session.user.user_metadata.full_name);
      }
    };
    checkUser();
  }, []);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) return;
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
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
          paymentMethodType: paymentMethod
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
                <span className={styles.ticketName}>{tt.name}</span>
                {tt.description && <span className={styles.ticketDescription}>{tt.description}</span>}
                <div className={styles.ticketStatus}>
                  {isSoldOut ? 'SOLD OUT' : tt.saleEndsAt ? `Available until ${new Date(tt.saleEndsAt).toLocaleDateString()}` : 'Available until sold out'}
                </div>
              </div>
              <div className={styles.ticketPrice}>
                {tt.priceNok} NOK
              </div>
            </div>
          );
        })}
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.field}>
          <label className={styles.label}>Quantity</label>
          <div className={styles.quantitySelector}>
            <button type="button" className={styles.qtyBtn} onClick={handleDecrement} disabled={quantity <= 1}>-</button>
            <span className={styles.qtyValue}>{quantity}</span>
            <button type="button" className={styles.qtyBtn} onClick={handleIncrement} disabled={!selectedType || (selectedType.totalQuantity !== null && quantity >= (selectedType.totalQuantity - selectedType.soldQuantity))}>+</button>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Your Name</label>
            <input 
              className={styles.input} 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="Full Name (optional)"
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

        <div className={styles.rpNote}>
          <span className={styles.rpHighlight}>Earn +{quantity * 150} RP</span> per presale ticket after payment.
          <br />
          {!isLoggedIn ? (
            <span style={{ fontSize: '0.85em', opacity: 0.8 }}>Create an account or log in after purchase to claim your Rave Points.</span>
          ) : (
            <span style={{ fontSize: '0.85em', opacity: 0.8 }}>Rave Points will be added to your account after payment.</span>
          )}
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

        <div className={styles.paymentMethodSelector}>
          <div 
            className={`${styles.methodBtn} ${paymentMethod === 'WALLET' ? styles.methodBtnSelected : ''}`}
            onClick={() => setPaymentMethod('WALLET')}
          >
            <span className={styles.methodIcon}>📱</span>
            <span className={styles.methodLabel}>Pay with Vipps</span>
          </div>
          <div 
            className={`${styles.methodBtn} ${paymentMethod === 'CARD' ? styles.methodBtnSelected : ''}`}
            onClick={() => setPaymentMethod('CARD')}
          >
            <span className={styles.methodIcon}>💳</span>
            <span className={styles.methodLabel}>Pay with Card</span>
          </div>
        </div>

        <button 
          type="submit" 
          className={styles.submitBtn} 
          disabled={loading || !selectedType}
        >
          {loading ? 'Creating Order...' : 'Create Pending Order'}
        </button>
      </form>
    </div>
  );
}
