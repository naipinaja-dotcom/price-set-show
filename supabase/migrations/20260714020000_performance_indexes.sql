-- Index performance (PAGINATION-OPTIMIZATION-GUIDE.md) — hanya bagian yang
-- relevan ke skema aktual (dokumen aslinya refer ke tabel yang gak ada di
-- project ini: attendance_records, payroll_calculations, daily_payroll_summary,
-- pricing_scheme_attendance — semua diabaikan, itu bukan tabel kita).
--
-- Yang beneran jadi gap nyata:
-- 1. payroll_details & payroll_deductions SAMA SEKALI gak ada index selain PK,
--    padahal di-query terus tiap buka Payroll Run / Reports (run_id, detail_id).
-- 2. rider_installments gak ada index, di-query tiap generatePayrollDetails().
-- 3. delivery_records/attendance_logs cuma punya index 1-kolom terpisah untuk
--    client_id dan tanggal — query aslinya SELALU filter keduanya sekaligus
--    (lihat admin.calculate.tsx, payroll-generate.ts), jadi index gabungan
--    (client_id, tanggal) jauh lebih efisien daripada 2 index terpisah.

CREATE INDEX IF NOT EXISTS payroll_details_run_id_idx ON public.payroll_details (run_id);
CREATE INDEX IF NOT EXISTS payroll_deductions_detail_id_idx ON public.payroll_deductions (detail_id);
CREATE INDEX IF NOT EXISTS rider_installments_rider_id_idx ON public.rider_installments (rider_id);
CREATE INDEX IF NOT EXISTS rider_installments_active_due_idx ON public.rider_installments (active, next_deduction_date);

CREATE INDEX IF NOT EXISTS delivery_records_client_date_idx ON public.delivery_records (client_id, delivery_date);
CREATE INDEX IF NOT EXISTS attendance_logs_client_date_idx ON public.attendance_logs (client_id, log_date);

ANALYZE public.payroll_details;
ANALYZE public.payroll_deductions;
ANALYZE public.rider_installments;
ANALYZE public.delivery_records;
ANALYZE public.attendance_logs;
