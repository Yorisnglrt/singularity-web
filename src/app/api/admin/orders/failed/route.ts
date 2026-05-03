import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function DELETE(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'No auth header' }, { status: 401 });

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

    // 1. Find all failed orders
    const { data: failedOrders, error: fetchError } = await supabase
      .from('ticket_orders')
      .select('id')
      .eq('payment_status', 'failed');

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!failedOrders || failedOrders.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    const failedOrderIds = failedOrders.map(o => o.id);

    // 2. Find which of these have tickets
    const { data: ordersWithTickets, error: ticketsError } = await supabase
      .from('tickets')
      .select('order_id')
      .in('order_id', failedOrderIds);

    if (ticketsError) {
      return NextResponse.json({ error: ticketsError.message }, { status: 500 });
    }

    const idsWithTickets = new Set(ordersWithTickets?.map(t => t.order_id) || []);
    
    // 3. Filter IDs to delete (failed AND no tickets)
    const idsToDelete = failedOrderIds.filter(id => !idsWithTickets.has(id));

    if (idsToDelete.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    // 4. Perform deletion
    const { error: deleteError } = await supabase
      .from('ticket_orders')
      .delete()
      .in('id', idsToDelete);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: idsToDelete.length });
  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ error: 'Failed to delete failed orders' }, { status: 500 });
  }
}
