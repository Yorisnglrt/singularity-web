-- 1. Create the atomic check-in function
CREATE OR REPLACE FUNCTION public.handle_qr_checkin(
  p_qr_token TEXT,
  p_event_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_profile_name TEXT;
  v_event_exists BOOLEAN;
BEGIN
  -- 1. Find profile by qr_token
  SELECT id, display_name 
  INTO v_profile_id, v_profile_name
  FROM public.profiles
  WHERE qr_token = p_qr_token;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'invalid_qr_token';
  END IF;

  -- 2. Check if event exists
  SELECT EXISTS(SELECT 1 FROM public.events WHERE id = p_event_id)
  INTO v_event_exists;

  IF NOT v_event_exists THEN
    RAISE EXCEPTION 'invalid_event_id';
  END IF;

  -- 3. Insert into event_checkins (atomicity start)
  -- Unique constraint (event_id, profile_id) will naturally throw an error on duplicates
  BEGIN
    INSERT INTO public.event_checkins (event_id, profile_id)
    VALUES (p_event_id, v_profile_id);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_checked_in';
  END;

  -- 4. Insert into points_log
  -- Trigger handle_points_log_insert will update profiles.points
  INSERT INTO public.points_log (profile_id, points_delta, type, description)
  VALUES (
    v_profile_id, 
    50, 
    'Event Attendance', 
    'QR check-in at event ' || p_event_id
  );

  -- 5. Return success
  RETURN json_build_object(
    'success', true,
    'profile_id', v_profile_id,
    'display_name', v_profile_name,
    'awarded', 50
  );
END;
$$;
