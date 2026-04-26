-- =========================================
-- SINGULARITY — Payment Tables
-- =========================================

-- 1. Payment Rates (admin-managed catalogue)
CREATE TABLE IF NOT EXISTS public.payment_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NOK',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Payment Sessions
CREATE TABLE IF NOT EXISTS public.payment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code TEXT UNIQUE, -- generated via trigger
  member_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NOK',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Payment Session Items
CREATE TABLE IF NOT EXISTS public.payment_session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_session_id UUID NOT NULL REFERENCES public.payment_sessions(id) ON DELETE CASCADE,
  rate_id UUID REFERENCES public.payment_rates(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  unit_amount NUMERIC(10,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  line_total NUMERIC(10,2) GENERATED ALWAYS AS (unit_amount * quantity) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================
-- Trigger: auto-generate session_code on insert
-- =========================================
CREATE OR REPLACE FUNCTION public.generate_session_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.session_code IS NULL THEN
    NEW.session_code := 'PAY-' || UPPER(SUBSTR(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_payment_session_insert_code ON public.payment_sessions;
CREATE TRIGGER on_payment_session_insert_code
  BEFORE INSERT ON public.payment_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_session_code();

-- =========================================
-- Trigger: sync total_amount from items
-- =========================================
CREATE OR REPLACE FUNCTION public.sync_payment_session_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_session_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_session_id := OLD.payment_session_id;
  ELSE
    target_session_id := NEW.payment_session_id;
  END IF;

  UPDATE public.payment_sessions
  SET total_amount = COALESCE(
    (SELECT SUM(unit_amount * quantity) FROM public.payment_session_items WHERE payment_session_id = target_session_id),
    0
  )
  WHERE id = target_session_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_payment_item_change ON public.payment_session_items;
CREATE TRIGGER on_payment_item_change
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_session_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_payment_session_total();

-- =========================================
-- RLS: admin-only for payment_sessions and payment_session_items
-- =========================================
ALTER TABLE public.payment_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_session_items ENABLE ROW LEVEL SECURITY;

-- payment_rates: readable by all authenticated, writable by admin
CREATE POLICY "payment_rates_read" ON public.payment_rates
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "payment_rates_admin_write" ON public.payment_rates
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- payment_sessions: admin only
CREATE POLICY "payment_sessions_admin" ON public.payment_sessions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- payment_session_items: admin only
CREATE POLICY "payment_session_items_admin" ON public.payment_session_items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- =========================================
-- Seed: default payment rates
-- =========================================
INSERT INTO public.payment_rates (label, amount, currency, sort_order) VALUES
  ('Entry', 200.00, 'NOK', 1),
  ('Cloakroom', 50.00, 'NOK', 2),
  ('Drink Token', 100.00, 'NOK', 3)
ON CONFLICT DO NOTHING;

-- =========================================
-- RPC: atomic payment session creation
-- Auth: verifies caller is admin via profiles.is_admin
-- Validates: items non-empty array, quantities > 0, amounts >= 0
-- Creates session + items in one transaction.
-- Returns session id, session_code, total_amount (from DB after trigger sync).
-- On any failure: entire transaction rolls back automatically.
-- =========================================
CREATE OR REPLACE FUNCTION public.create_payment_session(
  p_currency TEXT,
  p_created_by UUID,
  p_member_profile_id UUID DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB
)
RETURNS TABLE(
  session_id UUID,
  session_code TEXT,
  total_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id UUID;
  v_session_code TEXT;
  v_total NUMERIC := 0;
  v_item JSONB;
  v_is_admin BOOLEAN;
  v_qty INTEGER;
  v_amt NUMERIC;
BEGIN
  -- ── Auth: verify caller is admin ──────────────────
  SELECT COALESCE(p.is_admin, FALSE) INTO v_is_admin
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  -- ── Validate: currency ────────────────────────────
  IF p_currency IS NULL OR BTRIM(p_currency) = '' THEN
    RAISE EXCEPTION 'Invalid input: currency is required';
  END IF;

  -- ── Validate: items is a non-empty JSON array ─────
  IF p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0
  THEN
    RAISE EXCEPTION 'Invalid input: items must be a non-empty array';
  END IF;

  -- ── Validate: each item ───────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::INTEGER;
    v_amt := (v_item->>'unit_amount')::NUMERIC;

    IF v_qty IS NULL OR v_qty < 1 THEN
      RAISE EXCEPTION 'Invalid input: quantity must be >= 1';
    END IF;

    IF v_amt IS NULL OR v_amt < 0 THEN
      RAISE EXCEPTION 'Invalid input: unit_amount must be >= 0';
    END IF;

    IF v_item->>'label' IS NULL OR BTRIM(v_item->>'label') = '' THEN
      RAISE EXCEPTION 'Invalid input: item label is required';
    END IF;
  END LOOP;

  -- ── 1. Insert session (session_code generated by BEFORE INSERT trigger) ──
  INSERT INTO public.payment_sessions (currency, status, created_by, member_profile_id)
  VALUES (BTRIM(p_currency), 'pending', p_created_by, p_member_profile_id)
  RETURNING id, payment_sessions.session_code INTO v_session_id, v_session_code;

  -- ── 2. Insert all items ───────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.payment_session_items (
      payment_session_id,
      rate_id,
      label,
      unit_amount,
      quantity
    ) VALUES (
      v_session_id,
      (v_item->>'rate_id')::UUID,
      BTRIM(v_item->>'label'),
      (v_item->>'unit_amount')::NUMERIC,
      (v_item->>'quantity')::INTEGER
    );
  END LOOP;

  -- ── 3. Read back DB-synced total (after AFTER INSERT trigger on items) ──
  SELECT ps.total_amount INTO v_total
  FROM public.payment_sessions ps
  WHERE ps.id = v_session_id;

  -- ── Return final values from DB ───────────────────
  RETURN QUERY SELECT v_session_id, v_session_code, v_total;
END;
$$;

-- Grant execute to authenticated role so frontend can call via supabase.rpc()
GRANT EXECUTE ON FUNCTION public.create_payment_session(TEXT, UUID, UUID, JSONB) TO authenticated;

