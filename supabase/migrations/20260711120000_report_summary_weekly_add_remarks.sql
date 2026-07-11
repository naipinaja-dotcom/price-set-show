-- Fix: report_summary_weekly dibuat SEBELUM kolom payroll_details.remarks ada
-- (lihat 20260710140000 vs 20260710150000), jadi remarks ketinggalan di view.
-- Akibatnya finance-worksheet.tsx query langsung ke payroll_details, bukan
-- lewat view canonical source seperti seharusnya. Ditambahin di sini.
--
-- Catatan: nama view "weekly" menyesatkan — isinya 1 row per rider per
-- payroll run (grain sama seperti payroll_details), BUKAN agregat mingguan.
-- Dibiarkan apa adanya di migration ini supaya tidak mismatch sama nama yang
-- sudah dipakai di skill/dokumentasi; rename (kalau memang mau) sebaiknya
-- dilakukan bareng update dokumentasi, bukan diam-diam di sini.
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
  pd.net_pay,
  pd.remarks
FROM  public.payroll_details pd
JOIN  public.payroll_runs    pr ON pr.id = pd.run_id
LEFT JOIN public.riders      r  ON r.id  = pd.rider_id
LEFT JOIN public.clients     c  ON c.id  = pd.client_id;

GRANT SELECT ON public.report_summary_weekly TO authenticated;

NOTIFY pgrst, 'reload schema';
