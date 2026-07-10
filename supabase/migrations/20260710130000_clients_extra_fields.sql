-- Add contact detail columns to clients table.
-- Frontend admin.clients.tsx already references these fields;
-- this migration makes the DB schema match.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS address      text,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS phone        text;
