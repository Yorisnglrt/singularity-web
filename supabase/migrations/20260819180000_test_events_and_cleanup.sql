-- Migration: 20260819180000_test_events_and_cleanup.sql
-- Description: Add is_test_event flag and atomic test-event cleanup & stats RPCs

-- 1. Add is_test_event column to events table
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS is_test_event BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_events_is_test_event ON public.events(is_test_event);

-- 2. Helper RPC: get_test_event_stats
CREATE OR REPLACE FUNCTION public.get_test_event_stats(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN := false;
  v_event_exists BOOLEAN;
  v_is_test BOOLEAN;
  v_title TEXT;
  v_ticket_types_count INTEGER := 0;
  v_tickets_total INTEGER := 0;
  v_tickets_valid INTEGER := 0;
  v_tickets_used INTEGER := 0;
  v_tickets_guest INTEGER := 0;
  v_exclusive_orders_count INTEGER := 0;
  v_shared_orders_count INTEGER := 0;
  v_checkins_count INTEGER := 0;
  v_order_id UUID;
  v_other_events_count INTEGER;
  v_jwt_role TEXT;
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

  -- Load event info
  SELECT EXISTS(SELECT 1 FROM public.events WHERE id = p_event_id),
         is_test_event,
         title
  INTO v_event_exists, v_is_test, v_title
  FROM public.events
  WHERE id = p_event_id;

  IF NOT v_event_exists THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF NOT v_is_test THEN
    RAISE EXCEPTION 'Event is not a test event';
  END IF;

  -- Count ticket types
  SELECT count(*) INTO v_ticket_types_count
  FROM public.event_ticket_types
  WHERE event_id = p_event_id;

  -- Count tickets breakdown
  SELECT count(*),
         count(*) FILTER (WHERE status = 'valid'),
         count(*) FILTER (WHERE status = 'used'),
         count(*) FILTER (WHERE ticket_type = 'guest')
  INTO v_tickets_total, v_tickets_valid, v_tickets_used, v_tickets_guest
  FROM public.tickets
  WHERE event_id = p_event_id;

  -- Count event checkins
  SELECT count(*) INTO v_checkins_count
  FROM public.event_checkins
  WHERE event_id = p_event_id;

  -- Calculate exclusive vs shared orders
  FOR v_order_id IN 
    SELECT DISTINCT order_id 
    FROM public.ticket_order_items 
    WHERE event_id = p_event_id AND order_id IS NOT NULL
  LOOP
    SELECT count(*) INTO v_other_events_count
    FROM public.ticket_order_items
    WHERE order_id = v_order_id AND event_id != p_event_id;

    IF v_other_events_count = 0 THEN
      v_exclusive_orders_count := v_exclusive_orders_count + 1;
    ELSE
      v_shared_orders_count := v_shared_orders_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'eventId', p_event_id,
    'title', v_title,
    'ticketTypesCount', v_ticket_types_count,
    'ticketsTotal', v_tickets_total,
    'ticketsValid', v_tickets_valid,
    'ticketsUsed', v_tickets_used,
    'ticketsGuest', v_tickets_guest,
    'exclusiveOrdersCount', v_exclusive_orders_count,
    'sharedOrdersCount', v_shared_orders_count,
    'checkinsCount', v_checkins_count
  );
END;
$$;

-- 3. Atomic Deletion RPC: delete_test_event
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

  -- 6. Delete any remaining order items for this event (from shared orders)
  DELETE FROM public.ticket_order_items
  WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_deleted_order_items = ROW_COUNT;

  -- 7. Delete event ticket types
  DELETE FROM public.event_ticket_types
  WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_deleted_ticket_types = ROW_COUNT;

  -- 8. Delete event-specific check-ins
  DELETE FROM public.event_checkins
  WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_deleted_checkins = ROW_COUNT;

  -- 9. Delete event broadcast email logs & campaigns
  DELETE FROM public.event_broadcast_email_log
  WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_deleted_email_logs = ROW_COUNT;

  DELETE FROM public.event_broadcast_campaigns
  WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_deleted_campaigns = ROW_COUNT;

  -- 10. Delete event comments & reactions
  DELETE FROM public.event_comments
  WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_deleted_comments = ROW_COUNT;

  DELETE FROM public.event_reactions
  WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_deleted_reactions = ROW_COUNT;

  -- 11. Finally delete the test event record
  DELETE FROM public.events
  WHERE id = p_event_id;

  -- 12. Return success summary
  RETURN jsonb_build_object(
    'success', true,
    'eventId', p_event_id,
    'title', v_title,
    'deletedExclusiveOrders', v_deleted_exclusive_orders,
    'sharedOrdersRetained', COALESCE(array_length(v_shared_order_ids, 1), 0),
    'deletedTickets', v_deleted_tickets,
    'deletedOrderItems', v_deleted_order_items,
    'deletedTicketTypes', v_deleted_ticket_types,
    'deletedCheckins', v_deleted_checkins,
    'deletedCampaigns', v_deleted_campaigns,
    'deletedComments', v_deleted_comments,
    'deletedReactions', v_deleted_reactions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_test_event_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_test_event(UUID) TO authenticated;
