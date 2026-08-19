-- Migration: 20260819200000_paid_guest_codes.sql
-- Description: Adds price_ore support to event_guest_codes, guest_code_id to ticket_order_items,
-- atomic reserve_guest_ticket_order RPC, and increment_guest_claimed_count RPC.

-- 1. Add price_ore to event_guest_codes
ALTER TABLE public.event_guest_codes 
ADD COLUMN IF NOT EXISTS price_ore INTEGER NOT NULL DEFAULT 0 CHECK (price_ore >= 0 AND price_ore % 100 = 0);

-- 2. Modify ticket_order_items to support guest codes and nullable ticket_type_id
ALTER TABLE public.ticket_order_items 
ALTER COLUMN ticket_type_id DROP NOT NULL;

ALTER TABLE public.ticket_order_items 
ADD COLUMN IF NOT EXISTS guest_code_id UUID REFERENCES public.event_guest_codes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_order_items_guest_code ON public.ticket_order_items(guest_code_id);

-- 3. Atomic RPC to reserve a paid guest ticket order
CREATE OR REPLACE FUNCTION public.reserve_guest_ticket_order(
  p_code TEXT,
  p_email TEXT,
  p_name TEXT,
  p_payment_method TEXT,
  p_order_reference TEXT,
  p_claim_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_email TEXT;
  v_name TEXT;
  v_gc RECORD;
  v_event RECORD;
  v_existing_tkt RECORD;
  v_existing_order RECORD;
  v_pending_count INTEGER := 0;
  v_order_id UUID;
  v_amount_nok INTEGER;
BEGIN
  -- Normalize inputs
  v_code := UPPER(TRIM(p_code));
  v_email := LOWER(TRIM(p_email));
  v_name := NULLIF(TRIM(p_name), '');

  IF v_code IS NULL OR v_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_CODE', 'message', 'Guest code is required');
  END IF;

  IF v_email IS NULL OR v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_EMAIL', 'message', 'A valid email address is required');
  END IF;

  -- 1. Lock guest code row for update
  SELECT * INTO v_gc
  FROM public.event_guest_codes
  WHERE UPPER(TRIM(code)) = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CODE_NOT_FOUND', 'message', 'Guest code not found');
  END IF;

  IF NOT v_gc.is_active THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CODE_INACTIVE', 'message', 'This guest code is currently inactive');
  END IF;

  IF v_gc.expires_at IS NOT NULL AND v_gc.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'CODE_EXPIRED', 'message', 'This guest code has expired');
  END IF;

  IF v_gc.price_ore <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FREE_CODE', 'message', 'This is a free guest code. Please use the free claim flow.');
  END IF;

  v_amount_nok := v_gc.price_ore / 100;

  -- 2. Verify event exists
  SELECT id, title, date, is_test_event INTO v_event
  FROM public.events
  WHERE id = v_gc.event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND', 'message', 'Event not found');
  END IF;

  -- 3. Duplicate check: Does this email already hold a valid ticket for this guest code?
  SELECT id, ticket_code, short_code, access_token INTO v_existing_tkt
  FROM public.tickets
  WHERE guest_code_id = v_gc.id
    AND LOWER(TRIM(holder_email)) = v_email
    AND status != 'void'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_CLAIMED',
      'message', 'You have already claimed a ticket with this guest code.',
      'ticket_id', v_existing_tkt.id,
      'ticket_code', v_existing_tkt.ticket_code,
      'short_code', v_existing_tkt.short_code,
      'access_token', v_existing_tkt.access_token,
      'event_title', v_event.title,
      'dj_name', v_gc.dj_name
    );
  END IF;

  -- 4. Check if this customer already has an active pending order for this guest code
  SELECT o.id, o.order_reference, o.payment_url, o.total_amount_nok INTO v_existing_order
  FROM public.ticket_order_items oi
  JOIN public.ticket_orders o ON o.id = oi.order_id
  WHERE oi.guest_code_id = v_gc.id
    AND LOWER(TRIM(o.customer_email)) = v_email
    AND o.payment_status = 'pending'
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Return existing pending reservation so customer can resume payment without taking a 2nd slot
    RETURN jsonb_build_object(
      'success', true,
      'resumed', true,
      'orderId', v_existing_order.id,
      'orderReference', v_existing_order.order_reference,
      'paymentUrl', v_existing_order.payment_url,
      'totalAmountNok', v_existing_order.total_amount_nok,
      'eventTitle', v_event.title,
      'djName', v_gc.dj_name
    );
  END IF;

  -- 5. Count active pending reservations held by other customers
  SELECT count(*) INTO v_pending_count
  FROM public.ticket_order_items oi
  JOIN public.ticket_orders o ON o.id = oi.order_id
  WHERE oi.guest_code_id = v_gc.id
    AND o.payment_status = 'pending'
    AND LOWER(TRIM(o.customer_email)) != v_email;

  -- 6. Check total capacity
  IF (v_gc.claimed_count + v_pending_count) >= v_gc.guest_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'CAPACITY_REACHED',
      'message', 'This guest list allocation is currently reserved or fully claimed.',
      'event_title', v_event.title,
      'dj_name', v_gc.dj_name
    );
  END IF;

  -- 7. Insert pending order
  INSERT INTO public.ticket_orders (
    order_reference,
    customer_email,
    customer_name,
    total_amount_nok,
    currency,
    sales_channel,
    payment_provider,
    payment_status,
    payment_method_type,
    claim_token,
    metadata
  ) VALUES (
    p_order_reference,
    v_email,
    v_name,
    v_amount_nok,
    'NOK',
    'online',
    'vipps',
    'pending',
    COALESCE(p_payment_method, 'WALLET'),
    p_claim_token,
    jsonb_build_object('guest_code_id', v_gc.id, 'guest_code', v_gc.code, 'dj_name', v_gc.dj_name)
  )
  RETURNING id INTO v_order_id;

  -- 8. Insert order item linked to guest_code_id
  INSERT INTO public.ticket_order_items (
    order_id,
    event_id,
    guest_code_id,
    ticket_type_name,
    quantity,
    unit_price_nok,
    line_total_nok
  ) VALUES (
    v_order_id,
    v_gc.event_id,
    v_gc.id,
    'Guest Pass (' || v_gc.dj_name || ')',
    1,
    v_amount_nok,
    v_amount_nok
  );

  -- 9. Return success
  RETURN jsonb_build_object(
    'success', true,
    'resumed', false,
    'orderId', v_order_id,
    'orderReference', p_order_reference,
    'totalAmountNok', v_amount_nok,
    'priceOre', v_gc.price_ore,
    'eventTitle', v_event.title,
    'eventDate', v_event.date,
    'isTestEvent', v_event.is_test_event,
    'djName', v_gc.dj_name
  );
