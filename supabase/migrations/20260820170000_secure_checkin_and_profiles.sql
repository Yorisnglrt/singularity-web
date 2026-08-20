-- ============================================================================
-- Migration: 20260820170000_secure_checkin_and_profiles.sql
-- Description: Comprehensive security hardening based on independent security review
-- 1. Hardened is_admin() helper function (SET search_path = '')
-- 2. Hardened increment_guest_claimed_count() RPC restricted to service_role
-- 3. Removed unused handle_qr_checkin() function to eliminate attack surface
-- 4. Dedicated least-privilege public_profiles view (whitelisted columns only)
-- 5. Defense-in-depth permission revocation on public.profiles (no anon access)
-- 6. Strict RLS policies on public.profiles with explicit USING/WITH CHECK
-- 7. Unified BEFORE INSERT OR UPDATE trigger (handle_profile_security_guard)
--    binding profile email to trusted auth identity, preventing privilege escalation,
--    and managing audit timestamps
-- 8. One-time cryptographic rotation of all existing membership qr_token values
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper function: is_admin()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.coalesce(
    (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Secure and Harden increment_guest_claimed_count() RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_guest_claimed_count(p_guest_code_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.event_guest_codes
  SET claimed_count = claimed_count + 1,
      updated_at = pg_catalog.now()
  WHERE id = p_guest_code_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_guest_claimed_count(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_guest_claimed_count(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_guest_claimed_count(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_guest_claimed_count(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Remove Unused handle_qr_checkin() Function (Zero Application Callers)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.handle_qr_checkin(TEXT, UUID);

-- ----------------------------------------------------------------------------
-- 4. Dedicated Least-Privilege Public Profile View (public.public_profiles)
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.public_profiles CASCADE;

CREATE VIEW public.public_profiles
WITH (security_invoker = false)
AS
SELECT 
  p.id,
  p.display_name,
  p.avatar_url,
  p.bio,
  p.favorite_producer,
  p.favorite_track,
  p.favorite_subgenre,
  p.favorite_venue,
  p.favorite_festival,
  p.city,
  p.points,
  p.created_at,
  p.is_admin
FROM public.profiles p;

-- Grant select on public_profiles view to all roles
GRANT SELECT ON public.public_profiles TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Unified Profile Security Guard Trigger & Membership Handler
-- ----------------------------------------------------------------------------
-- Drop old membership trigger and function to unify into one single guard
DROP TRIGGER IF EXISTS on_profile_insert_membership ON public.profiles;
DROP FUNCTION IF EXISTS public.handle_new_profile_membership();

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

      IF v_trusted_email IS NULL OR v_trusted_email = '' THEN
        RAISE EXCEPTION 'unauthorized_profile_email';
      END IF;

      NEW.email := v_trusted_email;

      NEW.is_admin := false;
      NEW.points := 0;
      NEW.tier := 'Observer';
      NEW.qr_token := pg_catalog.gen_random_uuid();
      NEW.member_code := 'SG-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', ''), 1, 8));
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
      NEW.member_since := OLD.member_since;
      NEW.created_at := OLD.created_at;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_profile_security_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_profile_security_guard() FROM anon;
GRANT EXECUTE ON FUNCTION public.handle_profile_security_guard() TO authenticated, service_role;

DROP TRIGGER IF EXISTS on_profile_before_write ON public.profiles;
CREATE TRIGGER on_profile_before_write
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_security_guard();

-- ----------------------------------------------------------------------------
-- 6. Lock Down Table Permissions & RLS on public.profiles
-- ----------------------------------------------------------------------------
-- Revoke all direct permissions from anon
REVOKE ALL ON public.profiles FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.profiles FROM anon;

-- Grant controlled permissions to authenticated and service_role
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies on profiles
DROP POLICY IF EXISTS "Public Read Profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- 6a. SELECT Policies
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- 6b. INSERT Policy
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND COALESCE(is_admin, false) = false
  );

-- 6c. UPDATE Policies
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 7. Rotate All Existing Membership QR Tokens
-- ----------------------------------------------------------------------------
-- Invalidate all compromised/previously-exposed tokens with fresh random UUIDs
UPDATE public.profiles
SET qr_token = pg_catalog.gen_random_uuid();

-- Ensure unique index on qr_token
CREATE UNIQUE INDEX IF NOT EXISTS profiles_qr_token_idx ON public.profiles (qr_token);
