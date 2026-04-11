-- Migration: Add country_code to artists table
ALTER TABLE artists ADD COLUMN IF NOT EXISTS country_code TEXT;
