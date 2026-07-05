-- =========================================================
-- REBUILD pricing_schemes + subsistem payroll (semua KOSONG) biar
-- ilang kolom "sampah" bentukan Lovable yang NOT NULL (mis.
-- pricing_schemes.calculation_type, .config) yang bikin insert gagal.
-- deduction_types (6 baris) & clients (2 baris) TIDAK disentuh.
-- =========================================================

-- jaga-jaga kalau Lovable pernah revoke execute has_role
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

DROP TABLE IF EXISTS public.payslips CASCADE;
DROP TABLE IF EXISTS public.payroll_deductions CASCADE;
DROP TABLE IF EXISTS public.payroll_details CASCADE;
DROP TABLE IF EXISTS public.payroll_runs CASCADE;
DROP TABLE IF EXISTS public.rider_installments CASCADE;
DROP TABLE IF EXISTS public.pricing_schemes CASCADE;

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
CREATE POLICY "instl read self" ON public.rider_installments FOR SELECT TO authenticated
  USING (rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid()));

-- ---------- PAYROLL_RUNS ----------
CREATE TABLE public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  period_type text NOT NULL DEFAULT 'monthly',
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  finalized_at timestamptz,
  published_at timestamptz,
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
CREATE POLICY "slip read self" ON public.payslips FOR SELECT TO authenticated
  USING (rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid()));

NOTIFY pgrst, 'reload schema';
