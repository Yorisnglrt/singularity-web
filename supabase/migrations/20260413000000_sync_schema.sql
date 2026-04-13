-- Migration: Sync schema with application code
-- Date: 2026-04-13

-- Update events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS "isFree" BOOLEAN DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "isFeatured" BOOLEAN DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "posterImage" TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "ticketUrl" TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "isPast" BOOLEAN DEFAULT FALSE;

-- Update mixes table
ALTER TABLE mixes ADD COLUMN IF NOT EXISTS "soundcloudUrl" TEXT;
ALTER TABLE mixes ADD COLUMN IF NOT EXISTS "audioSrc" TEXT;

-- Refresh PostgREST schema cache (optional, happens automatically usually)
-- NOTIFY pgrst, 'reload schema';
