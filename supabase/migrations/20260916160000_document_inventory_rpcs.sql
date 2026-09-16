-- Migration: 20260916160000_document_inventory_rpcs.sql
-- Documents increment_ticket_sold_counts() and increment_guest_claimed_count(),
-- which existed only in the live database (created out-of-band) and were
-- referenced by src/lib/tickets/issueTicketsForOrder.ts with no tracked
-- definition anywhere in supabase/migrations/. Bodies match production as
-- introspected on 2026-09-16 via pg_get_functiondef. Execute grants are
-- restated here (already applied to production in
-- 20260916150000_lock_down_inventory_rpcs.sql) so a fresh environment ends
-- up locked down the same way.

CREATE OR REPLACE FUNCTION public.increment_ticket_sold_counts(items JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item RECORD;
BEGIN
  FOR item IN SELECT * FROM jsonb_to_recordset(items) AS x(ticket_type_id UUID, quantity INT)
  LOOP
    UPDATE public.event_ticket_types
    SET sold_quantity = sold_quantity + item.quantity
    WHERE id = item.ticket_type_id;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_ticket_sold_counts(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ticket_sold_counts(JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.increment_guest_claimed_count(p_guest_code_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.event_guest_codes
  SET claimed_count = claimed_count + 1,
      updated_at = now()
  WHERE id = p_guest_code_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_guest_claimed_count(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_guest_claimed_count(UUID) TO service_role;
