-- =========================================================
-- MASTER SCHEMA RESET — jalanin INI SATU aja, abaikan SQL sebelumnya.
-- Bikin SELURUH struktur tabel bisnis jadi PAS 100% sama kode app,
-- ga peduli kondisi sekarang. Idempotent (boleh diulang).
--
-- YANG PUNYA DATA (TIDAK di-drop, cuma ditambah kolom):
--   clients (2 baris), deduction_types (6 baris), profiles, user_roles
-- YANG KOSONG (di-drop & dibangun ulang bersih):
--   riders, upload_batches, pricing_schemes, delivery_records,
--   attendance_logs, rider_installments, payroll_runs,
--   payroll_details, payroll_deductions, payslips
-- =========================================================

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- ---------- PATCH tabel yang ADA DATANYA (additive) ----------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.deduction_types
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS installmentable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- ---------- DROP tabel kosong (urutan anak → induk) ----------
DROP TABLE IF EXISTS public.payslips CASCADE;
DROP TABLE IF EXISTS public.payroll_deductions CASCADE;
DROP TABLE IF EXISTS public.payroll_details CASCADE;
DROP TABLE IF EXISTS public.payroll_runs CASCADE;
DROP TABLE IF EXISTS public.rider_installments CASCADE;
DROP TABLE IF EXISTS public.attendance_logs CASCADE;
DROP TABLE IF EXISTS public.delivery_records CASCADE;
DROP TABLE IF EXISTS public.upload_batches CASCADE;
DROP TABLE IF EXISTS public.pricing_schemes CASCADE;
DROP TABLE IF EXISTS public.riders CASCADE;

-- ---------- RIDERS ----------
CREATE TABLE public.riders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  employee_id text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text, email text,
  client_id uuid REFERENCES public.clients ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  join_date date DEFAULT CURRENT_DATE,
  bank_name text, bank_account text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.riders TO authenticated;
GRANT ALL ON public.riders TO service_role;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "riders admin all" ON public.riders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "riders read self" ON public.riders FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------- UPLOAD_BATCHES ----------
CREATE TABLE public.upload_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  client_id uuid REFERENCES public.clients ON DELETE SET NULL,
  filename text, row_count int NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.upload_batches TO authenticated;
GRANT ALL ON public.upload_batches TO service_role;
ALTER TABLE public.upload_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "batches admin all" ON public.upload_batches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------- PRICING_SCHEMES ----------
CREATE TABLE public.pricing_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client_id uuid REFERENCES public.clients ON DELETE SET NULL,
  scheme_for text NOT NULL DEFAULT 'rider',
  calc_type text,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  params jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_schemes TO authenticated;
GRANT ALL ON public.pricing_schemes TO service_role;
ALTER TABLE public.pricing_schemes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing_schemes admin all" ON public.pricing_schemes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------- DELIVERY_RECORDS ----------
CREATE TABLE public.delivery_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.upload_batches ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients ON DELETE SET NULL,
  rider_id uuid REFERENCES public.riders ON DELETE SET NULL,
  driver_code text, delivery_date date NOT NULL,
  awb text, district text,
  distance_km numeric(10,2), weight_kg numeric(10,2),
  destination_address text, sender_name text, receiver_name text, service_type text,
  status text, dash_delivery_id text, provider_order_id text,
  delivery_type text CHECK (delivery_type IN ('DELIVERY','RETURN')),
  fee numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_records_date_idx ON public.delivery_records(delivery_date);
CREATE INDEX delivery_records_rider_idx ON public.delivery_records(rider_id);
CREATE INDEX delivery_records_client_idx ON public.delivery_records(client_id);
CREATE INDEX delivery_records_dash_idx ON public.delivery_records(dash_delivery_id);
CREATE INDEX delivery_records_prov_idx ON public.delivery_records(provider_order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_records TO authenticated;
GRANT ALL ON public.delivery_records TO service_role;
ALTER TABLE public.delivery_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deliv admin all" ON public.delivery_records FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "deliv read self" ON public.delivery_records FOR SELECT TO authenticated
  USING (rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid()));

