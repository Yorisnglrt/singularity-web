import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendOrderTicketsEmail } from '@/lib/email/sendTicketEmail';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

/**
 * POST /api/admin/tickets/resend-email
 * Forces a resend of ticket emails for a specific order.
 * Admin only.
 */
export async function POST(req: Request) {
  try {
    // 1. Admin Verification
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'No auth header' }, { status: 401 });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // 2. Parse Request
    const body = await req.json();
    const { orderId, orderReference } = body;

    if (!orderId && !orderReference) {
      return NextResponse.json({ error: 'Missing orderId or orderReference' }, { status: 400 });
    }

    // 3. Resolve Order
    let query = supabase.from('ticket_orders').select('id, order_reference, payment_status');
    
    if (orderId) {
      query = query.eq('id', orderId);
    } else {
      query = query.eq('order_reference', orderReference);
    }

    const { data: order, error: orderLookupError } = await query.single();

    if (orderLookupError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Cannot resend email for unpaid order' }, { status: 400 });
    }

    // 4. Force Resend
    console.log(`[Admin] Manually resending tickets for order ${order.order_reference} (${order.id})`);
    
    const result = await sendOrderTicketsEmail(order.id, { force: true });

    return NextResponse.json({
      success: true,
      sent: result.sent,
      alreadySent: result.alreadySent,
      messageId: result.messageId
    });

  } catch (error: any) {
    console.error('[API Resend Tickets] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
