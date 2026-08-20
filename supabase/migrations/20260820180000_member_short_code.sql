-- ============================================================================
-- Migration: 20260820180000_member_short_code.sql
-- Description: Implement simplified 6-character membership short code system
-- 1. Add member_short_code column to public.profiles
-- 2. Create cryptographically secure & collision-safe short code generator
-- 3. Backfill all existing profiles with unique 6-character codes
-- 4. Apply format CHECK constraint and UNIQUE index
-- 5. Set member_short_code NOT NULL
-- 6. Update handle_profile_security_guard() to server-manage member_short_code
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Add member_short_code column (nullable for safe backfill)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS member_short_code TEXT;

-- ----------------------------------------------------------------------------
-- 2. Cryptographic Short Code Generator Functions (Alphabet: ACDEFGHJKLMNPQRTUVWXY34679)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_member_short_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  chars TEXT := 'ACDEFGHJKLMNPQRTUVWXY34679'; -- Length 26
  result TEXT := '';
  i INTEGER;
  byte_val INTEGER;
  raw_bytes BYTEA;
BEGIN
  -- Acquire CSPRNG bytes via extensions.gen_random_bytes or pg_catalog.gen_random_uuid
  BEGIN
    raw_bytes := extensions.gen_random_bytes(6);
  EXCEPTION WHEN OTHERS THEN
    raw_bytes := pg_catalog.decode(pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', ''), 'hex');
  END;

  FOR i IN 0..5 LOOP
    byte_val := pg_catalog.get_byte(raw_bytes, i);
    result := result || pg_catalog.substr(chars, (byte_val % 26) + 1, 1);
  END LOOP;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_member_short_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_member_short_code() TO service_role;

-- Concurrency-safe unique generator with advisory lock retry
CREATE OR REPLACE FUNCTION public.generate_unique_member_short_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_candidate TEXT;
  v_attempts INTEGER := 0;
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 100 THEN
      RAISE EXCEPTION 'failed_to_generate_unique_member_short_code_after_max_attempts';
    END IF;

    v_candidate := public.generate_member_short_code();

    -- Acquire transaction-level advisory lock on hash of candidate to prevent concurrent race conditions
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_candidate));

    -- Check if candidate exists in profiles table
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.member_short_code = v_candidate
    ) INTO v_exists;

    IF NOT v_exists THEN
      RETURN v_candidate;
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_unique_member_short_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_unique_member_short_code() TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Collision-Safe Backfill for Existing Profiles
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
  v_code TEXT;
BEGIN
  FOR rec IN SELECT id FROM public.profiles WHERE member_short_code IS NULL ORDER BY created_at ASC LOOP
    v_code := public.generate_unique_member_short_code();
    UPDATE public.profiles
    SET member_short_code = v_code
    WHERE id = rec.id;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Enforce Format CHECK Constraint & UNIQUE Index
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_member_short_code_format_check'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_member_short_code_format_check
      CHECK (member_short_code ~ '^[ACDEFGHJKLMNPQRTUVWXY34679]{6}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_member_short_code_idx ON public.profiles (member_short_code);

-- ----------------------------------------------------------------------------
-- 5. Set member_short_code NOT NULL
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ALTER COLUMN member_short_code SET NOT NULL;

-- ----------------------------------------------------------------------------
-- 6. Update handle_profile_security_guard() to server-manage member_short_code
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_profile_security_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_authenticated_non_admin BOOLEAN;
  v_trusted_email TEXT;
BEGIN
  -- Determine if the caller is an untrusted authenticated non-admin client
  v_is_authenticated_non_admin := (
    auth.role() = 'authenticated' 
    AND NOT public.is_admin()
  );

  IF TG_OP = 'INSERT' THEN
    -- System default initialization
    IF NEW.member_since IS NULL THEN
      NEW.member_since := pg_catalog.now();
    END IF;

    IF NEW.tier IS NULL THEN
      NEW.tier := 'Observer';
    END IF;

    IF NEW.qr_token IS NULL THEN
      NEW.qr_token := pg_catalog.gen_random_uuid();
    END IF;

    IF NEW.member_code IS NULL THEN
      NEW.member_code := 'SG-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', ''), 1, 8));
    END IF;

    -- Concurrency-safe unique member_short_code initialization
    IF NEW.member_short_code IS NULL THEN
      NEW.member_short_code := public.generate_unique_member_short_code();
    END IF;

    IF NEW.created_at IS NULL THEN
      NEW.created_at := pg_catalog.now();
    END IF;

    -- Marketing consent audit timestamps on INSERT
    IF NEW.marketing_consent = true THEN
      NEW.marketing_consent_at := pg_catalog.now();
      NEW.marketing_unsubscribed_at := NULL;
    ELSE
      NEW.marketing_consent := false;
      NEW.marketing_consent_at := NULL;
      NEW.marketing_unsubscribed_at := NULL;
    END IF;

    -- Enforce strict safety constraints on client-initiated INSERTs
    IF v_is_authenticated_non_admin THEN
      NEW.id := auth.uid();

      -- Derive email strictly from trusted Supabase Auth identity (JWT or auth.users)
      v_trusted_email := pg_catalog.coalesce(
        (auth.jwt() ->> 'email')::TEXT,
        (SELECT u.email::TEXT FROM auth.users u WHERE u.id = auth.uid())
      );

      -- Fail-closed: reject INSERT if trusted email cannot be derived
      IF v_trusted_email IS NULL OR v_trusted_email = '' THEN
        RAISE EXCEPTION 'unauthorized_profile_email';
      END IF;

      NEW.email := v_trusted_email;

      NEW.is_admin := false;
      NEW.points := 0;
      NEW.tier := 'Observer';
      NEW.qr_token := pg_catalog.gen_random_uuid();
      NEW.member_code := 'SG-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', ''), 1, 8));
      NEW.member_short_code := public.generate_unique_member_short_code();
      NEW.member_since := pg_catalog.now();
      NEW.created_at := pg_catalog.now();
    END IF;

    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Marketing consent audit timestamps management
    IF NEW.marketing_consent IS DISTINCT FROM OLD.marketing_consent THEN
      IF NEW.marketing_consent = true THEN
        NEW.marketing_consent_at := pg_catalog.now();
        NEW.marketing_unsubscribed_at := NULL;
      ELSE
        NEW.marketing_unsubscribed_at := pg_catalog.now();
      END IF;
    ELSE
      -- If consent did not change, non-admin cannot alter audit timestamps
      IF v_is_authenticated_non_admin THEN
        NEW.marketing_consent_at := OLD.marketing_consent_at;
        NEW.marketing_unsubscribed_at := OLD.marketing_unsubscribed_at;
      END IF;
    END IF;

    -- Non-admin client UPDATE protection: lock all privileged & server-managed columns
    IF v_is_authenticated_non_admin THEN
      NEW.id := OLD.id;
      NEW.email := OLD.email;
      NEW.is_admin := OLD.is_admin;
      NEW.points := OLD.points;
      NEW.tier := OLD.tier;
      NEW.qr_token := OLD.qr_token;
      NEW.member_code := OLD.member_code;
      NEW.member_short_code := OLD.member_short_code;
      NEW.member_since := OLD.member_since;
      NEW.created_at := OLD.created_at;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
