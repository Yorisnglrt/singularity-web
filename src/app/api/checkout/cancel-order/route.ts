import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function POST(req: Request) {
  try {
    const { orderReference } = await req.json();

    if (!orderReference) {
      return NextResponse.json({ error: 'Missing orderReference' }, { status: 400 });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Načteme objednávku a ověříme vlastnictví a status
    const { data: order, error: orderError } = await supabase
      .from('ticket_orders')
      .select('id, payment_status, profile_id')
      .eq('order_reference', orderReference)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.profile_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Povolena změna je jen z pending na cancelled
    if (order.payment_status !== 'pending') {
      return NextResponse.json({ 
        error: `Cannot cancel order with status: ${order.payment_status}`,
        currentStatus: order.payment_status
      }, { status: 409 });
    }

    const { error: updateError } = await supabase
      .from('ticket_orders')
      .update({ 
        payment_status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', order.id);

    if (updateError) {
      console.error('[cancel-order] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[cancel-order] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
