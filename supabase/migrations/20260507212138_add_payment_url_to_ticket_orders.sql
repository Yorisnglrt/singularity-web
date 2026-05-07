-- Migration: Add payment_url to ticket_orders for recovery purposes
ALTER TABLE public.ticket_orders 
ADD COLUMN IF NOT EXISTS payment_url TEXT;
