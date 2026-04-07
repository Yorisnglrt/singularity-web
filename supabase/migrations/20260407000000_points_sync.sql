-- 1. Create the function to update profile points (Secure version)
CREATE OR REPLACE FUNCTION public.handle_points_log_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET points = COALESCE(points, 0) + NEW.points_delta
  WHERE id = NEW.profile_id;

  RETURN NEW;
END;
$$;

-- 2. Create the trigger
DROP TRIGGER IF EXISTS on_points_log_insert ON public.points_log;
CREATE TRIGGER on_points_log_insert
AFTER INSERT ON public.points_log
FOR EACH ROW
EXECUTE FUNCTION public.handle_points_log_insert();

-- 3. Perform Backfill for existing records (Atomic & Coalesced)
UPDATE public.profiles p
SET points = (
  SELECT COALESCE(SUM(points_delta), 0)
  FROM public.points_log
  WHERE profile_id = p.id
);

-- Ensure profiles with no logs have 0 points instead of NULL
UPDATE public.profiles
SET points = 0
WHERE points IS NULL;
