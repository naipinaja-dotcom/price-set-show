-- =========================================================
-- Lovable menyelipkan kolom `category` NOT NULL di deduction_types yang
-- tidak dikenal kode kita → insert jenis potongan gagal ("null value in
-- column category ... violates not-null constraint").
-- Fix: buat kolom itu boleh NULL (kalau memang ada). Idempotent & aman.
-- =========================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'deduction_types'
      AND column_name = 'category'
  ) THEN
    ALTER TABLE public.deduction_types ALTER COLUMN category DROP NOT NULL;
  END IF;
END $$;
