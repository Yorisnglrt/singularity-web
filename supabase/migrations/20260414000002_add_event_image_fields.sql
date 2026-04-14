-- Add dedicated event image columns: portrait poster and wide cover
ALTER TABLE events ADD COLUMN IF NOT EXISTS poster_vertical TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_wide TEXT;
