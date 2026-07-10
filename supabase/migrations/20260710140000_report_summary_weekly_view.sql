-- Canonical source for all Finance & Report features.
-- Never query payroll_details directly from report pages —
-- always use this view so numbers stay consistent.
CREATE OR REPLACE VIEW public.report_summary_weekly AS
SELECT
  pd.id                 AS detail_id,
  pd.run_id,
  pr.name               AS run_name,
  pr.period_start,
  pr.period_end,
  pr.period_type,
  pr.status             AS run_status,
  pr.published_at       AS run_published_at,
  pd.rider_id,
  r.full_name           AS rider_name,
  r.employee_id         AS rider_employee_id,
  r.phone               AS rider_phone,
  r.bank_account,
  r.bank_account_holder,
  pd.client_id,
  c.code                AS client_code,
  c.name                AS client_name,
  pd.delivery_count,
  pd.delivery_fee,
  pd.attendance_fee,
  pd.incentive,
  pd.penalty,
  pd.gross_earning,
  pd.total_deduction,
  pd.net_pay
FROM  public.payroll_details pd
JOIN  public.payroll_runs    pr ON pr.id = pd.run_id
LEFT JOIN public.riders      r  ON r.id  = pd.rider_id
LEFT JOIN public.clients     c  ON c.id  = pd.client_id;

GRANT SELECT ON public.report_summary_weekly TO authenticated;

NOTIFY pgrst, 'reload schema';
