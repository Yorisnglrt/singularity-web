-- Migration: Add images column to event_broadcast_campaigns
ALTER TABLE public.event_broadcast_campaigns ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';