END;
$$;

-- 4. Atomic RPC to increment claimed_count when paid order is confirmed
CREATE OR REPLACE FUNCTION public.increment_guest_claimed_count(p_guest_code_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.event_guest_codes
  SET claimed_count = claimed_count + 1,
      updated_at = now()
  WHERE id = p_guest_code_id;
END;
$$;

-- 5. Update void_guest_ticket RPC to distinguish free vs paid tickets
CREATE OR REPLACE FUNCTION public.void_guest_ticket(p_ticket_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN := false;
  v_jwt_role TEXT;
  v_tkt RECORD;
BEGIN
  -- Verify admin or service role
  BEGIN
    v_jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  IF current_user = 'service_role' OR v_jwt_role = 'service_role' THEN
    v_is_admin := true;
  ELSE
    SELECT COALESCE(is_admin, false) INTO v_is_admin
    FROM public.profiles
    WHERE id = auth.uid();
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Lock ticket row
  SELECT * INTO v_tkt
  FROM public.tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ticket not found');
  END IF;

  IF v_tkt.status = 'void' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Ticket is already void');
  END IF;

  -- Update ticket status to void
  UPDATE public.tickets
  SET status = 'void',
      updated_at = now()
  WHERE id = p_ticket_id;

  -- If ticket was a FREE guest ticket (order_id IS NULL), restore the allocation slot
  IF v_tkt.guest_code_id IS NOT NULL AND v_tkt.order_id IS NULL THEN
    UPDATE public.event_guest_codes
    SET claimed_count = GREATEST(0, claimed_count - 1),
        updated_at = now()
    WHERE id = v_tkt.guest_code_id;
  END IF;
  -- If ticket was a PAID guest ticket (order_id IS NOT NULL), do NOT decrement claimed_count
  -- because money was paid and no refund was issued.

  RETURN jsonb_build_object('success', true, 'ticket_id', p_ticket_id, 'status', 'void');
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.reserve_guest_ticket_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_guest_claimed_count(UUID) TO service_role;
