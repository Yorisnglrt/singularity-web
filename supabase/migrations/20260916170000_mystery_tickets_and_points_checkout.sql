-- ============================================================================
-- Migration: 20260916170000_mystery_tickets_and_points_checkout.sql
-- Description:
--   1. Mystery ticket lottery: admin sets how many units of a ticket type are
--      secretly free; buyers find out at checkout, not before.
--      - Fair, no-replacement draw: odds = remaining_free / remaining_available,
--        rolled per UNIT inside a multi-quantity order (capped at 1 free unit
--        per order) so buying more units at once gives no edge.
--      - Anti-abuse: exactly ONE attempt ever, per (profile, ticket_type),
--        enforced by a UNIQUE constraint + insert-before-roll pattern so
--        retrying/cancelling and re-attempting cannot re-roll.
--      - Requires a logged-in account older than 24h (blocks throwaway
--        accounts created purely to farm extra rolls).
--      - A won-but-unpaid mixed order (quantity > 1) releases its free slot
--        back to the pool if cancelled/expired, via release_order_reservation.
--   2. Combined points -> free ticket redemption in a single atomic step,
--      replacing the old two-step "claim on profile, then use at checkout"
--      flow. Also fixes reservation_released not being set on these
--      zero-reservation orders, which could otherwise let issueTicketsForOrder's
--      release_order_reservation() call steal a slot of reserved_quantity
--      belonging to an unrelated pending order for the same ticket type.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Schema additions
-- ----------------------------------------------------------------------------

ALTER TABLE public.event_ticket_types
  ADD COLUMN IF NOT EXISTS mystery_ticket_count INTEGER NOT NULL DEFAULT 0
  CHECK (mystery_ticket_count >= 0);

ALTER TABLE public.event_ticket_types
  ADD COLUMN IF NOT EXISTS mystery_tickets_awarded INTEGER NOT NULL DEFAULT 0
  CHECK (mystery_tickets_awarded >= 0);

-- One row per (profile, ticket_type) ever. The UNIQUE constraint is the
-- entire anti-abuse mechanism: a second attempt physically cannot be
-- recorded, so it physically cannot be rolled, no matter how many times
-- the order gets cancelled and retried.
CREATE TABLE IF NOT EXISTS public.mystery_ticket_attempts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ticket_type_id UUID NOT NULL REFERENCES public.event_ticket_types(id) ON DELETE CASCADE,
  event_id       UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  order_id       UUID REFERENCES public.ticket_orders(id) ON DELETE SET NULL,
  result         TEXT NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'win', 'lose')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mystery_ticket_attempts_one_per_user_per_type UNIQUE (profile_id, ticket_type_id)
);

ALTER TABLE public.mystery_ticket_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'mystery_ticket_attempts' AND policyname = 'Users can read own mystery attempts'
  ) THEN
    CREATE POLICY "Users can read own mystery attempts"
    ON public.mystery_ticket_attempts FOR SELECT TO authenticated
    USING (auth.uid() = profile_id);
  END IF;
END $$;

-- Public-facing winner display (nickname only, no PII). Populated by the
-- app after a won order is actually paid/confirmed.
CREATE TABLE IF NOT EXISTS public.mystery_ticket_winners (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ticket_type_id UUID NOT NULL REFERENCES public.event_ticket_types(id) ON DELETE CASCADE,
  order_id       UUID NOT NULL UNIQUE REFERENCES public.ticket_orders(id) ON DELETE CASCADE,
  nickname       TEXT NOT NULL CHECK (char_length(btrim(nickname)) BETWEEN 1 AND 24),
  won_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mystery_ticket_winners ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'mystery_ticket_winners' AND policyname = 'Anyone can read mystery winners'
  ) THEN
    CREATE POLICY "Anyone can read mystery winners"
    ON public.mystery_ticket_winners FOR SELECT
    USING (true);
  END IF;
END $$;
-- No INSERT/UPDATE policy: writes only happen via the service-role key from
-- the mystery-winner-nickname API route, which validates order ownership
-- and payment status before inserting.

