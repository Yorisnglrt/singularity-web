'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';

interface TicketOrderItem {
  id: string;
  ticket_type_name: string;
  quantity: number;
  unit_price_nok: number;
  line_total_nok: number;
  event: {
    title: string;
  };
}

interface Ticket {
  id: string;
  ticket_code: string;
  status: string;
}

interface TicketOrder {
  id: string;
  order_reference: string;
  customer_email: string;
  customer_name: string | null;
  customer_phone: string | null;
  total_amount_nok: number;
  payment_status: string;
  payment_method_type: string;
  paid_at: string | null;
  email_status: string;
  email_sent_at: string | null;
  tickets_issued: boolean;
  tickets_issued_at: string | null;
  points_awarded: boolean;
  rave_points_earned: number;
  created_at: string;
  ticket_count: number;
  items: TicketOrderItem[];
  tickets: Ticket[];
}

export default function TicketSalesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  
  const [orders, setOrders] = useState<TicketOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [clearing, setClearing] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('paid');
  const [emailFilter, setEmailFilter] = useState('all');

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/ticket-sales', {
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch orders');
      }
      
      const data = await res.json();
      setOrders(data);
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      router.push('/');
    } else if (user?.isAdmin) {
      fetchOrders();
    }
  }, [user, authLoading, router, fetchOrders]);

  const handleResendEmail = async (order: TicketOrder) => {
    if (!confirm(`Resend tickets to ${order.customer_email}?`)) return;
    
    setResendingId(order.id);
    setStatusMsg(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/tickets/resend-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ orderReference: order.order_reference })
      });
      
      const result = await res.json();
      
      if (res.ok) {
        setStatusMsg({ type: 'success', text: `Email sent successfully to ${order.customer_email}` });
        // Refresh orders to update status
        fetchOrders();
      } else {
        setStatusMsg({ type: 'error', text: result.error || 'Failed to resend email' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setResendingId(null);
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  const handleClearFailedOrders = async () => {
    if (!confirm('Delete all failed orders? This cannot be undone.')) return;
    
    setClearing(true);
    setStatusMsg(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/orders/failed', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      });
      
      const result = await res.json();
      
      if (res.ok) {
        setStatusMsg({ type: 'success', text: `Deleted ${result.deleted} failed orders successfully.` });
        fetchOrders();
      } else {
        setStatusMsg({ type: 'error', text: result.error || 'Failed to clear failed orders' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setClearing(false);
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.order_reference.toLowerCase().includes(search.toLowerCase()) ||
      order.customer_email.toLowerCase().includes(search.toLowerCase()) ||
      (order.customer_name?.toLowerCase() || '').includes(search.toLowerCase());
    
    const matchesPayment = paymentFilter === 'all' || order.payment_status === paymentFilter;
    const matchesEmail = emailFilter === 'all' || order.email_status === emailFilter;
    
    return matchesSearch && matchesPayment && matchesEmail;
  });

  if (authLoading || (loading && orders.length === 0)) {
    return <div className={styles.page}><div className={styles.container}>Loading...</div></div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <Link href="/admin" style={{ color: 'var(--color-accent-primary)', fontSize: '0.9rem', textDecoration: 'none', display: 'block', marginBottom: '0.5rem' }}>
              ← Back to Dashboard
            </Link>
            <h1 className={styles.title}>Ticket Sales</h1>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              onClick={handleClearFailedOrders} 
              className={`${styles.button} ${styles.buttonDanger}`} 
              style={{ width: 'auto' }}
              disabled={clearing}
            >
              {clearing ? 'Clearing...' : '🗑 Clear Failed Orders'}
            </button>
            <button onClick={fetchOrders} className={`${styles.button} ${styles.buttonOutline}`} style={{ width: 'auto' }}>
              Refresh Data
            </button>
          </div>
        </header>

        {statusMsg && (
          <div className={`${styles.alert} ${statusMsg.type === 'success' ? styles.alertSuccess : styles.alertError}`}>
            {statusMsg.text}
          </div>
        )}

        {error && <div className={`${styles.alert} ${styles.alertError}`}>{error}</div>}

        <div className={styles.controls}>
          <div className={styles.search}>
            <input 
              type="text" 
              placeholder="Search by reference, email, or name..." 
              className={styles.input}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className={styles.select} value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}>
            <option value="all">All Payment Statuses</option>
            <option value="paid">Paid Only</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <select className={styles.select} value={emailFilter} onChange={e => setEmailFilter(e.target.value)}>
            <option value="all">All Email Statuses</option>
            <option value="sent">Sent</option>
            <option value="not_sent">Not Sent</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div className={styles.ordersGrid}>
          {filteredOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
              No orders found matching your criteria.
            </div>
          ) : (
            filteredOrders.map(order => (
              <div key={order.id} className={styles.orderCard}>
                <div className={styles.orderMain}>
                  <div className={styles.orderHeader}>
                    <div>
                      <span className={styles.orderRef}>{order.order_reference}</span>
                      <div className={styles.orderDate}>{new Date(order.created_at).toLocaleString()}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <span className={`${styles.status} ${order.payment_status === 'paid' ? styles.statusPaid : order.payment_status === 'pending' ? styles.statusPending : styles.statusFailed}`}>
                        {order.payment_status}
                      </span>
                      <span className={`${styles.status} ${order.email_status === 'sent' ? styles.statusPaid : styles.statusPending}`}>
                        Email: {order.email_status}
                      </span>
                    </div>
                  </div>

                  <div className={styles.customerInfo}>
                    <div className={styles.customerName}>{order.customer_name || 'Anonymous Customer'}</div>
                    <div className={styles.customerEmail}>{order.customer_email}</div>
                  </div>

                  <div className={styles.orderMeta}>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Amount</span>
                      <span className={styles.metaValue}>{order.total_amount_nok} NOK</span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Method</span>
                      <span className={styles.metaValue}>{order.payment_method_type}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Tickets</span>
                      <span className={styles.metaValue}>{order.ticket_count} total</span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Points</span>
                      <span className={styles.metaValue}>{order.rave_points_earned} {order.points_awarded ? '✓' : ''}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Issued</span>
                      <span className={styles.metaValue}>{order.tickets_issued ? '✓' : '×'}</span>
                    </div>
                  </div>

                  <div className={styles.itemsList}>
                    {order.items.map(item => (
                      <div key={item.id} className={styles.itemRow}>
                        <div>
                          <strong>{item.quantity}x {item.ticket_type_name}</strong>
                          <span className={styles.itemEvent}>{item.event.title}</span>
                        </div>
                        <div>{item.line_total_nok} NOK</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.actions}>
                  <button 
                    className={styles.button}
                    onClick={() => handleResendEmail(order)}
                    disabled={resendingId === order.id || order.payment_status !== 'paid' || !order.tickets_issued}
                  >
                    {resendingId === order.id ? 'Sending...' : '✉ Resend Email'}
                  </button>
                  
                  {order.tickets && order.tickets.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {order.tickets.map((t, i) => (
                        <Link 
                          key={t.id}
                          href={`/tickets/${t.ticket_code}?from=admin-sales`}
                          className={`${styles.button} ${styles.buttonOutline}`}
                          target="_blank"
                          style={{ textDecoration: 'none', fontSize: '0.75rem', padding: '0.4rem' }}
                        >
                          🎫 Ticket {order.tickets.length > 1 ? i + 1 : ''} ({t.status})
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                      No tickets issued
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
