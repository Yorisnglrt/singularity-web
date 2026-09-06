import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { orderReference, claimToken } = body;

    if (!orderReference) {
      return NextResponse.json({ error: 'Missing orderReference' }, { status: 400 });
    }

    const authHeader = req.headers.get('Authorization');
    const isAuthenticated = authHeader && authHeader.startsWith('Bearer ');

    let order: { id: string; payment_status: string; profile_id: string | null } | null = null;

    if (isAuthenticated) {
      // ── Authenticated path: verify JWT and ownership via profile_id ──
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { data, error: orderError } = await supabase
        .from('ticket_orders')
        .select('id, payment_status, profile_id')
        .eq('order_reference', orderReference)
        .single();

      if (orderError || !data) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      if (data.profile_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      order = data;
    } else {
      // ── Guest path: verify ownership via claimToken ──
      if (!claimToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { data, error: orderError } = await supabase
        .from('ticket_orders')
        .select('id, payment_status, profile_id')
        .eq('order_reference', orderReference)
        .eq('claim_token', claimToken)
        .single();

      if (orderError || !data) {
        return NextResponse.json({ error: 'Order not found or claim token invalid' }, { status: 403 });
      }

      order = data;
    }

    // ── Status check: only pending orders can be cancelled ──
    if (order.payment_status !== 'pending') {
      return NextResponse.json({
        error: `Cannot cancel order with status: ${order.payment_status}`,
        currentStatus: order.payment_status
      }, { status: 409 });
    }

    // ── Cancel the order ──
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

    // ── Release the reserved stock ──
    const { error: releaseError } = await supabase.rpc('release_order_reservation', {
      p_order_id: order.id
    });

    if (releaseError) {
      // Non-fatal: log but don't fail the response — the order is already cancelled.
      // reserved_quantity will be reconciled on the next reserve_pending_order call.
      console.error('[cancel-order] release_order_reservation failed:', releaseError);
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[cancel-order] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
