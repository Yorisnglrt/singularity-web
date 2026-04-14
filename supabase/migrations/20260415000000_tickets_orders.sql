-- Vipps Ticket Payment MVP
-- 1 order = 1 ticket, no multi-ticket support

-- Event config for internal ticket sales
ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_provider TEXT DEFAULT 'external';
ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_price_ore INTEGER;

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  event_id UUID NOT NULL REFERENCES events(id),
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'NOK',
  status TEXT DEFAULT 'CREATED',
  vipps_state TEXT,
  customer_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_reference ON orders(reference);

-- Tickets table (1 order = 1 ticket)
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID UNIQUE NOT NULL REFERENCES orders(id),
  event_id UUID NOT NULL REFERENCES events(id),
  ticket_code TEXT UNIQUE NOT NULL,
  qr_payload TEXT NOT NULL,
  holder_name TEXT,
  status TEXT DEFAULT 'VALID',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);
