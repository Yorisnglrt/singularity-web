-- 1. Ensure member_code is UNIQUE and has correct type
-- (Safely adding constraint if it doesn't exist)
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'profiles_member_code_key'
    ) THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_member_code_key UNIQUE (member_code);
    END IF;
END $$;

-- 2. Create the membership onboarding function
CREATE OR REPLACE FUNCTION public.handle_new_profile_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Initial Member Since (only if NEW is null)
  IF NEW.member_since IS NULL THEN
    NEW.member_since := NOW();
  END IF;

  -- Initial Tier (only if NEW is null)
  IF NEW.tier IS NULL THEN
    NEW.tier := 'Observer';
  END IF;

  -- Initial QR Token (only if NEW is null)
  IF NEW.qr_token IS NULL THEN
    NEW.qr_token := gen_random_uuid();
  END IF;

  -- Initial Member Code (only if NEW is null)
  -- Format: SG-XXXXXXXX (8 random hex chars from uuid)
  IF NEW.member_code IS NULL THEN
    NEW.member_code := 'SG-' || UPPER(SUBSTR(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8));
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Create the BEFORE INSERT trigger
-- (Drop if exists to avoid errors on reapplying)
DROP TRIGGER IF EXISTS on_profile_insert_membership ON public.profiles;
CREATE TRIGGER on_profile_insert_membership
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_profile_membership();

-- 4. Safe Backfill for existing NULL values
-- (Only update if the field is currently NULL)
UPDATE public.profiles
SET 
  tier = COALESCE(tier, 'Observer'),
  member_since = COALESCE(member_since, created_at, NOW()),
  qr_token = COALESCE(qr_token, gen_random_uuid()),
  member_code = COALESCE(member_code, 'SG-' || UPPER(SUBSTR(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8)))
WHERE 
  tier IS NULL OR 
  member_since IS NULL OR 
  qr_token IS NULL OR 
  member_code IS NULL;
