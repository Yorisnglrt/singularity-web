-- Migration: Normalize column names to snake_case
-- The old sync_schema migration created camelCase columns in quotes.
-- This migration adds proper snake_case columns and copies data over.

-- Add snake_case columns if they don't exist
ALTER TABLE events ADD COLUMN IF NOT EXISTS poster_image TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS poster_color TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_past BOOLEAN DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_url TEXT;

-- Copy data from camelCase columns to snake_case (if camelCase columns exist and have data)
DO $$
BEGIN
  -- posterImage -> poster_image
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='posterImage') THEN
    UPDATE events SET poster_image = "posterImage" WHERE "posterImage" IS NOT NULL AND (poster_image IS NULL OR poster_image = '');
  END IF;

  -- isFree -> is_free
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='isFree') THEN
    UPDATE events SET is_free = "isFree" WHERE "isFree" IS NOT NULL;
  END IF;

  -- isFeatured -> is_featured
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='isFeatured') THEN
    UPDATE events SET is_featured = "isFeatured" WHERE "isFeatured" IS NOT NULL;
  END IF;

  -- isPast -> is_past
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='isPast') THEN
    UPDATE events SET is_past = "isPast" WHERE "isPast" IS NOT NULL;
  END IF;

  -- ticketUrl -> ticket_url
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='ticketUrl') THEN
    UPDATE events SET ticket_url = "ticketUrl" WHERE "ticketUrl" IS NOT NULL AND (ticket_url IS NULL OR ticket_url = '');
  END IF;
END $$;
