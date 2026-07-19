-- Payroll Workflow (OES AI Workforce, payroll pertama) — histori run cron
-- mingguan (lihat src/lib/payroll-workflow.server.ts). SATU tabel log, sama
-- polanya persis dengan payroll_reminder_log/coo_insight_reports — sengaja
-- TIDAK ada workflow_configs/worker_executions terpisah, cuma ada 1 workflow
-- nyata sekarang, jadwal cron-nya cukup hardcode di migration cron (lihat
-- 20260720000001_payroll_workflow_cron.sql), bukan di-generic-kan di DB.

CREATE TABLE public.payroll_workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type text NOT NULL,                        -- 'cron' | 'manual' | 'event'
  triggered_by text NOT NULL,                        -- 'system-cron' | email admin
  status text NOT NULL,                               -- 'completed' | 'partial' | 'failed'
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,          -- {periodStart, periodEnd, runs: [...], skippedClients, notifyStatus}
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_workflow_runs TO authenticated;
GRANT ALL ON public.payroll_workflow_runs TO service_role;
ALTER TABLE public.payroll_workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll workflow runs admin all" ON public.payroll_workflow_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
