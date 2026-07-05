-- =========================================================
-- CATCH-UP FINAL: pastiin SEMUA kolom yang dipakai app ada di
-- tiap tabel. Project baru (scaffold Lovable) bentuknya beda-beda;
-- ini nambal semua sisanya sekaligus. Semua ADD COLUMN IF NOT EXISTS
-- + default aman → boleh dijalanin berkali-kali, ga ngerusak data.
-- Tabel-tabel target semuanya kosong (sudah diverifikasi).
-- =========================================================

-- pricing_schemes (kalau belum lengkap)
ALTER TABLE public.pricing_schemes
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS calc_type text,
  ADD COLUMN IF NOT EXISTS scheme_for text NOT NULL DEFAULT 'rider',
  ADD COLUMN IF NOT EXISTS effective_to date,
  ADD COLUMN IF NOT EXISTS params jsonb;

-- deduction_types (dipakai halaman Deductions)
ALTER TABLE public.deduction_types
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS installmentable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- rider_installments (cicilan potongan)
ALTER TABLE public.rider_installments
  ADD COLUMN IF NOT EXISTS installment_count int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS per_period_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- payroll_runs
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- payroll_details (hasil generate payroll per rider)
ALTER TABLE public.payroll_details
  ADD COLUMN IF NOT EXISTS run_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attendance_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incentive numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_earning numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_deduction numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_pay numeric(12,2) NOT NULL DEFAULT 0;

-- payroll_deductions (rincian potongan per detail payroll)
ALTER TABLE public.payroll_deductions
  ADD COLUMN IF NOT EXISTS detail_id uuid,
  ADD COLUMN IF NOT EXISTS installment_id uuid;

-- payslips
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS detail_id uuid,
  ADD COLUMN IF NOT EXISTS run_id uuid,
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;

-- refresh schema cache Supabase
NOTIFY pgrst, 'reload schema';
