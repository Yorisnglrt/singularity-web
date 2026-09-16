-- Migration: 20260916130000_remove_redundant_ticket_type_policy.sql
-- Fixes info-disclosure bug: event_ticket_types had two permissive SELECT
-- policies -- "Public read active ticket types" (role anon, is_active=true)
-- and "Public read all ticket types" (role public, unconditional true).
-- RLS policies are OR'd together, so the second policy silently let anyone
-- (including unauthenticated requests) read inactive/draft ticket types via
-- PostgREST, even though the app's own public event page already filters on
-- is_active = true (src/app/events/[slug]/page.tsx). All legitimate access
-- to inactive ticket types goes through server routes using the
-- service-role client, which bypasses RLS entirely and is unaffected here.

DROP POLICY IF EXISTS "Public read all ticket types" ON public.event_ticket_types;
