-- ============================================================================
-- Migration: 20260906000000_ticket_reservation.sql
-- Description: Atomic ticket reservation system to prevent overselling.
--   1. reserved_quantity column on event_ticket_types
--   2. reservation_released column on ticket_orders
--   3. reserve_pending_order RPC — atomic check-and-reserve
--   4. release_order_reservation RPC — idempotent release
--   5. reserve_pending_order_for_existing RPC — webhook backstop re-reserve
-- ============================================================================

-- Pending order TTL constant (15 minutes)
-- Used inside RPCs; change here to affect all callers.
-- DO NOT change without also updating PENDING_ORDER_TTL_MINUTES in TS code.

-- ----------------------------------------------------------------------------
-- 1. Schema additions
-- ----------------------------------------------------------------------------

ALTER TABLE public.event_ticket_types
  ADD COLUMN IF NOT EXISTS reserved_quantity INTEGER NOT NULL DEFAULT 0
  CHECK (reserved_quantity >= 0);

-- Idempotency flag: true once the reservation slot has been freed.
-- Prevents double-decrement when release_order_reservation is called multiple times.
ALTER TABLE public.ticket_orders
  ADD COLUMN IF NOT EXISTS reservation_released BOOLEAN NOT NULL DEFAULT false;

-- ----------------------------------------------------------------------------
-- 2. reserve_pending_order RPC
-- Atomically creates a pending order + reserves stock.
-- Called from create-pending-order/route.ts (service role).
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
  v_ttl_interval   INTERVAL := '15 minutes'::INTERVAL;
  v_tt             RECORD;
  v_expired_qty    INTEGER  := 0;
  v_new_reserved   INTEGER;
  v_available      INTEGER;
  v_order_id       UUID;
  v_expired_ids    UUID[];
