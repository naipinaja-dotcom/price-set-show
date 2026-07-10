-- Rider login: first time, the RIDER sets their own PIN (verified via
-- Kode Mitra + WhatsApp number, both already on file) instead of the admin
-- typing a PIN for them. This flag marks "login activated but rider hasn't
-- set their own PIN yet" — true right after admin activates/resets, false
-- once the rider completes first-time PIN setup.
ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS must_change_pin boolean NOT NULL DEFAULT false;
