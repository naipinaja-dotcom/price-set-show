-- Periode perhitungan payroll custom per client (beberapa client gajian 2x
-- seminggu dgn periode beda-beda, mis. Selasa-Kamis DAN Jumat-Senin) — nempel
-- di tabel Reminder Calendar yang udah ada (payroll_reminder_schedules) karena
-- itu emang tempat admin ngatur siklus per client, satu client bisa punya
-- banyak baris (1 baris = 1 periode). Nullable: kalau kosong, Payroll Workflow
-- (src/lib/payroll-workflow.server.ts) pakai default mingguan Senin-Minggu.
-- 0=Minggu..6=Sabtu, sama seperti kolom weekdays yang udah ada.

ALTER TABLE public.payroll_reminder_schedules
  ADD COLUMN period_start_weekday smallint,
  ADD COLUMN period_end_weekday smallint,
  ADD CONSTRAINT payroll_reminder_schedules_period_chk CHECK (
    (period_start_weekday IS NULL AND period_end_weekday IS NULL)
    OR (period_start_weekday BETWEEN 0 AND 6 AND period_end_weekday BETWEEN 0 AND 6)
  );
