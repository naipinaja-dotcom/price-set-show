-- Kolom tambahan buat fitur "Reject" (salah pilih tanggal/client, udah keburu
-- commit) — reject nge-reset PERSIS baris yang kena commit ini balik ke
-- fee = 0, bukan nebak dari client+periode (biar gak nyenggol baris lain
-- yang gak terkait). calc_table nyimpen tabel mana yang di-update
-- (delivery_records / attendance_logs) — commit() attendance vs delivery
-- nulis ke tabel beda.
ALTER TABLE public.fee_calculation_audit_log
  ADD COLUMN IF NOT EXISTS calc_table text,
  ADD COLUMN IF NOT EXISTS affected_row_ids jsonb,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
