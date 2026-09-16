-- Migration: 20260916150000_lock_down_inventory_rpcs.sql
-- Fixes a serious overselling/DoS hole: increment_ticket_sold_counts(items)
-- and increment_guest_claimed_count(p_guest_code_id) were executable by
-- anon and authenticated with no capacity or ownership checks. Either
-- function can be called directly (no login required) from the public anon
-- key:
--   - increment_ticket_sold_counts accepts an arbitrary quantity per item,
--     including negative values, which can push sold_quantity back down
--     below the true sold count -- defeating the capacity checks added in
--     20260916120000/20260906000000 and reopening overselling.
--   - increment_guest_claimed_count can be called repeatedly to exhaust a
--     guest code's claimed_count with no relation to real claims, denying
--     legitimate holders.
--
-- Both functions are only ever called from issueTicketsForOrder.ts via the
-- service-role client (grep confirms no client-side call site). Locking
-- execution to service_role closes the direct-call path with no functional
-- change to the app.

REVOKE EXECUTE ON FUNCTION public.increment_ticket_sold_counts(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ticket_sold_counts(JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_guest_claimed_count(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_guest_claimed_count(UUID) TO service_role;
