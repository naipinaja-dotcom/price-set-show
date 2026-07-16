-- Insiden/anomali operasional mingguan yang dicatat manual oleh admin (bukan
-- dihitung otomatis) — jadi konteks kualitatif buat COO Insight Agents (lihat
-- coo_insight_reports di bawah) waktu analisis kenapa revenue/cost berubah.
CREATE TABLE public.coo_incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  week_end date NOT NULL,
  type text NOT NULL, -- 'operational', 'financial', 'system', 'market'
  description text NOT NULL,
  severity text NOT NULL, -- 'HIGH', 'MEDIUM', 'LOW'
  estimated_impact numeric, -- dalam IDR, boleh kosong kalau belum bisa diestimasi
  status text NOT NULL DEFAULT 'open', -- 'open', 'resolved', 'investigating'
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

GRANT ALL ON public.coo_incident_reports TO service_role;
ALTER TABLE public.coo_incident_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incidents admin all" ON public.coo_incident_reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_incidents_week ON public.coo_incident_reports (week_start DESC);

NOTIFY pgrst, 'reload schema';
