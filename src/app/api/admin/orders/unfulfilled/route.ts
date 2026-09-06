import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

/**
 * GET /api/admin/orders/unfulfilled
 *
 * Returns orders where payment_status = 'paid_unfulfilled':
 * orders where Vipps captured payment but ticket issuance was blocked due to
 * no remaining capacity (race between payment and TTL expiry).
 *
 * These orders require manual attention: refund via Vipps + customer notification.
 * This endpoint is the foundation for the refund management admin feature.
 */
export async function GET(req: Request) {
  try {
    // ── Admin auth ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Fetch paid_unfulfilled orders ──
    const { data: orders, error: ordersError } = await supabase
      .from('ticket_orders')
      .select(`
        id,
        order_reference,
        customer_email,
        customer_name,
        total_amount_nok,
        currency,
        payment_status,
        vipps_reference,
        created_at,
        updated_at,
        ticket_order_items (
          event_id,
          ticket_type_name,
          quantity,
          unit_price_nok,
          line_total_nok
        )
      `)
      .eq('payment_status', 'paid_unfulfilled')
      .order('updated_at', { ascending: false });

    if (ordersError) {
      console.error('[admin/orders/unfulfilled] DB error:', ordersError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({
      count: orders?.length ?? 0,
      orders: orders ?? [],
    });

  } catch (err) {
    console.error('[admin/orders/unfulfilled] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
