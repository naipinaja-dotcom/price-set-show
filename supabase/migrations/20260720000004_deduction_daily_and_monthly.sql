-- Beresin desain deduction yang sempet ke-skip: deduction_types udah lama
-- punya kolom category/default_amount/trigger_frequency/is_active dari
-- iterasi desain sebelumnya, tapi kode aplikasi (payroll-generate.ts,
-- admin.deductions.tsx) gak pernah baca kolom-kolom itu sama sekali — cuma
-- pake code/active/auto_recurring/recurring_amount. Beberapa baris data juga
-- setengah keisi (code null, installmentable false padahal harusnya bisa
-- dicicil).
--
-- Fix di sini:
-- 1. Hapus duplikat "Biaya Admin" (nonaktif) — udah digantiin "Biaya_Admin"
--    (kode ADM) yang beneran aktif & bekerja di sistem baru.
-- 2. Lengkapi kode + installmentable buat SEWA/KASBON/RUSAK/KUOTA (case
--    sewa motor, kasbon, kerusakan barang, pinjaman kuota — semua "cicilan
--    opsional case-by-case", bukan auto_recurring).
-- 3. BPJS JKK: nyalain auto_recurring (trigger_frequency-nya udah bener
--    'monthly_once' dari dulu, cuma auto_recurring-nya belum pernah aktif).
-- 4. Buang kolom mati (category/default_amount/is_active) — TETAP pertahankan
--    trigger_frequency (dipake ulang buat gerbang "sekali per bulan per
--    rider lintas client" di payroll-generate.ts, bukan bikin kolom baru).
-- 5. rider_installments: mode 'daily' (sewa motor) — daily_rate x jumlah hari
--    KALENDER di periode itu (tetap kepotong walau rider gak jalan hari itu,
--    karena masih megang unit sewaannya) — beda dari mode 'fixed' (cicilan
--    lama, per_period_amount flat, berhenti setelah installment_count kali).
--    'daily' open-ended: gak ada total_amount/installment_count, aktif
--    sampai admin nonaktifin manual pas unit dikembaliin.

DELETE FROM public.deduction_types WHERE id = '939de54e-8ffe-46fd-b24e-0430cd3378ed';

UPDATE public.deduction_types SET code = 'SEWA', installmentable = true WHERE id = 'efa598c5-9e39-4531-967a-b706066f788e';
UPDATE public.deduction_types SET code = 'KASBON', installmentable = true WHERE id = '97758dd1-3d3f-42fc-8869-33c32749a332';
UPDATE public.deduction_types SET code = 'RUSAK', installmentable = true WHERE id = 'e412c2b0-7792-4fd8-a965-b320e5e61990';
UPDATE public.deduction_types SET code = 'KUOTA', installmentable = true WHERE id = 'bf5fa987-969c-4fc0-b8b1-541e5241888c';
UPDATE public.deduction_types SET code = 'BPJS', auto_recurring = true, recurring_amount = 16800 WHERE id = 'c6097b65-e236-446d-b192-526d9096388d';

ALTER TABLE public.deduction_types
  DROP COLUMN category,
  DROP COLUMN default_amount,
  DROP COLUMN is_active,
  ALTER COLUMN trigger_frequency SET DEFAULT 'every_payroll_run';
  -- CHECK constraint (trigger_frequency IN ('every_payroll_run','monthly_once'))
  -- udah ada dari migration lama, gak perlu ditambah ulang.

ALTER TABLE public.rider_installments
  ADD COLUMN mode text NOT NULL DEFAULT 'fixed' CHECK (mode IN ('fixed', 'daily')),
  ADD COLUMN daily_rate numeric,
  ALTER COLUMN total_amount DROP NOT NULL,
  ALTER COLUMN installment_count DROP NOT NULL,
  ALTER COLUMN per_period_amount DROP NOT NULL;
