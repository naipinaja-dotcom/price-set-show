-- Insentif tambahan di luar skema pricing — line item ad-hoc per rider per
-- payroll run (mis. bonus referral, kompensasi kerusakan barang), diinput
-- manual admin di Payroll Run SEBELUM Finalize/Publish. Beda dari bonus
-- ontime dsb yang udah dihitung di dalam skema pricing (nempel ke
-- delivery_fee/attendance_fee) — ini murni penyesuaian di luar skema.
-- Sum dari tabel ini disimpan juga ke payroll_details.incentive (dan
-- ikut menaikkan gross_earning/net_pay) oleh app code, sama pola dengan
-- payroll_deductions -> total_deduction.
CREATE TABLE public.payroll_incentives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detail_id uuid REFERENCES public.payroll_details ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_incentives TO authenticated;
GRANT ALL ON public.payroll_incentives TO service_role;
ALTER TABLE public.payroll_incentives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pinc admin all" ON public.payroll_incentives FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
