-- Migration: 20260819190000_guest_codes_system.sql
-- Description: Self-service DJ Guest Codes system, atomic claim RPC, and test-event cleanup update

-- 1. Create event_guest_codes table
CREATE TABLE IF NOT EXISTS public.event_guest_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  dj_name TEXT NOT NULL,
  code TEXT NOT NULL,
  guest_limit INTEGER NOT NULL DEFAULT 5 CHECK (guest_limit >= 0),
  claimed_count INTEGER NOT NULL DEFAULT 0 CHECK (claimed_count >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  note TEXT,
  created_by_admin UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive unique index on code (trimmed & upper)
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_guest_codes_code ON public.event_guest_codes (UPPER(TRIM(code)));
CREATE INDEX IF NOT EXISTS idx_event_guest_codes_event ON public.event_guest_codes (event_id);

-- 2. Add guest_code_id to tickets table
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS guest_code_id UUID REFERENCES public.event_guest_codes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_guest_code_id ON public.tickets(guest_code_id);

-- 3. RLS for event_guest_codes
ALTER TABLE public.event_guest_codes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Admin full access on event_guest_codes" ON public.event_guest_codes;
DROP POLICY IF EXISTS "Public read on active guest codes" ON public.event_guest_codes;

-- Admins can do everything
CREATE POLICY "Admin full access on event_guest_codes"
ON public.event_guest_codes
FOR ALL
TO authenticated
USING (
  COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
)
WITH CHECK (
  COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false) = true
);

-- Public read only for basic validation
CREATE POLICY "Public read on active guest codes"
ON public.event_guest_codes
FOR SELECT
TO public
USING (is_active = true);

-- 4. Atomic claim RPC: claim_guest_ticket
CREATE OR REPLACE FUNCTION public.claim_guest_ticket(
  p_code TEXT,
  p_email TEXT,
  p_name TEXT,
  p_short_code TEXT,
  p_ticket_code TEXT,
  p_qr_payload TEXT,
  p_access_token UUID
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
  v_existing RECORD;
  v_ticket_id UUID;
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

  -- 2. Verify event exists
  SELECT title, date, is_test_event INTO v_event
  FROM public.events
  WHERE id = v_gc.event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EVENT_NOT_FOUND', 'message', 'Event not found');
  END IF;

  -- 3. Check for duplicate claim with same email on this guest code
  SELECT id, ticket_code, short_code, access_token INTO v_existing
  FROM public.tickets
  WHERE guest_code_id = v_gc.id
    AND LOWER(TRIM(holder_email)) = v_email
    AND status != 'void'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_CLAIMED',
      'message', 'You have already claimed a guest ticket with this code.',
      'ticket_id', v_existing.id,
      'ticket_code', v_existing.ticket_code,
      'short_code', v_existing.short_code,
      'access_token', v_existing.access_token,
      'event_title', v_event.title,
      'dj_name', v_gc.dj_name
    );
  END IF;

  -- 4. Check capacity
  IF v_gc.claimed_count >= v_gc.guest_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'CAPACITY_REACHED',
      'message', 'This guest list allocation is fully claimed.',
      'event_title', v_event.title,
      'dj_name', v_gc.dj_name
    );
  END IF;

  -- 5. Insert new ticket
  INSERT INTO public.tickets (
    event_id,
    guest_code_id,
    ticket_type,
    ticket_code,
    short_code,
    qr_payload,
    access_token,
    holder_name,
    holder_email,
    status
  ) VALUES (
    v_gc.event_id,
    v_gc.id,
    'guest',
    p_ticket_code,
    p_short_code,
    p_qr_payload,
    p_access_token,
    v_name,
    v_email,
    'valid'
  )
  RETURNING id INTO v_ticket_id;

  -- 6. Atomically increment claimed_count
  UPDATE public.event_guest_codes
  SET claimed_count = claimed_count + 1,
      updated_at = now()
  WHERE id = v_gc.id;

  -- 7. Return success payload
  RETURN jsonb_build_object(
    'success', true,
    'ticket_id', v_ticket_id,
    'ticket_code', p_ticket_code,
    'short_code', p_short_code,
    'access_token', p_access_token,
    'event_id', v_gc.event_id,
    'event_title', v_event.title,
    'event_date', v_event.date,
    'is_test_event', v_event.is_test_event,
    'dj_name', v_gc.dj_name,
    'holder_email', v_email,
    'holder_name', v_name
  );
END;
$$;

-- 5. Atomic void/restore RPC: void_guest_ticket
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

  -- If ticket was linked to a guest code, decrement claimed_count
  IF v_tkt.guest_code_id IS NOT NULL THEN
    UPDATE public.event_guest_codes
    SET claimed_count = GREATEST(0, claimed_count - 1),
        updated_at = now()
    WHERE id = v_tkt.guest_code_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'ticket_id', p_ticket_id, 'status', 'void');
