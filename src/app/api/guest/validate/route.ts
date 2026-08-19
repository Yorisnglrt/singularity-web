import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

/**
 * GET /api/guest/validate?code=...
 * Validates whether a guest code is active and available.
 * Returns only safe public information (event title, date, DJ name).
 * Does NOT expose venue/location, internal IDs, notes, or guest details.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawCode = searchParams.get('code');

    if (!rawCode) {
      return NextResponse.json({ error: 'Guest code is required' }, { status: 400 });
    }

    const code = rawCode.trim().toUpperCase();

    const { data: gc, error: gcError } = await supabaseAdmin
      .from('event_guest_codes')
      .select(`
        id,
        dj_name,
        code,
        guest_limit,
        claimed_count,
        price_ore,
        is_active,
        expires_at,
        events (
          id,
          title,
          date,
          is_test_event
        )
      `)
      .eq('code', code)
      .maybeSingle();

    if (gcError) {
      console.error('[guest validate error]', gcError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!gc) {
      return NextResponse.json({ valid: false, error: 'Guest code not found' }, { status: 404 });
    }

    if (!gc.is_active) {
      return NextResponse.json({ valid: false, error: 'This guest code is currently inactive' }, { status: 400 });
    }

    if (gc.expires_at && new Date(gc.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, error: 'This guest code has expired' }, { status: 400 });
    }

    // Count pending reservations for paid guest codes
    let pendingCount = 0;
    if (gc.price_ore > 0) {
      const { count } = await supabaseAdmin
        .from('ticket_order_items')
        .select('id, ticket_orders!inner(payment_status)', { count: 'exact', head: true })
        .eq('guest_code_id', gc.id)
        .eq('ticket_orders.payment_status', 'pending');
      pendingCount = count || 0;
    }

    if ((gc.claimed_count + pendingCount) >= gc.guest_limit) {
      return NextResponse.json({ 
        valid: false, 
        error: 'This guest list allocation is currently reserved or fully claimed',
        djName: gc.dj_name,
        eventTitle: (gc.events as any)?.title
      }, { status: 400 });
    }

    const event = gc.events as any;
    const priceOre = gc.price_ore || 0;
    const priceNok = Math.round(priceOre / 100);

    return NextResponse.json({
      valid: true,
      code: gc.code,
      djName: gc.dj_name,
      priceOre,
      priceNok,
      isPaid: priceOre > 0,
      eventTitle: event?.title || 'Singularity Event',
      eventDate: event?.date || null,
      isTestEvent: !!event?.is_test_event
    });
  } catch (err: any) {
    console.error('[guest validate unexpected error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
