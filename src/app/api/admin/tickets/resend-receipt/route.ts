import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendOrderReceiptEmail } from '@/lib/email/sendTicketEmail';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

/**
 * POST /api/admin/tickets/resend-receipt
 * Forces a resend of the payment receipt for a specific order.
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
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    // 3. Resolve Order & Validate
    const { data: order, error: orderLookupError } = await supabase
      .from('ticket_orders')
      .select('id, order_reference, payment_status, customer_email')
      .eq('id', orderId)
      .single();

    if (orderLookupError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Cannot resend receipt for unpaid order' }, { status: 400 });
    }

    if (!order.customer_email) {
      return NextResponse.json({ error: 'Order is missing customer email' }, { status: 400 });
    }

    // 4. Trigger Receipt Send
    console.log(`[Admin] Manually resending receipt for order ${order.order_reference} (${order.id})`);
    
    const result = await sendOrderReceiptEmail(order.id);

    if (!result.sent) {
      return NextResponse.json({ error: 'Failed to send receipt email' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId
    });

  } catch (error: any) {
    console.error('[API Resend Receipt] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
