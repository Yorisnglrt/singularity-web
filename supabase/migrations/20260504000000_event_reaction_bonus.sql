-- 1. Function to handle event reaction milestones and award Rave Points
CREATE OR REPLACE FUNCTION public.handle_event_reaction_bonus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    upcoming_reaction_count INTEGER;
    milestone_index INTEGER;
    max_awarded_milestone INTEGER;
    milestone_to_award INTEGER;
    current_event_is_past BOOLEAN;
BEGIN
    -- Only award points to authenticated users
    IF NEW.user_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- 1. Verify the current event being reacted to is upcoming
    -- We join by id or slug/legacy_id to support both UUID and slug-based matching
    SELECT is_past INTO current_event_is_past
    FROM public.events
    WHERE id = NEW.event_id OR slug = NEW.event_id_legacy;

    -- If event is past or not found, do not trigger bonus calculation
    IF current_event_is_past IS NULL OR current_event_is_past = true THEN
        RETURN NEW;
    END IF;

    -- 2. Count unique events reacted to by this user that are currently upcoming
    -- One event counts only once per user, regardless of action type (like/interested/attending)
    SELECT COUNT(DISTINCT er.event_id_legacy)
    INTO upcoming_reaction_count
    FROM public.event_reactions er
    JOIN public.events e ON (er.event_id = e.id OR er.event_id_legacy = e.slug)
    WHERE er.user_id = NEW.user_id
    AND e.is_past = false;

    -- 3. Calculate how many milestones should have been awarded
    -- milestone_index: 1 for 5 reactions, 2 for 10, etc.
    milestone_index := floor(upcoming_reaction_count / 5);

    IF milestone_index > 0 THEN
        -- 4. Find the highest milestone already awarded to this user
        -- Using strict description matching to identify specific milestones
        SELECT COALESCE(MAX(
            (substring(description FROM 'reacting to ([0-9]+) upcoming events'))::INTEGER
        ), 0)
        INTO max_awarded_milestone
        FROM public.points_log
        WHERE profile_id = NEW.user_id
        AND type = 'Activity Bonus'
        AND description LIKE 'Activity bonus for reacting to % upcoming events';

        -- 5. Award missing milestones (idempotent loop)
        FOR milestone_to_award IN 5.. (milestone_index * 5) BY 5 LOOP
            IF milestone_to_award > max_awarded_milestone THEN
                -- Insert into points_log (profiles.points is updated by existing trigger)
                INSERT INTO public.points_log (
                    profile_id,
                    points_delta,
                    type,
                    description
                ) VALUES (
                    NEW.user_id,
                    50,
                    'Activity Bonus',
                    'Activity bonus for reacting to ' || milestone_to_award || ' upcoming events'
                );
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

-- 2. Create the trigger on event_reactions
-- AFTER INSERT OR UPDATE ensures the check runs whenever a reaction is added or changed.
-- We do not award on DELETE, and we do not claw back points.
DROP TRIGGER IF EXISTS trg_event_reaction_bonus ON public.event_reactions;
CREATE TRIGGER trg_event_reaction_bonus
AFTER INSERT OR UPDATE ON public.event_reactions
FOR EACH ROW
EXECUTE FUNCTION public.handle_event_reaction_bonus();
