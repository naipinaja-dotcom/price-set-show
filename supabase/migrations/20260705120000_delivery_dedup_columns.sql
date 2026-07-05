-- =========================================================
-- Kolom buat deteksi duplikat saat upload delivery: kunci duplikat =
-- Dash Delivery ID DAN Provider Order ID (dua-duanya harus sama).
-- Kalau cuma salah satu yang sama -> bukan duplikat, tapi anomali
-- yang perlu dicek manual (bukan di-skip otomatis).
-- =========================================================
ALTER TABLE public.delivery_records
  ADD COLUMN IF NOT EXISTS dash_delivery_id text,
  ADD COLUMN IF NOT EXISTS provider_order_id text;

CREATE INDEX IF NOT EXISTS delivery_records_dash_delivery_id_idx ON public.delivery_records(dash_delivery_id);
CREATE INDEX IF NOT EXISTS delivery_records_provider_order_id_idx ON public.delivery_records(provider_order_id);
