-- Manual Rave Points per ticket type.
-- NULL = use default (Supporter 200, Early Bird 150, everything else 100 RP),
-- computed in src/lib/ravePoints.ts at order creation time.
-- Additive, nullable column: safe for existing rows and in-flight orders
-- (orders already store rave_points_earned at creation).
ALTER TABLE public.event_ticket_types
  ADD COLUMN IF NOT EXISTS rave_points INTEGER
  CHECK (rave_points IS NULL OR rave_points >= 0);

COMMENT ON COLUMN public.event_ticket_types.rave_points IS
  'RP awarded per ticket. NULL = default (Supporter 200, Early Bird 150, others 100).';
