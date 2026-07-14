-- Audit trail untuk fee calculations (MASTER-SPEC-Payroll-System-Implementation.md
-- testing issue #4: "No audit trail untuk fee calculations"). Sebelum ini, commit()
-- di admin.calculate.tsx nulis `fee` langsung ke delivery_records/attendance_logs
-- tanpa jejak siapa yang commit, kapan, dan skema/config apa yang dipakai buat
-- hasil itu — gak bisa ditelusuri kalau nanti ada yang nanya "kenapa fee-nya segini".
CREATE TABLE IF NOT EXISTS public.fee_calculation_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,                    -- 'commit_payroll' | 'commit_invoice'
  client_id uuid REFERENCES public.clients ON DELETE SET NULL,
  scheme_id uuid REFERENCES public.pricing_schemes ON DELETE SET NULL,
  scheme_name text,
  scheme_snapshot jsonb NOT NULL,           -- params skema PERSIS PAS commit (bukan referensi hidup)
  period_start date NOT NULL,
  period_end date NOT NULL,
  row_count int NOT NULL,
  total_amount numeric(14,2) NOT NULL,
  committed_by uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.fee_calculation_audit_log TO authenticated;
GRANT ALL ON public.fee_calculation_audit_log TO service_role;
ALTER TABLE public.fee_calculation_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fee audit log admin all" ON public.fee_calculation_audit_log;
CREATE POLICY "fee audit log admin all" ON public.fee_calculation_audit_log FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS fee_audit_log_client_period_idx ON public.fee_calculation_audit_log (client_id, period_start, period_end);

NOTIFY pgrst, 'reload schema';