END;
$$;

-- 6. Update delete_test_event RPC to also remove guest codes
CREATE OR REPLACE FUNCTION public.delete_test_event(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN := false;
  v_is_test BOOLEAN;
  v_title TEXT;
  v_order_id UUID;
  v_other_events_count INTEGER;
  v_exclusive_order_ids UUID[] := '{}';
  v_shared_order_ids UUID[] := '{}';
  v_jwt_role TEXT;
  
  v_deleted_tickets INTEGER := 0;
  v_deleted_exclusive_orders INTEGER := 0;
  v_deleted_order_items INTEGER := 0;
  v_deleted_ticket_types INTEGER := 0;
  v_deleted_checkins INTEGER := 0;
  v_deleted_comments INTEGER := 0;
  v_deleted_reactions INTEGER := 0;
  v_deleted_campaigns INTEGER := 0;
  v_deleted_email_logs INTEGER := 0;
  v_deleted_guest_codes INTEGER := 0;
BEGIN
  -- 1. Auth check (admin or service role)
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

  -- 2. Lock event row and verify it is indeed a test event
  SELECT is_test_event, title INTO v_is_test, v_title
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF NOT v_is_test THEN
    RAISE EXCEPTION 'Forbidden: Cannot delete a production event using test event cleanup. is_test_event is false.';
  END IF;

  -- 3. Classify orders: exclusive test orders vs shared multi-event orders
  FOR v_order_id IN 
    SELECT DISTINCT order_id 
    FROM public.ticket_order_items 
    WHERE event_id = p_event_id AND order_id IS NOT NULL
  LOOP
    SELECT count(*) INTO v_other_events_count
    FROM public.ticket_order_items
    WHERE order_id = v_order_id AND event_id != p_event_id;

    IF v_other_events_count = 0 THEN
      v_exclusive_order_ids := array_append(v_exclusive_order_ids, v_order_id);
    ELSE
      v_shared_order_ids := array_append(v_shared_order_ids, v_order_id);
    END IF;
  END LOOP;

  -- 4. Delete exclusive test orders
  IF array_length(v_exclusive_order_ids, 1) > 0 THEN
    DELETE FROM public.ticket_orders
    WHERE id = ANY(v_exclusive_order_ids);
    GET DIAGNOSTICS v_deleted_exclusive_orders = ROW_COUNT;
  END IF;

  -- 5. Delete any remaining tickets for this event (guest, reward, or from shared orders)
  DELETE FROM public.tickets
  WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_deleted_tickets = ROW_COUNT;

  -- 6. Delete guest codes for this event
  DELETE FROM public.event_guest_codes
  WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_deleted_guest_codes = ROW_COUNT;

  -- 7. Delete any remaining order items for this event (from shared orders)
  DELETE FROM public.ticket_order_items
  WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_deleted_order_items = ROW_COUNT;

  -- 8. Delete event ticket types
  DELETE FROM public.event_ticket_types
  WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_deleted_ticket_types = ROW_COUNT;

  -- 9. Delete event-specific check-ins
  DELETE FROM public.event_checkins
  WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_deleted_checkins = ROW_COUNT;

  -- 10. Delete event broadcast email logs & campaigns
  DELETE FROM public.event_broadcast_email_log
  WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_deleted_email_logs = ROW_COUNT;

  DELETE FROM public.event_broadcast_campaigns
  WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_deleted_campaigns = ROW_COUNT;

  -- 11. Delete event comments & reactions
  DELETE FROM public.event_comments
  WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_deleted_comments = ROW_COUNT;

  DELETE FROM public.event_reactions
  WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_deleted_reactions = ROW_COUNT;

  -- 12. Finally delete the test event record
  DELETE FROM public.events
  WHERE id = p_event_id;

  -- 13. Return success summary
  RETURN jsonb_build_object(
    'success', true,
    'eventId', p_event_id,
    'title', v_title,
    'deletedExclusiveOrders', v_deleted_exclusive_orders,
    'sharedOrdersRetained', COALESCE(array_length(v_shared_order_ids, 1), 0),
    'deletedTickets', v_deleted_tickets,
    'deletedGuestCodes', v_deleted_guest_codes,
    'deletedOrderItems', v_deleted_order_items,
    'deletedTicketTypes', v_deleted_ticket_types,
    'deletedCheckins', v_deleted_checkins,
    'deletedCampaigns', v_deleted_campaigns,
    'deletedComments', v_deleted_comments,
    'deletedReactions', v_deleted_reactions
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.claim_guest_ticket(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_guest_ticket(UUID) TO authenticated, service_role;