-- ---------- ATTENDANCE_LOGS ----------
CREATE TABLE public.attendance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.upload_batches ON DELETE SET NULL,
  rider_id uuid REFERENCES public.riders ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients ON DELETE SET NULL,
  driver_code text, client_name text,
  log_date date NOT NULL, clock_in time, clock_out time,
  duration_minutes int,
  is_late boolean NOT NULL DEFAULT false,
  is_absent boolean NOT NULL DEFAULT false,
  fee numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendance_logs_date_idx ON public.attendance_logs(log_date);
CREATE INDEX attendance_logs_rider_idx ON public.attendance_logs(rider_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_logs TO authenticated;
GRANT ALL ON public.attendance_logs TO service_role;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "att admin all" ON public.attendance_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "att read self" ON public.attendance_logs FOR SELECT TO authenticated
  USING (rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid()));

-- ---------- RIDER_INSTALLMENTS ----------
CREATE TABLE public.rider_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES public.riders ON DELETE CASCADE,
  deduction_type_id uuid REFERENCES public.deduction_types,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  installment_count int NOT NULL DEFAULT 1,
  installments_paid int NOT NULL DEFAULT 0,
  per_period_amount numeric(12,2) NOT NULL DEFAULT 0,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  next_deduction_date date,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rider_installments TO authenticated;
GRANT ALL ON public.rider_installments TO service_role;
ALTER TABLE public.rider_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instl admin all" ON public.rider_installments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------- PAYROLL_RUNS ----------
CREATE TABLE public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  period_type text NOT NULL DEFAULT 'monthly',
  period_start date NOT NULL, period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  finalized_at timestamptz, published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs TO authenticated;
GRANT ALL ON public.payroll_runs TO service_role;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "runs admin all" ON public.payroll_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "runs read auth" ON public.payroll_runs FOR SELECT TO authenticated USING (true);

-- ---------- PAYROLL_DETAILS ----------
CREATE TABLE public.payroll_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.payroll_runs ON DELETE CASCADE,
  rider_id uuid REFERENCES public.riders ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients ON DELETE SET NULL,
  delivery_count int NOT NULL DEFAULT 0,
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
  attendance_fee numeric(12,2) NOT NULL DEFAULT 0,
  incentive numeric(12,2) NOT NULL DEFAULT 0,
  penalty numeric(12,2) NOT NULL DEFAULT 0,
  gross_earning numeric(12,2) NOT NULL DEFAULT 0,
  total_deduction numeric(12,2) NOT NULL DEFAULT 0,
  net_pay numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_details TO authenticated;
GRANT ALL ON public.payroll_details TO service_role;
ALTER TABLE public.payroll_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "det admin all" ON public.payroll_details FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "det read self" ON public.payroll_details FOR SELECT TO authenticated
  USING (rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid()));

-- ---------- PAYROLL_DEDUCTIONS ----------
CREATE TABLE public.payroll_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detail_id uuid REFERENCES public.payroll_details ON DELETE CASCADE,
  deduction_type_id uuid REFERENCES public.deduction_types,
  installment_id uuid REFERENCES public.rider_installments ON DELETE SET NULL,
  description text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_deductions TO authenticated;
GRANT ALL ON public.payroll_deductions TO service_role;
ALTER TABLE public.payroll_deductions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pded admin all" ON public.payroll_deductions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------- PAYSLIPS ----------
CREATE TABLE public.payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detail_id uuid UNIQUE REFERENCES public.payroll_details ON DELETE CASCADE,
  run_id uuid REFERENCES public.payroll_runs ON DELETE CASCADE,
  rider_id uuid REFERENCES public.riders ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payslips TO authenticated;
GRANT ALL ON public.payslips TO service_role;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "slip admin all" ON public.payslips FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

NOTIFY pgrst, 'reload schema';
