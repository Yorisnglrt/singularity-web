-- Migration: 20260610230300_event_broadcast_campaigns.sql

-- Create event_broadcast_campaigns table if not exists
CREATE TABLE IF NOT EXISTS public.event_broadcast_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  campaign_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  auto_send_to_late_buyers BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index/constraint on event_id + campaign_key
CREATE UNIQUE INDEX IF NOT EXISTS event_broadcast_campaigns_event_id_campaign_key_idx
ON public.event_broadcast_campaigns (event_id, campaign_key);

-- Create event_broadcast_email_log table if not exists
CREATE TABLE IF NOT EXISTS public.event_broadcast_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  campaign_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Unique index on event_id + campaign_key + lower(trim(recipient_email))
CREATE UNIQUE INDEX IF NOT EXISTS event_broadcast_email_log_uniq_idx
ON public.event_broadcast_email_log (event_id, campaign_key, LOWER(TRIM(recipient_email)));

-- Enable RLS
ALTER TABLE public.event_broadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_broadcast_email_log ENABLE ROW LEVEL SECURITY;

-- Admin Policies for event_broadcast_campaigns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'event_broadcast_campaigns' AND policyname = 'Admins can do everything on event_broadcast_campaigns'
  ) THEN
    CREATE POLICY "Admins can do everything on event_broadcast_campaigns"
    ON public.event_broadcast_campaigns
    FOR ALL
    TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );
  END IF;
END $$;

-- Admin Policies for event_broadcast_email_log
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'event_broadcast_email_log' AND policyname = 'Admins can do everything on event_broadcast_email_log'
  ) THEN
    CREATE POLICY "Admins can do everything on event_broadcast_email_log"
    ON public.event_broadcast_email_log
    FOR ALL
    TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = TRUE)
    );
  END IF;
END $$;
