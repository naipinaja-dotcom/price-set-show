-- Catch-up migration: kolom rider tambahan (NIK, nama pemilik rekening, tgl/tempat
-- lahir) sempat ditambah Lovable AI langsung lewat DB tooling mereka tanpa migration
-- file (pola drift yang sama kayak sebelumnya). Ini nyatet ke repo biar reproducible
-- di environment lain. ADD COLUMN IF NOT EXISTS = aman diulang, non-destruktif.
ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS nik text,
  ADD COLUMN IF NOT EXISTS bank_account_holder text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS birth_place text;
