import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ hasPending: false });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ hasPending: false });
    }

    // Vyhledáme nejnovější pending objednávku pro tohoto uživatele a tento event
    // Musíme jít přes ticket_order_items, protože ticket_orders nemá event_id přímo
    const { data: orders, error: ordersError } = await supabase
      .from('ticket_orders')
      .select(`
        id,
        order_reference,
        total_amount_nok,
        payment_status,
        payment_url,
        created_at,
        ticket_order_items!inner (
          event_id,
          ticket_type_name,
          quantity
        )
      `)
      .eq('profile_id', user.id)
      .eq('payment_status', 'pending')
      .eq('ticket_order_items.event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (ordersError) {
      console.error('[pending-status] DB Error:', ordersError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ hasPending: false });
    }

    const order = orders[0];
    const item = order.ticket_order_items[0];

    return NextResponse.json({
      hasPending: true,
      order: {
        orderReference: order.order_reference,
        totalAmountNok: order.total_amount_nok,
        ticketTypeName: item.ticket_type_name,
        quantity: item.quantity,
        paymentUrl: order.payment_url
      }
    });

  } catch (err) {
    console.error('[pending-status] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
