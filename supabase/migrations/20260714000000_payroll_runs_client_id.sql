-- Payroll Run sekarang bisa di-scope ke 1 client (bukan cuma periode generik).
-- Sebelum ini, admin harus Hitung Fee semua client dulu, tapi Payroll Run cuma
-- 1 kontainer besar per periode (nama "Payroll Juli 2026" doang, gak jelas
-- isinya client mana) — gak ada cara review per client sebelum finalize.
-- client_id NULL = run lama / run "semua client" (backward compatible,
-- generate() tetap jalan tanpa filter client seperti sebelumnya).
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payroll_runs_client_id_idx ON public.payroll_runs (client_id);

NOTIFY pgrst, 'reload schema';
