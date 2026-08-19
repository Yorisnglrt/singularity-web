import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendGuestTicketEmail } from '@/lib/email/sendTicketEmail';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

async function verifyAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) return null;
  return user;
}

/**
 * GET /api/admin/guest-codes?event_id=...
 * Fetch all guest code allocations for an event with their claimed tickets.
 */
export async function GET(req: Request) {
  try {
    const user = await verifyAdmin(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('event_id');

    if (!eventId) {
      return NextResponse.json({ error: 'Missing event_id' }, { status: 400 });
    }

    const { data: guestCodes, error } = await supabaseAdmin
      .from('event_guest_codes')
      .select(`
        id,
        event_id,
        dj_name,
        code,
        guest_limit,
        claimed_count,
        price_ore,
        is_active,
        expires_at,
        note,
        created_at,
        tickets (
          id,
          ticket_code,
          short_code,
          access_token,
          holder_name,
          holder_email,
          status,
          used_at,
          created_at,
          order_id
        )
      `)
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[admin guest-codes GET error]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch pending orders for each guest code
    const codesWithPending = await Promise.all((guestCodes || []).map(async (gc: any) => {
      let pendingCount = 0;
      if (gc.price_ore > 0) {
        const { count } = await supabaseAdmin
          .from('ticket_order_items')
          .select('id, ticket_orders!inner(payment_status)', { count: 'exact', head: true })
          .eq('guest_code_id', gc.id)
          .eq('ticket_orders.payment_status', 'pending');
        pendingCount = count || 0;
      }
      return {
        ...gc,
        pending_count: pendingCount,
        price_nok: Math.round((gc.price_ore || 0) / 100),
      };
    }));

    return NextResponse.json(codesWithPending);
  } catch (err: any) {
    console.error('[admin guest-codes GET unexpected error]', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/guest-codes
 * Manage guest code allocations: create, update, toggle_active, delete, void_ticket, resend_email.
 */
export async function POST(req: Request) {
  try {
    const user = await verifyAdmin(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }

    // ── 1. Create Guest Code ──
    if (action === 'create') {
      const { event_id, dj_name, code, guest_limit, price_nok, price_ore, note, expires_at } = body;

      if (!event_id || !dj_name || !code) {
        return NextResponse.json({ error: 'Missing required fields (event_id, dj_name, code)' }, { status: 400 });
      }

      const limit = parseInt(guest_limit, 10);
      if (isNaN(limit) || limit < 1) {
        return NextResponse.json({ error: 'Guest limit must be at least 1' }, { status: 400 });
      }

      let finalPriceOre = 0;
      if (price_ore !== undefined) {
        finalPriceOre = parseInt(price_ore, 10) || 0;
      } else if (price_nok !== undefined) {
        finalPriceOre = (parseInt(price_nok, 10) || 0) * 100;
      }

      if (finalPriceOre < 0 || finalPriceOre % 100 !== 0) {
        return NextResponse.json({ error: 'Price must be a positive whole NOK amount' }, { status: 400 });
      }

      const normalizedCode = code.trim().toUpperCase();

      const { data: created, error } = await supabaseAdmin
        .from('event_guest_codes')
        .insert({
          event_id,
          dj_name: dj_name.trim(),
          code: normalizedCode,
          guest_limit: limit,
          price_ore: finalPriceOre,
          note: note ? note.trim() : null,
          expires_at: expires_at || null,
          created_by_admin: user.id,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: `Guest code "${normalizedCode}" already exists. Please choose a unique code.` }, { status: 400 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, guestCode: created });
    }

    // ── 2. Update Guest Code ──
    if (action === 'update') {
      const { id, dj_name, guest_limit, price_nok, price_ore, note, expires_at, is_active } = body;

      if (!id) {
        return NextResponse.json({ error: 'Missing guest code id' }, { status: 400 });
      }

      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (dj_name !== undefined) updates.dj_name = dj_name.trim();
      if (guest_limit !== undefined) {
        const limit = parseInt(guest_limit, 10);
        if (isNaN(limit) || limit < 0) {
          return NextResponse.json({ error: 'Guest limit must be 0 or greater' }, { status: 400 });
        }
        updates.guest_limit = limit;
      }
      if (price_ore !== undefined) {
        const p = parseInt(price_ore, 10) || 0;
        if (p < 0 || p % 100 !== 0) return NextResponse.json({ error: 'Price must be whole NOK' }, { status: 400 });
        updates.price_ore = p;
      } else if (price_nok !== undefined) {
        const p = parseInt(price_nok, 10) || 0;
        if (p < 0) return NextResponse.json({ error: 'Price must be 0 or greater' }, { status: 400 });
        updates.price_ore = p * 100;
      }
      if (note !== undefined) updates.note = note ? note.trim() : null;
      if (expires_at !== undefined) updates.expires_at = expires_at || null;
      if (is_active !== undefined) updates.is_active = !!is_active;

      const { data: updated, error } = await supabaseAdmin
        .from('event_guest_codes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, guestCode: updated });
    }

    // ── 3. Toggle Active Status ──
    if (action === 'toggle_active') {
      const { id, is_active } = body;
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

      const { data: updated, error } = await supabaseAdmin
        .from('event_guest_codes')
        .update({ is_active: !!is_active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, guestCode: updated });
    }

    // ── 4. Delete Unused Guest Code ──
    if (action === 'delete') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

      // Check if any tickets were claimed
      const { data: gc } = await supabaseAdmin
        .from('event_guest_codes')
        .select('claimed_count, code')
        .eq('id', id)
        .single();

      if (gc && gc.claimed_count > 0) {
        return NextResponse.json({ 
          error: `Cannot delete code "${gc.code}" because it has ${gc.claimed_count} claimed ticket(s). Disable the code instead to preserve audit history.` 
        }, { status: 400 });
      }

      const { error } = await supabaseAdmin
        .from('event_guest_codes')
        .delete()
        .eq('id', id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ── 5. Void a Specific Guest Ticket & Restore Slot ──
    if (action === 'void_ticket') {
      const { ticket_id } = body;
      if (!ticket_id) return NextResponse.json({ error: 'Missing ticket_id' }, { status: 400 });

      const { data: result, error } = await supabaseAdmin.rpc('void_guest_ticket', {
        p_ticket_id: ticket_id,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(result);
    }

    // ── 6. Resend Guest Ticket Email ──
    if (action === 'resend_email') {
      const { ticket_id } = body;
      if (!ticket_id) return NextResponse.json({ error: 'Missing ticket_id' }, { status: 400 });

      await sendGuestTicketEmail([ticket_id]);
      return NextResponse.json({ success: true, message: 'Ticket email resent successfully' });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error('[admin guest-codes POST error]', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
