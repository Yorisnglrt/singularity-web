-- Migration: 20260916120000_free_ticket_capacity_check.sql
-- Fixes overselling bug: use_free_ticket_reward() created a paid ticket_order
-- for a reward claim without ever checking event_ticket_types capacity, so a
-- free-ticket reward could be redeemed for a sold-out ticket type.
--
-- Adds the same lock-and-check pattern used by reserve_pending_order():
-- lock the ticket type row, verify capacity, and reserve one slot. The
-- reservation is converted to sold_quantity and released by
-- issueTicketsForOrder()/increment_ticket_sold_counts() /
-- release_order_reservation() exactly as it is for paid Vipps orders.

CREATE OR REPLACE FUNCTION public.use_free_ticket_reward(
  p_event_id UUID,
  p_ticket_type_id UUID,
  p_customer_email TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID := auth.uid();
  v_claim_id UUID;
  v_order_id UUID;
  v_order_reference TEXT;
  v_ticket_type_name TEXT;
  v_claim_token TEXT;
  v_tt RECORD;
  v_available INTEGER;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Find and lock exactly ONE available free ticket claim for the user
  SELECT id INTO v_claim_id
  FROM public.reward_claims
  WHERE profile_id = v_profile_id
    AND reward_type = 'free_ticket'
    AND status = 'available'
  FOR UPDATE LIMIT 1;

  IF v_claim_id IS NULL THEN
    RAISE EXCEPTION 'No available free ticket found';
  END IF;

  -- 2. Lock the ticket type row and enforce capacity (prevents overselling
  --    via free-ticket redemptions on sold-out ticket types).
  SELECT id, name, total_quantity, sold_quantity, reserved_quantity
  INTO v_tt
  FROM public.event_ticket_types
  WHERE id = p_ticket_type_id AND event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid ticket type or event';
  END IF;

  v_ticket_type_name := v_tt.name;

  IF v_tt.total_quantity IS NOT NULL THEN
    v_available := v_tt.total_quantity - v_tt.sold_quantity - v_tt.reserved_quantity;
    IF v_available < 1 THEN
      RAISE EXCEPTION 'Ticket type is sold out';
    END IF;
  END IF;

  -- Reserve the slot now; it is converted to sold_quantity and released
  -- by issueTicketsForOrder() once tickets are actually issued.
  UPDATE public.event_ticket_types
  SET reserved_quantity = reserved_quantity + 1
  WHERE id = p_ticket_type_id;

  -- 3. Create the ticket_order row
  v_order_reference := 'SG-RW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_claim_token := gen_random_uuid()::text;

  INSERT INTO public.ticket_orders (
    order_reference, customer_email, customer_name, customer_phone,
    total_amount_nok, currency, sales_channel, payment_provider,
    payment_status, payment_method_type, profile_id,
    rave_points_earned, points_awarded, claim_token, metadata, paid_at
  )
  VALUES (
    v_order_reference, p_customer_email, p_customer_name, p_customer_phone,
    0, 'NOK', 'online', 'internal_reward',
    'paid', 'FREE_TICKET', v_profile_id,
    0, true, v_claim_token, '{}'::jsonb, now()
  )
  RETURNING id INTO v_order_id;

  -- 4. Create the ticket_order_items row
  INSERT INTO public.ticket_order_items (
    order_id, event_id, ticket_type_id, ticket_type_name,
    quantity, unit_price_nok, line_total_nok, is_supporter
  )
  VALUES (
    v_order_id, p_event_id, p_ticket_type_id, v_ticket_type_name,
    1, 0, 0, false
  );

  -- 5. Mark the reward claim as used
  UPDATE public.reward_claims
  SET status = 'used',
      used_at = now(),
      checkout_reference = v_order_reference
  WHERE id = v_claim_id;

  RETURN v_order_id;
END;
$$;
