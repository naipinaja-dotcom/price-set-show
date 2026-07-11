-- Histori hasil hitung PNL mingguan (Weekly PNL Push, C.5). Snapshot dibuat
-- oleh endpoint server /api/pnl-weekly-push (cron mingguan ATAU trigger
-- manual dari admin) — bukan dihitung ulang di halaman PNL yang sifatnya
-- on-demand. Tabel ini juga nyimpen status kirim per channel (Slack/Email)
-- biar ketauan kalau ada yang gagal kirim tanpa harus cek log server.
CREATE TABLE public.pnl_weekly_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  week_end date NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  total_revenue numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  total_margin numeric NOT NULL DEFAULT 0,
  total_margin_pct numeric NOT NULL DEFAULT 0,
  per_client jsonb NOT NULL DEFAULT '[]'::jsonb,
  push_status jsonb NOT NULL DEFAULT '{}'::jsonb, -- { slack: {ok, error?}, email: {ok, error?} }
  triggered_by text NOT NULL DEFAULT 'cron', -- 'cron' | 'manual'
  triggered_by_user uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.pnl_weekly_snapshots TO service_role;
ALTER TABLE public.pnl_weekly_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pnl snapshots admin all" ON public.pnl_weekly_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_pnl_weekly_snapshots_week ON public.pnl_weekly_snapshots (week_start DESC);

NOTIFY pgrst, 'reload schema';
