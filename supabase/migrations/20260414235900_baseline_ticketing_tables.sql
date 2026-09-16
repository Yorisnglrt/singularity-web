-- Migration: 20260414235900_baseline_ticketing_tables.sql
-- Documents the base schema for event_ticket_types, ticket_orders and
-- ticket_order_items as it exists in production today. These tables were
-- originally created out-of-band (Supabase dashboard/SQL editor), so no
-- CREATE TABLE for them existed anywhere in supabase/migrations/ -- only
-- later ALTER TABLE statements referencing them. That made it impossible to
-- audit their structure/constraints from the repo, or to reproduce this
-- schema in a fresh environment.
--
-- Reconstructed via information_schema/pg_constraint introspection against
-- the live database on 2026-09-16. Uses IF NOT EXISTS so it is a no-op
-- against the existing production database; it only matters for replaying
-- migration history from scratch (e.g. a new environment), which is why it
-- is dated before the first ALTER TABLE that touches these tables
-- (20260415000000_tickets_orders.sql) rather than at today's date.
--
-- NOTE: tickets.* itself predates this file too (see
-- 20260415000000_tickets_orders.sql for its legacy 1:1 shape) and has since
-- gained order_item_id/ticket_type_id/guest_code_id/short_code/access_token
-- via later ALTERs -- those are already tracked and are left alone here.

CREATE TABLE IF NOT EXISTS public.event_ticket_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  price_nok       INTEGER NOT NULL CHECK (price_nok >= 0),
  currency        TEXT NOT NULL DEFAULT 'NOK' CHECK (currency = 'NOK'),
  total_quantity  INTEGER CHECK (total_quantity IS NULL OR total_quantity >= 0),
  sold_quantity   INTEGER NOT NULL DEFAULT 0 CHECK (sold_quantity >= 0),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_supporter    BOOLEAN NOT NULL DEFAULT false,
  sale_starts_at  TIMESTAMPTZ,
  sale_ends_at    TIMESTAMPTZ,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_ticket_types_quantity_check CHECK (total_quantity IS NULL OR sold_quantity <= total_quantity)
);

CREATE TABLE IF NOT EXISTS public.ticket_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_reference       TEXT NOT NULL UNIQUE,
  customer_email        TEXT NOT NULL,
  customer_name         TEXT,
  customer_phone        TEXT,
  total_amount_nok      INTEGER NOT NULL CHECK (total_amount_nok >= 0),
  currency              TEXT NOT NULL DEFAULT 'NOK' CHECK (currency = 'NOK'),
  sales_channel         TEXT NOT NULL DEFAULT 'online' CHECK (sales_channel = 'online'),
  payment_provider      TEXT NOT NULL DEFAULT 'vipps' CHECK (payment_provider IN ('vipps', 'internal_reward')),
  payment_method_type   TEXT DEFAULT 'WALLET' CHECK (payment_method_type IN ('WALLET', 'CARD', 'FREE_TICKET')),
  payment_status        TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'authorized', 'paid', 'cancelled', 'failed', 'refunded', 'partially_refunded')),
  payment_url           TEXT,
  vipps_reference       TEXT,
  vipps_payment_id      TEXT,
  paid_at               TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  refunded_at           TIMESTAMPTZ,
  email_status          TEXT NOT NULL DEFAULT 'not_sent' CHECK (email_status IN ('not_sent', 'sent', 'failed')),
  email_sent_at         TIMESTAMPTZ,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_id            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  rave_points_earned    INTEGER NOT NULL DEFAULT 0 CHECK (rave_points_earned >= 0),
  points_awarded        BOOLEAN NOT NULL DEFAULT false,
  points_awarded_at     TIMESTAMPTZ,
  claim_token           TEXT UNIQUE,
  tickets_issued        BOOLEAN NOT NULL DEFAULT false,
  tickets_issued_at     TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES public.ticket_orders(id) ON DELETE CASCADE,
  event_id          UUID NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  ticket_type_id    UUID REFERENCES public.event_ticket_types(id) ON DELETE RESTRICT,
  guest_code_id     UUID REFERENCES public.event_guest_codes(id) ON DELETE SET NULL,
  ticket_type_name  TEXT NOT NULL,
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_nok    INTEGER NOT NULL CHECK (unit_price_nok >= 0),
  line_total_nok    INTEGER NOT NULL CHECK (line_total_nok >= 0),
  is_supporter      BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ticket_order_items_line_total_check CHECK (line_total_nok = quantity * unit_price_nok)
);
