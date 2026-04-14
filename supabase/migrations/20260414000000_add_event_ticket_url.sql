-- Add ticket_url column to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_url TEXT;
