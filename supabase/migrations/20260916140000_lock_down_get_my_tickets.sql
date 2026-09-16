-- Migration: 20260916140000_lock_down_get_my_tickets.sql
-- Fixes IDOR: get_my_tickets(p_user_id, p_user_email) trusts its caller-
-- supplied identity parameters instead of deriving them from auth.uid()/
-- auth.email(), and was executable by anon and authenticated. Any client
-- (including an unauthenticated one, using just the public anon key) could
-- call it directly with someone else's user id / email and receive that
-- person's tickets (event, ticket_code, order reference).
--
-- src/app/api/profile/tickets/route.ts is the only legitimate caller: it
-- already resolves the caller's own id/email server-side from a verified
-- bearer token before invoking this RPC via the service-role client. Locking
-- execution to service_role closes the direct-call path without requiring
-- any changes to that route or the function body.
--
-- Function body documented here (previously untracked, introspected from
-- production via pg_get_functiondef on 2026-09-16) matches production
-- as-is; only the grants below are a behavior change.

CREATE OR REPLACE FUNCTION public.get_my_tickets(p_user_id UUID, p_user_email TEXT)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  SELECT jsonb_build_object(
    'id', t.id,
    'ticket_code', t.ticket_code,
    'status', t.status,
    'created_at', t.created_at,
    'events', jsonb_build_object(
      'id', e.id,
      'title', e.title,
      'date', e.date,
      'venue', e.venue
    ),
    'event_ticket_types', CASE
      WHEN tt.id IS NOT NULL THEN jsonb_build_object('name', tt.name)
      ELSE NULL
    END,
    'ticket_orders', CASE
      WHEN o.id IS NOT NULL THEN jsonb_build_object(
        'id', o.id,
        'order_reference', o.order_reference,
        'payment_status', o.payment_status,
        'created_at', o.created_at
      )
      ELSE NULL
    END
  )
  FROM tickets t
  JOIN events e ON t.event_id = e.id
  LEFT JOIN event_ticket_types tt ON t.ticket_type_id = tt.id
  LEFT JOIN ticket_orders o ON t.order_id = o.id
  WHERE (o.profile_id = p_user_id)
     OR (lower(o.customer_email) = lower(p_user_email))
     OR (lower(t.holder_email) = lower(p_user_email))
  ORDER BY t.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_tickets(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tickets(UUID, TEXT) TO service_role;
