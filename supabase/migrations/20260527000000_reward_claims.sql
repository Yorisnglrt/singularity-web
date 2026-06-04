-- Migration: 20260527000000_reward_claims.sql

-- 1. Create reward_claims table
CREATE TABLE IF NOT EXISTS public.reward_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward_type TEXT NOT NULL,
  points_cost INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'used', 'cancelled', 'expired')),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  checkout_reference TEXT
);

ALTER TABLE public.reward_claims ENABLE ROW LEVEL SECURITY;

-- Setup RLS policy safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'reward_claims' AND policyname = 'Users can read own reward claims'
  ) THEN
    CREATE POLICY "Users can read own reward claims"
    ON public.reward_claims FOR SELECT TO authenticated
    USING (auth.uid() = profile_id);
  END IF;
END $$;

-- 2. Prevent duplicate active free tickets per user
CREATE UNIQUE INDEX IF NOT EXISTS reward_claims_one_active_free_ticket_per_user
ON public.reward_claims (profile_id, reward_type)
WHERE reward_type = 'free_ticket' AND status IN ('available', 'reserved');

-- 3. Update ticket_orders constraints to allow FREE_TICKET
ALTER TABLE public.ticket_orders DROP CONSTRAINT IF EXISTS ticket_orders_payment_method_type_check;
ALTER TABLE public.ticket_orders ADD CONSTRAINT ticket_orders_payment_method_type_check CHECK (payment_method_type IN ('WALLET', 'CARD', 'FREE_TICKET'));

ALTER TABLE public.ticket_orders DROP CONSTRAINT IF EXISTS ticket_orders_payment_provider_check;
ALTER TABLE public.ticket_orders ADD CONSTRAINT ticket_orders_payment_provider_check CHECK (payment_provider IN ('vipps', 'internal_reward'));

-- 4. RPC 1: Atomic Reward Claiming
CREATE OR REPLACE FUNCTION public.claim_reward(p_reward_type TEXT, p_points_cost INTEGER)
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
  v_claim_id UUID;
  v_existing_active UUID;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Safeguard: Lock down reward definitions (p_reward_type must be 'free_ticket' and cost must be 500)
  IF p_reward_type != 'free_ticket' OR p_points_cost != 500 THEN
    RAISE EXCEPTION 'Invalid reward';
  END IF;

  -- Lock the profile row to prevent race conditions during concurrent requests
  SELECT points INTO v_lifetime_points
  FROM public.profiles
  WHERE id = v_profile_id
  FOR UPDATE;

  -- 2. Safeguard: Handle missing profile explicitly
  IF v_lifetime_points IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Calculate claimed points from reward_claims where status in ('available', 'reserved', 'used')
  SELECT COALESCE(SUM(points_cost), 0) INTO v_claimed_points
  FROM public.reward_claims
  WHERE profile_id = v_profile_id
    AND status IN ('available', 'reserved', 'used');

  -- Calculate available reward points
  v_available_points := v_lifetime_points - v_claimed_points;

  IF v_available_points < p_points_cost THEN
    RAISE EXCEPTION 'Insufficient reward points';
  END IF;

  -- Check if user already has an active claim of this type (idempotency/protection)
  IF p_reward_type = 'free_ticket' THEN
    SELECT id INTO v_existing_active
    FROM public.reward_claims
    WHERE profile_id = v_profile_id 
      AND reward_type = 'free_ticket'
      AND status IN ('available', 'reserved')
    LIMIT 1;
      
    IF v_existing_active IS NOT NULL THEN
      RAISE EXCEPTION 'User already has an active free ticket claim';
    END IF;
  END IF;

  -- Log redemption (points_delta = 0)
  INSERT INTO public.points_log (profile_id, points_delta, type, description)
  VALUES (v_profile_id, 0, 'Reward Claim', 'Claimed Free Ticket (500 RP reward)');

  -- Create reward claim
  INSERT INTO public.reward_claims (profile_id, reward_type, points_cost, status)
  VALUES (v_profile_id, p_reward_type, p_points_cost, 'available')
  RETURNING id INTO v_claim_id;

  RETURN v_claim_id;
END;
$$;

-- 5. RPC 2: Atomic Reward Consumption & Order Creation
CREATE OR REPLACE FUNCTION public.use_free_ticket_reward(
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
  v_claim_id UUID;
  v_order_id UUID;
  v_order_reference TEXT;
  v_ticket_type_name TEXT;
  v_claim_token TEXT;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Find and lock exactly ONE available free ticket claim for the user
  SELECT id INTO v_claim_id
  FROM public.reward_claims
  WHERE profile_id = v_profile_id
    AND reward_type = 'free_ticket'
    AND status = 'available'
  FOR UPDATE LIMIT 1;

  IF v_claim_id IS NULL THEN
    RAISE EXCEPTION 'No available free ticket found';
  END IF;

  -- 2. Validate ticket type exists for the event
  SELECT name INTO v_ticket_type_name
  FROM public.event_ticket_types
  WHERE id = p_ticket_type_id AND event_id = p_event_id;

  IF v_ticket_type_name IS NULL THEN
    RAISE EXCEPTION 'Invalid ticket type or event';
  END IF;

  -- 3. Create the ticket_order row
  v_order_reference := 'SG-RW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_claim_token := gen_random_uuid()::text;

  INSERT INTO public.ticket_orders (
    order_reference, customer_email, customer_name, customer_phone,
    total_amount_nok, currency, sales_channel, payment_provider,
    payment_status, payment_method_type, profile_id,
    rave_points_earned, points_awarded, claim_token, metadata, paid_at
  )
  VALUES (
    v_order_reference, p_customer_email, p_customer_name, p_customer_phone,
    0, 'NOK', 'online', 'internal_reward',
    'paid', 'FREE_TICKET', v_profile_id,
    0, true, v_claim_token, '{}'::jsonb, now()
  )
  RETURNING id INTO v_order_id;

  -- 4. Create the ticket_order_items row
  INSERT INTO public.ticket_order_items (
    order_id, event_id, ticket_type_id, ticket_type_name,
    quantity, unit_price_nok, line_total_nok, is_supporter
  )
  VALUES (
    v_order_id, p_event_id, p_ticket_type_id, v_ticket_type_name,
    1, 0, 0, false
  );

  -- 5. Mark the reward claim as used
  UPDATE public.reward_claims
  SET status = 'used',
      used_at = now(),
      checkout_reference = v_order_reference
  WHERE id = v_claim_id;

  RETURN v_order_id;
END;
$$;
