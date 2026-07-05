-- =========================================================
-- Type E (attendance) engine butuh kolom `fee` di attendance_logs,
-- persis pola yang sama kayak delivery_records.fee — diisi lewat
-- Hitung Fee > Commit, lalu dipungut Payroll Run.
-- =========================================================
ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS fee numeric(12,2) NOT NULL DEFAULT 0;