-- ----------------------------------------------------------------------------
-- 2. reserve_pending_order — extended with the mystery roll.
--    Signature is UNCHANGED from 20260906000000_ticket_reservation.sql so no
--    caller needs to change how it invokes this function; new behaviour is
--    triggered purely server-side by ticket-type/profile state.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_pending_order(
  p_ticket_type_id     UUID,
  p_event_id           UUID,
  p_quantity           INTEGER,
  p_customer_email     TEXT,
  p_customer_name      TEXT,
  p_customer_phone     TEXT,
  p_total_amount_nok   NUMERIC,
  p_order_reference    TEXT,
  p_claim_token        UUID,
  p_profile_id         UUID,
  p_payment_method     TEXT,
  p_rave_points_earned INTEGER,
  p_ticket_type_name   TEXT,
  p_unit_price_nok     NUMERIC,
  p_is_supporter       BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ttl_interval    INTERVAL := '15 minutes'::INTERVAL;
  v_tt              RECORD;
  v_expired_qty     INTEGER  := 0;
  v_new_reserved    INTEGER;
  v_available       INTEGER;
  v_order_id        UUID;
  v_expired_ids     UUID[];

  -- Mystery roll state
  v_profile_created_at TIMESTAMPTZ;
  v_attempt_id         UUID;
  v_remaining_mystery  INTEGER;
  v_roll_available     INTEGER;
  v_free_units         INTEGER := 0;
  v_paid_units         INTEGER;
  v_points_per_unit    INTEGER;
  v_final_total_nok    NUMERIC;
  v_final_points       INTEGER;
  v_fully_free         BOOLEAN := false;
BEGIN
  -- 1. Lock the ticket type row for the duration of this transaction.
  SELECT id, total_quantity, sold_quantity, reserved_quantity,
         mystery_ticket_count, mystery_tickets_awarded
  INTO v_tt
  FROM public.event_ticket_types
  WHERE id = p_ticket_type_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TICKET_TYPE_NOT_FOUND');
  END IF;

  -- 2. Compute expired_qty (unchanged from prior version).
  SELECT COALESCE(SUM(oi.quantity), 0)
  INTO v_expired_qty
  FROM public.ticket_order_items oi
  JOIN public.ticket_orders o ON o.id = oi.order_id
  WHERE oi.ticket_type_id = p_ticket_type_id
    AND o.payment_status = 'pending'
    AND o.created_at < pg_catalog.now() - v_ttl_interval
    AND o.reservation_released = false;

  SELECT pg_catalog.array_agg(o.id)
  INTO v_expired_ids
  FROM public.ticket_order_items oi
  JOIN public.ticket_orders o ON o.id = oi.order_id
  WHERE oi.ticket_type_id = p_ticket_type_id
    AND o.payment_status = 'pending'
    AND o.created_at < pg_catalog.now() - v_ttl_interval
    AND o.reservation_released = false;

  -- 4. Targeted reconcile.
  v_new_reserved := GREATEST(0, v_tt.reserved_quantity - v_expired_qty);

  UPDATE public.event_ticket_types
  SET reserved_quantity = v_new_reserved
  WHERE id = p_ticket_type_id;

  -- 4.5 Release mystery awards held by orders that are about to be
  --     TTL-expired (a won-but-abandoned mixed order gives the slot back).
  IF v_expired_ids IS NOT NULL THEN
    UPDATE public.event_ticket_types ett
    SET mystery_tickets_awarded = GREATEST(0, ett.mystery_tickets_awarded - expired_wins.cnt)
    FROM (
      SELECT oi.ticket_type_id, COUNT(*) AS cnt
      FROM public.ticket_orders o
      JOIN public.ticket_order_items oi ON oi.order_id = o.id
      WHERE o.id = ANY(v_expired_ids)
        AND o.metadata->>'mystery_ticket_won' = 'true'
      GROUP BY oi.ticket_type_id
    ) expired_wins
    WHERE ett.id = expired_wins.ticket_type_id;

    -- Refresh our local snapshot of mystery_tickets_awarded in case this
    -- reconcile touched this exact ticket type (rare: only if a stale
    -- expired order for it exists at the same moment we're rolling).
    SELECT mystery_tickets_awarded INTO v_tt.mystery_tickets_awarded
    FROM public.event_ticket_types WHERE id = p_ticket_type_id;
  END IF;

  -- 4.6 Mystery roll — only for logged-in accounts older than 24h, only
  --     once ever per (profile, ticket_type), only when capacity is finite
  --     and mystery slots remain. Eligibility is decided entirely here,
  --     server-side; nothing about it is trusted from the caller.
  IF p_profile_id IS NOT NULL AND v_tt.total_quantity IS NOT NULL THEN
    v_remaining_mystery := v_tt.mystery_ticket_count - v_tt.mystery_tickets_awarded;

    IF v_remaining_mystery > 0 THEN
      SELECT created_at INTO v_profile_created_at
      FROM public.profiles WHERE id = p_profile_id;

      IF v_profile_created_at IS NOT NULL
         AND v_profile_created_at <= pg_catalog.now() - INTERVAL '24 hours' THEN

        -- Insert-before-roll: this is the entire anti-retry guarantee.
        -- If the (profile, ticket_type) row already exists, this attempt
        -- is skipped for good — no matter how many times they cancel and
        -- come back.
        INSERT INTO public.mystery_ticket_attempts (profile_id, ticket_type_id, event_id, result)
        VALUES (p_profile_id, p_ticket_type_id, p_event_id, 'pending')
        ON CONFLICT (profile_id, ticket_type_id) DO NOTHING
        RETURNING id INTO v_attempt_id;

        IF v_attempt_id IS NOT NULL THEN
          v_roll_available := v_tt.total_quantity - v_tt.sold_quantity - v_new_reserved;

          -- Fair no-replacement draw, one unit of the order at a time.
          -- Capped at 1 free unit per order regardless of quantity, and
          -- buying N units in one order gives exactly the same odds as
          -- buying them in N separate sequential orders would.
          FOR i IN 1..p_quantity LOOP
            EXIT WHEN v_roll_available <= 0 OR v_remaining_mystery <= 0;
            IF v_free_units = 0
               AND random() < (v_remaining_mystery::NUMERIC / v_roll_available::NUMERIC) THEN
              v_free_units := 1;
              v_remaining_mystery := v_remaining_mystery - 1;
            END IF;
            v_roll_available := v_roll_available - 1;
          END LOOP;

          UPDATE public.mystery_ticket_attempts
          SET result = CASE WHEN v_free_units > 0 THEN 'win' ELSE 'lose' END
          WHERE id = v_attempt_id;

          IF v_free_units > 0 THEN
            UPDATE public.event_ticket_types
            SET mystery_tickets_awarded = mystery_tickets_awarded + 1
            WHERE id = p_ticket_type_id;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  -- 5. Capacity check (unchanged; free units still occupy real inventory).
  IF v_tt.total_quantity IS NOT NULL THEN
    v_available := v_tt.total_quantity - v_tt.sold_quantity - v_new_reserved;
    IF v_available < p_quantity THEN
      IF v_expired_ids IS NOT NULL THEN
        UPDATE public.ticket_orders
        SET payment_status = 'cancelled',
            reservation_released = true,
            updated_at = pg_catalog.now()
        WHERE id = ANY(v_expired_ids);
      END IF;
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'CAPACITY_REACHED',
        'available', v_available
      );
    END IF;
  END IF;

  -- 6. Cleanup expired orders.
  IF v_expired_ids IS NOT NULL THEN
    UPDATE public.ticket_orders
    SET payment_status = 'cancelled',
        reservation_released = true,
        updated_at = pg_catalog.now()
    WHERE id = ANY(v_expired_ids);
  END IF;

  -- 6.5 Compute final pricing/points server-side from the roll outcome —
  --     never trust the caller's pre-computed totals for this, since they
  --     were computed before the roll happened.
  v_paid_units      := p_quantity - v_free_units;
  v_points_per_unit := CASE WHEN p_is_supporter THEN 200 ELSE 150 END;
  v_final_total_nok := v_paid_units * p_unit_price_nok;
  v_final_points    := v_paid_units * v_points_per_unit;
  v_fully_free      := (v_free_units > 0 AND v_paid_units = 0);

  -- 7. Insert the order.
  --    Fully-free orders (quantity=1 and won) are finalized as paid,
  --    zero-reservation, right here — no Vipps step needed.
  --    Mixed orders (quantity>1 and won) still go through the normal
  --    pending -> Vipps flow for the paid remainder, carrying a metadata
  --    flag so the free unit's slot can be released if the order is
  --    later cancelled/expires.
  INSERT INTO public.ticket_orders (
    order_reference, customer_email, customer_name, customer_phone,
    total_amount_nok, currency, sales_channel, payment_provider,
    payment_status, payment_method_type, profile_id,
    rave_points_earned, points_awarded, claim_token, metadata,
    reservation_released, paid_at
  ) VALUES (
    p_order_reference,
    pg_catalog.lower(pg_catalog.btrim(p_customer_email)),
    pg_catalog.btrim(COALESCE(p_customer_name, '')),
    pg_catalog.btrim(COALESCE(p_customer_phone, '')),
    v_final_total_nok,
    'NOK',
    'online',
    CASE WHEN v_fully_free THEN 'internal_reward' ELSE 'vipps' END,
    CASE WHEN v_fully_free THEN 'paid' ELSE 'pending' END,
    CASE WHEN v_fully_free THEN 'FREE_TICKET' ELSE COALESCE(p_payment_method, 'WALLET') END,
    p_profile_id,
    v_final_points,
    false,
    p_claim_token,
    CASE WHEN v_free_units > 0 THEN jsonb_build_object('mystery_ticket_won', true) ELSE '{}'::JSONB END,
    v_fully_free,  -- fully-free orders never reserve anything, so nothing to release later
    CASE WHEN v_fully_free THEN pg_catalog.now() ELSE NULL END
  )
  RETURNING id INTO v_order_id;

  -- 8. Insert order item(s): a free-unit row and/or a paid-units row.
  IF v_free_units > 0 THEN
    INSERT INTO public.ticket_order_items (
      order_id, event_id, ticket_type_id, ticket_type_name,
      quantity, unit_price_nok, line_total_nok, is_supporter
    ) VALUES (
      v_order_id, p_event_id, p_ticket_type_id, p_ticket_type_name,
      v_free_units, 0, 0, p_is_supporter
    );
  END IF;

  IF v_paid_units > 0 THEN
    INSERT INTO public.ticket_order_items (
      order_id, event_id, ticket_type_id, ticket_type_name,
      quantity, unit_price_nok, line_total_nok, is_supporter
    ) VALUES (
      v_order_id, p_event_id, p_ticket_type_id, p_ticket_type_name,
      v_paid_units, p_unit_price_nok, v_final_total_nok, p_is_supporter
    );
  END IF;

  -- 9. Reserve stock — skipped entirely for fully-free orders (nothing to
  --    hold for a non-existent payment step); full p_quantity for mixed
  --    orders, since the free unit still occupies inventory until paid.
  IF NOT v_fully_free THEN
    UPDATE public.event_ticket_types
    SET reserved_quantity = reserved_quantity + p_quantity
    WHERE id = p_ticket_type_id;
  END IF;

  -- 10. Link the attempt row to the resulting order, for auditability.
  IF v_attempt_id IS NOT NULL THEN
    UPDATE public.mystery_ticket_attempts SET order_id = v_order_id WHERE id = v_attempt_id;
  END IF;

  RETURN jsonb_build_object(
    'success',            true,
    'order_id',           v_order_id,
    'order_reference',    p_order_reference,
    'total_amount_nok',   v_final_total_nok,
    'rave_points_earned', v_final_points,
    'claim_token',        p_claim_token,
    'free_units',         v_free_units,
    'fully_free',         v_fully_free
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_pending_order(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, NUMERIC, TEXT, UUID, UUID, TEXT, INTEGER, TEXT, NUMERIC, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_pending_order(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, NUMERIC, TEXT, UUID, UUID, TEXT, INTEGER, TEXT, NUMERIC, BOOLEAN) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. release_order_reservation — extended to also release a held mystery
--    award when a won-but-unpaid mixed order is cancelled (manual cancel
--    path; the TTL auto-expiry path is handled inline in step 4.5 above).
--    Still fully idempotent via the same reservation_released guard.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_order_reservation(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order  RECORD;
  v_qty    INTEGER;
BEGIN
  SELECT id, reservation_released, metadata
  INTO v_order
  FROM public.ticket_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_order.reservation_released THEN
    RETURN; -- idempotent: already released (or never reserved), skip
  END IF;

  SELECT COALESCE(SUM(oi.quantity), 0)
  INTO v_qty
  FROM public.ticket_order_items oi
  WHERE oi.order_id = p_order_id;

  UPDATE public.event_ticket_types ett
  SET reserved_quantity = GREATEST(0, ett.reserved_quantity - oi_agg.qty)
  FROM (
    SELECT ticket_type_id, SUM(quantity) AS qty
    FROM public.ticket_order_items
    WHERE order_id = p_order_id
      AND ticket_type_id IS NOT NULL
    GROUP BY ticket_type_id
  ) oi_agg
  WHERE ett.id = oi_agg.ticket_type_id;

  -- Give back a held mystery slot if this order had won one and never paid.
  IF v_order.metadata->>'mystery_ticket_won' = 'true' THEN
    UPDATE public.event_ticket_types ett
    SET mystery_tickets_awarded = GREATEST(0, ett.mystery_tickets_awarded - 1)
    FROM public.ticket_order_items oi
    WHERE oi.order_id = p_order_id
      AND ett.id = oi.ticket_type_id;
  END IF;

  UPDATE public.ticket_orders
  SET reservation_released = true
  WHERE id = p_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_order_reservation(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_reservation(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. use_points_free_ticket — combined claim+use in one atomic step.
--    Replaces the old claim_reward (profile page) -> use_free_ticket_reward
--    (checkout) two-step flow. Callable directly from checkout the moment
--    the user has >= 500 spendable points; no pre-claim required.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.use_points_free_ticket(
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
  v_lifetime_points INTEGER;
  v_claimed_points INTEGER;
  v_available_points INTEGER;
  v_order_id UUID;
  v_order_reference TEXT;
  v_ticket_type_name TEXT;
  v_claim_token TEXT;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock the profile row to prevent a double-spend race (same guard as the
  -- old claim_reward).
  SELECT points INTO v_lifetime_points
  FROM public.profiles
  WHERE id = v_profile_id
  FOR UPDATE;

  IF v_lifetime_points IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  SELECT COALESCE(SUM(points_cost), 0) INTO v_claimed_points
  FROM public.reward_claims
  WHERE profile_id = v_profile_id
    AND status IN ('available', 'reserved', 'used');

  v_available_points := v_lifetime_points - v_claimed_points;

  IF v_available_points < 500 THEN
    RAISE EXCEPTION 'Insufficient reward points';
  END IF;

  SELECT name INTO v_ticket_type_name
  FROM public.event_ticket_types
  WHERE id = p_ticket_type_id AND event_id = p_event_id;

  IF v_ticket_type_name IS NULL THEN
    RAISE EXCEPTION 'Invalid ticket type or event';
  END IF;

  v_order_reference := 'SG-RW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_claim_token := gen_random_uuid()::text;

  INSERT INTO public.ticket_orders (
    order_reference, customer_email, customer_name, customer_phone,
    total_amount_nok, currency, sales_channel, payment_provider,
    payment_status, payment_method_type, profile_id,
    rave_points_earned, points_awarded, claim_token, metadata, paid_at,
    reservation_released
  )
  VALUES (
    v_order_reference, p_customer_email, p_customer_name, p_customer_phone,
    0, 'NOK', 'online', 'internal_reward',
    'paid', 'FREE_TICKET', v_profile_id,
    0, true, v_claim_token, '{}'::jsonb, now(),
    true  -- never reserved anything: fixes the release_order_reservation
          -- double-decrement risk the old use_free_ticket_reward had
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.ticket_order_items (
    order_id, event_id, ticket_type_id, ticket_type_name,
    quantity, unit_price_nok, line_total_nok, is_supporter
  )
  VALUES (
    v_order_id, p_event_id, p_ticket_type_id, v_ticket_type_name,
    1, 0, 0, false
  );

  -- Create the claim already in its final 'used' state — no separate
  -- 'available' step, no need for the person to visit their profile first.
  INSERT INTO public.reward_claims (profile_id, reward_type, points_cost, status, used_at, checkout_reference)
  VALUES (v_profile_id, 'free_ticket', 500, 'used', now(), v_order_reference);

  INSERT INTO public.points_log (profile_id, points_delta, type, description)
  VALUES (v_profile_id, 0, 'Reward Claim', 'Redeemed Free Ticket (500 RP) at checkout');

  RETURN v_order_id;
END;
$$;
