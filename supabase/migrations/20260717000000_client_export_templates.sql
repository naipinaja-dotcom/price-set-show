-- Custom Export Template per Client (brainstorm point #2, 2026-07-17):
-- admin setup sekali kolom mana yang muncul di export "Ringkasan" Finance
-- Worksheet (src/components/finance-worksheet.tsx summaryRows()) untuk
-- client tertentu, reusable tiap export tanpa perlu setup ulang.
--
-- 1 baris per client (UNIQUE client_id) — kalau belum ada baris utk client
-- itu, aplikasi treat sebagai "semua kolom enabled" (backward compatible,
-- perilaku sama seperti sebelum fitur ini ada). Kolom yang valid didaftarkan
-- di src/lib/export-template.ts (EXPORT_COLUMNS), bukan di-enforce di DB
-- level supaya nambah kolom baru gak perlu migration lagi.
--
-- Dipakai HANYA saat payroll_runs.client_id ke-set (run 1 client) — run
-- "semua client" (client_id null) selalu pakai semua kolom karena satu
-- template gak bisa dipaksain ke beberapa client sekaligus dalam 1 tabel.

CREATE TABLE public.client_export_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients ON DELETE CASCADE,
  enabled_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_export_templates TO authenticated;
GRANT ALL ON public.client_export_templates TO service_role;
ALTER TABLE public.client_export_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client export templates admin all" ON public.client_export_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
