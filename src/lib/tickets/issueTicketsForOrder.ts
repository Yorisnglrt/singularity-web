import { createClient } from '@supabase/supabase-js';
import { sendOrderTicketsEmail } from '@/lib/email/sendTicketEmail';
import { sendActiveBroadcastCampaignsForTickets } from '@/lib/email/sendActiveBroadcastCampaignsForTickets';
import { generateShortCode } from '@/lib/tickets/shortCode';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * Issues individual tickets for a paid order.
 * This function is idempotent: if tickets were already issued, it does nothing.
 */
export async function issueTicketsForOrder(orderId: string): Promise<{ issued: number; alreadyIssued: boolean }> {
  // 1. Fetch order with idempotency check
  const { data: order, error: orderError } = await supabaseAdmin
    .from('ticket_orders')
    .select('id, order_reference, payment_status, tickets_issued, customer_name, customer_email, email_status, profile_id, rave_points_earned, points_awarded')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // 2. Safety checks
  if (order.payment_status !== 'paid') {
    console.log(`[tickets] Order ${order.order_reference} is not paid (status: ${order.payment_status}). Skipping issuance.`);
    return { issued: 0, alreadyIssued: false };
  }

  // Handle Fallbacks (Email & Points) if already issued
  if (order.tickets_issued) {
    console.log(`[tickets] already issued for order ${order.order_reference}`);
    
    // Fallback: Email delivery
    if (order.email_status !== 'sent') {
      console.log(`[tickets] email is ${order.email_status}, retrying delivery for ${order.order_reference}`);
      try {
        await sendOrderTicketsEmail(orderId);
      } catch (err: any) {
        console.error(`[tickets] retry email failed for ${order.order_reference}:`, err.message);
      }
    }

    // Fallback: Points Awarding
    await awardPointsForOrder(order);
    
    return { issued: 0, alreadyIssued: true };
  }

  // 3. Fetch order items
  const { data: items, error: itemsError } = await supabaseAdmin
    .from('ticket_order_items')
    .select('id, event_id, ticket_type_id, guest_code_id, quantity')
    .eq('order_id', orderId);

  if (itemsError || !items || items.length === 0) {
    throw new Error(`No items found for order ${order.order_reference}`);
  }

  // 4. Generate ticket records
  const ticketInserts: any[] = [];
  let ticketCounter = 1;

  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      const ticketCode = `${order.order_reference}-${ticketCounter}`;
      const nonce = Math.random().toString(36).substring(2, 7).toUpperCase();
      const shortCode = generateShortCode();
      const qrPayload = shortCode;

      ticketInserts.push({
        order_id: orderId,
        order_item_id: item.id,
        event_id: item.event_id,
        ticket_type_id: item.ticket_type_id || null,
        guest_code_id: item.guest_code_id || null,
        ticket_type: item.guest_code_id ? 'guest' : 'paid',
        ticket_code: ticketCode,
        qr_payload: qrPayload,
        short_code: shortCode,
        holder_name: order.customer_name,
        holder_email: order.customer_email,
        status: 'valid'
      });

      ticketCounter++;
    }
  }

  // 5. Bulk insert tickets
  console.log(`[tickets] issuing for order ${order.order_reference}...`);
  const { error: insertError } = await supabaseAdmin
    .from('tickets')
    .insert(ticketInserts);

  if (insertError) {
    console.error(`[tickets] issue failed for order ${order.order_reference}:`, insertError);
    throw new Error('Failed to generate tickets');
  }

  // 5.2 Trigger active broadcast campaigns for the new tickets
  try {
    const ticketsByEvent: Record<string, any[]> = {};
    for (const t of ticketInserts) {
      if (!t.event_id || !t.holder_email) continue;
      if (!ticketsByEvent[t.event_id]) {
        ticketsByEvent[t.event_id] = [];
      }
      ticketsByEvent[t.event_id].push({
        holder_email: t.holder_email,
        holder_name: t.holder_name,
      });
    }

    for (const [eventId, evTickets] of Object.entries(ticketsByEvent)) {
      // Execute without letting any error propagate
      await sendActiveBroadcastCampaignsForTickets({
        eventId,
        tickets: evTickets,
      }).catch(err => {
        console.error(`[tickets] Failed to send active campaigns for eventId: ${eventId}, orderId: ${orderId}:`, err);
      });
    }
  } catch (err) {
    console.error(`[tickets] Error grouping tickets for active campaign send for orderId: ${orderId}:`, err);
  }

  // 5.5 Update sold_quantity in event_ticket_types and increment claimed_count in event_guest_codes
  try {
    const regularTtUpdates = items
      .filter(item => item.ticket_type_id)
      .map(item => ({
        ticket_type_id: item.ticket_type_id,
        quantity: item.quantity
      }));
    
    if (regularTtUpdates.length > 0) {
      const { error: ttError } = await supabaseAdmin.rpc('increment_ticket_sold_counts', { 
        items: regularTtUpdates 
      });
      if (ttError) {
        console.error(`[tickets] Failed to increment sold counts for order ${order.order_reference}:`, ttError);
      } else {
        // Release the pending reservation now that sold_quantity has been incremented.
        // This keeps reserved_quantity and sold_quantity consistent:
        // on payment: sold_quantity++ and reserved_quantity-- together → net capacity unchanged.
        const { error: releaseError } = await supabaseAdmin.rpc('release_order_reservation', {
          p_order_id: orderId
        });
        if (releaseError) {
          console.error(`[tickets] release_order_reservation failed for order ${order.order_reference}:`, releaseError);
        }
      }
    }

    // Increment guest code claimed_count for paid guest items
    for (const item of items) {
      if (item.guest_code_id) {
        for (let q = 0; q < (item.quantity || 1); q++) {
          await supabaseAdmin.rpc('increment_guest_claimed_count', {
            p_guest_code_id: item.guest_code_id
          });
        }
      }
    }
  } catch (ttErr: any) {
    console.error(`[tickets] sold_quantity/guest count increment crashed for ${order.order_reference}:`, ttErr.message);
  }


  // 6. Mark order as issued
  const { error: updateError } = await supabaseAdmin
    .from('ticket_orders')
    .update({
      tickets_issued: true,
      tickets_issued_at: new Date().toISOString()
    })
    .eq('id', orderId);

  if (updateError) {
    console.error(`[tickets] Failed to update tickets_issued flag for ${order.order_reference}:`, updateError);
  }

  console.log(`[tickets] issued count ${ticketInserts.length} for order ${order.order_reference}`);

  // 7. Send confirmation email (non-blocking)
  try {
    await sendOrderTicketsEmail(orderId);
  } catch (emailErr: any) {
    console.error(`[tickets] Initial email delivery failed for ${order.order_reference}:`, emailErr.message);
  }

  // 8. Award Rave Points
  await awardPointsForOrder(order);

  return { issued: ticketInserts.length, alreadyIssued: false };
}

