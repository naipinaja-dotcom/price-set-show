-- =========================================================
-- delivery_records: tambah kolom `status`
-- Alasan: simpan SEMUA baris (COMPLETED / FAILED / dll) untuk kebutuhan
-- PnL & audit. Calculator engine hanya menghitung baris COMPLETED,
-- tapi data mentah lengkap tetap tersimpan.
-- Non-destruktif: kolom baru, nullable.
-- =========================================================
ALTER TABLE public.delivery_records
  ADD COLUMN IF NOT EXISTS status text;

CREATE INDEX IF NOT EXISTS delivery_records_status_idx
  ON public.delivery_records(status);
