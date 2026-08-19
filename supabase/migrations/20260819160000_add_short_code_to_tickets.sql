-- Migration: Add short_code to tickets for simplified manual check-in & QR codes
-- Safe, backwards-compatible: existing tickets get backfilled, new ones generate on insert.

-- 1. Add the column (nullable for safe rollout)
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS short_code TEXT;

-- 2. Helper function to generate a 6-char code from the restricted alphabet
CREATE OR REPLACE FUNCTION public.generate_ticket_short_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ACDEFGHJKLMNPQRTUVWXY34679';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars))::int + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- 3. Backfill existing tickets with unique short codes
DO $$
DECLARE
  rec RECORD;
  new_code TEXT;
  done BOOLEAN;
BEGIN
  FOR rec IN SELECT id FROM public.tickets WHERE short_code IS NULL LOOP
    done := FALSE;
    WHILE NOT done LOOP
      new_code := public.generate_ticket_short_code();
      -- Check for uniqueness before updating (index not yet created)
      IF NOT EXISTS (SELECT 1 FROM public.tickets WHERE short_code = new_code) THEN
        UPDATE public.tickets SET short_code = new_code WHERE id = rec.id;
        done := TRUE;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- 4. Create unique index (after backfill guarantees no duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_short_code ON public.tickets(short_code);
