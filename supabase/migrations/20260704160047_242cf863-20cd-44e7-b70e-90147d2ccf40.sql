
-- 1. clients: admin or rider assigned to that client
DROP POLICY IF EXISTS "clients read auth" ON public.clients;
CREATE POLICY "clients read admin or own"
  ON public.clients FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR id IN (SELECT client_id FROM public.riders WHERE user_id = auth.uid())
  );

-- 2. payroll_runs: admin only
DROP POLICY IF EXISTS "runs read auth" ON public.payroll_runs;
CREATE POLICY "runs read admin"
  ON public.payroll_runs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. attendance_rules: admin or rider whose client matches
DROP POLICY IF EXISTS "att_rules read auth" ON public.attendance_rules;
CREATE POLICY "att_rules read admin or own client"
  ON public.attendance_rules FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR client_id IN (SELECT client_id FROM public.riders WHERE user_id = auth.uid())
  );

-- 4. attendance_incentives: admin or rider whose client owns the parent rule
DROP POLICY IF EXISTS "incent read auth" ON public.attendance_incentives;
CREATE POLICY "incent read admin or own client"
  ON public.attendance_incentives FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR rule_id IN (
      SELECT ar.id FROM public.attendance_rules ar
      WHERE ar.client_id IN (SELECT client_id FROM public.riders WHERE user_id = auth.uid())
    )
  );

-- 5. deduction_types: admin only
DROP POLICY IF EXISTS "ded_types read auth" ON public.deduction_types;
CREATE POLICY "ded_types read admin"
  ON public.deduction_types FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 6. Restrict SECURITY DEFINER has_role execute privileges
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
