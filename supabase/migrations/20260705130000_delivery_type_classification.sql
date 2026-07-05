-- =========================================================
-- Klasifikasi Delivery vs Return, otomatis per client (adaptif,
-- tidak hardcode). "Titik pusat" (hub) = Sender Name yang paling
-- sering muncul buat client itu. Sender=hub -> DELIVERY,
-- Receiver=hub -> RETURN, dua-duanya ga cocok -> NULL (outlet-ke-
-- outlet, tetap kesimpen tapi ditandain perlu dicek).
-- =========================================================
ALTER TABLE public.delivery_records
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS delivery_type text;

DO $$ BEGIN
  ALTER TABLE public.delivery_records
    ADD CONSTRAINT delivery_records_delivery_type_check CHECK (delivery_type IN ('DELIVERY','RETURN'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS delivery_records_delivery_type_idx ON public.delivery_records(delivery_type);
