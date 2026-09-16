-- Migration: 20260916120100_atomic_ticket_issuance_claim.sql
-- Fixes a TOCTOU race in issueTicketsForOrder(): it read tickets_issued,
-- then later wrote it back to true, with no lock in between. The function is
-- invoked concurrently from three independent call sites (Vipps webhook,
-- client-side payment status polling, and the free-ticket route), which can
-- realistically race within a few hundred ms of each other, letting two
-- callers both observe tickets_issued = false and both issue tickets.
--
-- claim_order_for_issuance() makes the check-and-flip atomic via a single
-- conditional UPDATE: only the caller whose UPDATE actually matches a row
-- (tickets_issued was still false) gets `true` back and proceeds to issue
-- tickets. Every other concurrent/duplicate caller gets `false` and takes
-- the existing "already issued" fallback path (retry email delivery, retry
-- points award) instead of re-inserting tickets.

CREATE OR REPLACE FUNCTION public.claim_order_for_issuance(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  UPDATE public.ticket_orders
  SET tickets_issued = true
  WHERE id = p_order_id
    AND payment_status = 'paid'
    AND tickets_issued = false
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_order_for_issuance(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_for_issuance(UUID) TO service_role;
