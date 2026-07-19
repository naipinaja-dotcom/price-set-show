-- Opsi "tutup di hari yang sama" buat periode custom (lihat migration
-- 20260720000002_payroll_period_schedule.sql). Default (false) = tunggu 1
-- hari penuh setelah periode tutup baru dihitung besoknya (aman, gak perlu
-- tau apa datanya udah lengkap). Kalau true = dihitung PAS di hari terakhir
-- periode itu sendiri — cuma aman dipakai kalau ada cutoff operasional
-- reliable (mis. semua kiriman hari itu udah pasti selesai jam 17:00, sama
-- jamnya kayak cron sore Payroll Workflow) — lihat resolvePeriodIfDue di
-- src/lib/payroll-workflow.server.ts.
ALTER TABLE public.payroll_reminder_schedules
  ADD COLUMN close_same_day boolean NOT NULL DEFAULT false;