BEGIN
  -- 1. Lock the ticket type row for the duration of this transaction.
  --    This is the primary concurrency guard.
  SELECT id, total_quantity, sold_quantity, reserved_quantity
  INTO v_tt
  FROM public.event_ticket_types
  WHERE id = p_ticket_type_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TICKET_TYPE_NOT_FOUND');
  END IF;

  -- 2. Compute expired_qty: pending reservations that have exceeded TTL
  --    and have not yet been released. We only subtract these — we do NOT
  --    overwrite reserved_quantity with a full recount, because
  --    reserve_pending_order_for_existing may have added non-pending
  --    (authorized) reservations that a pending-only count would miss.
  SELECT COALESCE(SUM(oi.quantity), 0)
  INTO v_expired_qty
  FROM public.ticket_order_items oi
  JOIN public.ticket_orders o ON o.id = oi.order_id
  WHERE oi.ticket_type_id = p_ticket_type_id
    AND o.payment_status = 'pending'
    AND o.created_at < pg_catalog.now() - v_ttl_interval
    AND o.reservation_released = false;

  -- 3. Collect IDs of expired orders for cleanup (fire-and-forget after check).
  SELECT pg_catalog.array_agg(o.id)
  INTO v_expired_ids
  FROM public.ticket_order_items oi
  JOIN public.ticket_orders o ON o.id = oi.order_id
  WHERE oi.ticket_type_id = p_ticket_type_id
    AND o.payment_status = 'pending'
    AND o.created_at < pg_catalog.now() - v_ttl_interval
    AND o.reservation_released = false;

  -- 4. Targeted reconcile: subtract only expired quantity, preserving
  --    any non-pending reservations (e.g. authorized re-reservations).
  v_new_reserved := GREATEST(0, v_tt.reserved_quantity - v_expired_qty);

  UPDATE public.event_ticket_types
  SET reserved_quantity = v_new_reserved
  WHERE id = p_ticket_type_id;

  -- 5. Capacity check using post-reconcile values.
  IF v_tt.total_quantity IS NOT NULL THEN
    v_available := v_tt.total_quantity - v_tt.sold_quantity - v_new_reserved;
    IF v_available < p_quantity THEN
      -- Clean up expired orders even on capacity failure (best-effort).
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

  -- 6. Cleanup expired orders (now safe to do; capacity check passed or unlimited).
  IF v_expired_ids IS NOT NULL THEN
    UPDATE public.ticket_orders
    SET payment_status = 'cancelled',
        reservation_released = true,
        updated_at = pg_catalog.now()
    WHERE id = ANY(v_expired_ids);
  END IF;

  -- 7. Insert the new pending order.
  INSERT INTO public.ticket_orders (
    order_reference,
    customer_email,
    customer_name,
    customer_phone,
    total_amount_nok,
    currency,
    sales_channel,
    payment_provider,
    payment_status,
    payment_method_type,
    profile_id,
    rave_points_earned,
    points_awarded,
    claim_token,
    metadata,
    reservation_released
  ) VALUES (
    p_order_reference,
    pg_catalog.lower(pg_catalog.btrim(p_customer_email)),
    pg_catalog.btrim(COALESCE(p_customer_name, '')),
    pg_catalog.btrim(COALESCE(p_customer_phone, '')),
    p_total_amount_nok,
    'NOK',
    'online',
    'vipps',
    'pending',
    COALESCE(p_payment_method, 'WALLET'),
    p_profile_id,
    p_rave_points_earned,
    false,
    p_claim_token,
    '{}'::JSONB,
    false   -- reservation not yet released
  )
  RETURNING id INTO v_order_id;

  -- 8. Insert the order item.
  INSERT INTO public.ticket_order_items (
    order_id,
    event_id,
    ticket_type_id,
    ticket_type_name,
    quantity,
    unit_price_nok,
    line_total_nok,
    is_supporter
  ) VALUES (
    v_order_id,
    p_event_id,
    p_ticket_type_id,
    p_ticket_type_name,
    p_quantity,
    p_unit_price_nok,
    p_total_amount_nok,
    p_is_supporter
  );

  -- 9. Increment reserved_quantity for this ticket type.
  UPDATE public.event_ticket_types
  SET reserved_quantity = reserved_quantity + p_quantity
  WHERE id = p_ticket_type_id;

  RETURN jsonb_build_object(
    'success',           true,
    'order_id',          v_order_id,
    'order_reference',   p_order_reference,
    'total_amount_nok',  p_total_amount_nok,
    'rave_points_earned', p_rave_points_earned,
    'claim_token',       p_claim_token
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_pending_order(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, NUMERIC, TEXT, UUID, UUID, TEXT, INTEGER, TEXT, NUMERIC, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_pending_order(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, NUMERIC, TEXT, UUID, UUID, TEXT, INTEGER, TEXT, NUMERIC, BOOLEAN) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. release_order_reservation RPC
-- Idempotent: skips if reservation_released = true.
-- Called from: cancel-order, vipps webhook (cancelled/failed), issueTicketsForOrder.
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
  -- Lock and read the order row atomically.
  SELECT id, reservation_released
  INTO v_order
  FROM public.ticket_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN; -- order doesn't exist, nothing to release
  END IF;

  IF v_order.reservation_released THEN
    RETURN; -- idempotent: already released, skip
  END IF;

  -- Fetch the reserved quantity from order items.
  SELECT COALESCE(SUM(oi.quantity), 0)
  INTO v_qty
  FROM public.ticket_order_items oi
  WHERE oi.order_id = p_order_id;

  -- Decrement reserved_quantity for each ticket type in this order.
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

  -- Mark as released (idempotency flag).
  UPDATE public.ticket_orders
  SET reservation_released = true
  WHERE id = p_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_order_reservation(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_reservation(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. reserve_pending_order_for_existing RPC
-- Used exclusively by the webhook capacity backstop (Gap 1).
-- Re-reserves stock for an order that was cancelled/expired but whose
-- Vipps payment succeeded. Capacity must still be available.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_pending_order_for_existing(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item   RECORD;
  v_tt     RECORD;
  v_available INTEGER;
BEGIN
  -- Fetch order item (single ticket type per order in current model).
  SELECT oi.ticket_type_id, oi.quantity
  INTO v_item
  FROM public.ticket_order_items oi
  WHERE oi.order_id = p_order_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_ITEMS_NOT_FOUND');
  END IF;

  -- Lock ticket type row.
  SELECT id, total_quantity, sold_quantity, reserved_quantity
  INTO v_tt
  FROM public.event_ticket_types
  WHERE id = v_item.ticket_type_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'TICKET_TYPE_NOT_FOUND');
  END IF;

  -- Capacity check.
  IF v_tt.total_quantity IS NOT NULL THEN
    v_available := v_tt.total_quantity - v_tt.sold_quantity - v_tt.reserved_quantity;
    IF v_available < v_item.quantity THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'CAPACITY_REACHED',
        'available', v_available
      );
    END IF;
  END IF;

  -- Re-reserve: increment reserved_quantity.
  UPDATE public.event_ticket_types
  SET reserved_quantity = reserved_quantity + v_item.quantity
  WHERE id = v_item.ticket_type_id;

  -- Mark the order's reservation as active again.
  UPDATE public.ticket_orders
  SET reservation_released = false
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_pending_order_for_existing(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_pending_order_for_existing(UUID) TO service_role;