/**
 * Internal helper to award points for an order.
 * Idempotent: checks points_awarded and existing log entries.
 */
async function awardPointsForOrder(order: any) {
  if (!order.profile_id || order.rave_points_earned <= 0 || order.points_awarded) {
    if (order.points_awarded) console.log(`[points] points already awarded for ${order.order_reference}`);
    else if (!order.profile_id) console.log(`[points] skipping points for ${order.order_reference} (no profile_id)`);
    return;
  }

  console.log(`[points] awarding ${order.rave_points_earned} points for order ${order.order_reference}...`);
  
  try {
    const description = `Ticket purchase: ${order.order_reference}`;
    
    // Safety check for duplicate logs
    const { data: existingLog } = await supabaseAdmin
      .from('points_log')
      .select('id')
      .eq('profile_id', order.profile_id)
      .eq('description', description)
      .limit(1);

    if (existingLog && existingLog.length > 0) {
      console.log(`[points] points already logged in points_log for ${order.order_reference}`);
      return;
    }

    const { error: logError } = await supabaseAdmin
      .from('points_log')
      .insert({
        profile_id: order.profile_id,
        points_delta: order.rave_points_earned,
        type: 'Ticket Purchase',
        description: description
      });

    if (logError) throw logError;
    
    await supabaseAdmin
      .from('ticket_orders')
      .update({
        points_awarded: true,
        points_awarded_at: new Date().toISOString()
      })
      .eq('id', order.id);

    console.log(`[points] awarded ${order.rave_points_earned} points to profile ${order.profile_id}`);
  } catch (err: any) {
    console.error(`[points] award failed for ${order.order_reference}:`, err.message);
  }
}
