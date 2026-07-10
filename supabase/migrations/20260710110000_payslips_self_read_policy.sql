-- Rider self-read policy on payslips was dropped when MASTER_schema_reset
-- rebuilt the payroll tables (only "slip admin all" was recreated). Restore
-- it so a logged-in rider can see their own published slips.
DROP POLICY IF EXISTS "slip read self" ON public.payslips;
CREATE POLICY "slip read self" ON public.payslips FOR SELECT TO authenticated
  USING (rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid()));
