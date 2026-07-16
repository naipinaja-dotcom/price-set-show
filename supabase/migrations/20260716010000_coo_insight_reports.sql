-- Hasil analisis 4-tier COO Insight Agents (Worker -> Lead -> Manager -> COO)
-- dijalankan mingguan setelah Weekly PNL Push (lihat pnl_weekly_snapshots).
-- Model yang dipakai: Hermes (NousResearch) lewat OpenRouter — lihat
-- src/lib/agents/hermes-client.server.ts. Satu snapshot PNL cuma boleh punya
-- satu insight report (unique index di bawah) — generate ulang akan nimpa
-- (upsert onConflict pnl_snapshot_id) biar gak numpuk duplikat kalau re-run.
CREATE TABLE public.coo_insight_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  week_end date NOT NULL,

  pnl_snapshot_id uuid REFERENCES public.pnl_weekly_snapshots ON DELETE CASCADE,

  -- Output tiap agent (JSONB biar fleksibel, struktur lihat src/lib/agents/*.ts)
  worker_analysis jsonb NOT NULL,  -- wow_revenue_change, wow_cost_change, anomalies, worker_summary
  lead_analysis jsonb NOT NULL,    -- revenue_causes, cost_causes, forward_forecast, lead_summary
  manager_analysis jsonb NOT NULL, -- quick_wins, medium_term, manager_summary
  coo_analysis jsonb NOT NULL,     -- headline, top_concerns, top_actions, coo_brief

  generated_by text NOT NULL DEFAULT 'hermes',
  generated_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES auth.users ON DELETE SET NULL,
  approved_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.coo_insight_reports TO service_role;
ALTER TABLE public.coo_insight_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insights admin all" ON public.coo_insight_reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_insights_week ON public.coo_insight_reports (week_start DESC);
CREATE UNIQUE INDEX idx_insights_pnl_snapshot ON public.coo_insight_reports (pnl_snapshot_id);

NOTIFY pgrst, 'reload schema';
