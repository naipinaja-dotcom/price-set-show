-- =========================================================
-- Potongan OTOMATIS tiap periode (mis. "Biaya Admin" flat per rider).
-- Ditandai di level deduction_types. Pas Payroll di-generate, tiap jenis
-- potongan yg auto_recurring & active dipotong flat ke SETIAP rider yg
-- punya penghasilan (gross > 0) di periode itu — tanpa perlu didaftarin
-- manual per rider (beda dari rider_installments yg manual/cicilan).
-- Non-destruktif: cuma nambah 2 kolom, aman dijalankan berulang.
-- =========================================================
ALTER TABLE public.deduction_types
  ADD COLUMN IF NOT EXISTS auto_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_amount numeric NOT NULL DEFAULT 0;
