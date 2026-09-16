-- Fix event_comments table: make event_id_legacy column optional (DROP NOT NULL)
-- This allows comments to be created using event_id UUID without requiring event_id_legacy.

ALTER TABLE public.event_comments ALTER COLUMN event_id_legacy DROP NOT NULL;
