-- Standarkan status rider sesuai daftar Mitra: Ready to Work, Active, Resign,
-- Blacklisted, Withdrawn, Suspend. "active" & "suspended" udah ada di enum
-- rider_status, tinggal nambah 4 value baru (ALTER TYPE ADD VALUE, idempotent
-- via DO block karena Postgres belum punya "ADD VALUE IF NOT EXISTS" versi lama).
DO $$
BEGIN
  ALTER TYPE public.rider_status ADD VALUE IF NOT EXISTS 'ready_to_work';
  ALTER TYPE public.rider_status ADD VALUE IF NOT EXISTS 'resign';
  ALTER TYPE public.rider_status ADD VALUE IF NOT EXISTS 'blacklisted';
  ALTER TYPE public.rider_status ADD VALUE IF NOT EXISTS 'withdrawn';
END $$;
