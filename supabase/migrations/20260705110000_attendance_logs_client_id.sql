-- =========================================================
-- attendance_logs cuma nyimpen client_name (teks bebas dari CSV),
-- ga ke-link ke tabel clients. Akibatnya Payroll Run ga bisa milih
-- aturan absensi (attendance_rules) yang tepat per client -- dia
-- kepaksa nebak pakai client_id TETAP di rider, padahal 1 rider bisa
-- kerja di banyak client dgn aturan beda.
-- Fix: tambah kolom client_id (FK proper), diisi pas upload dgn
-- mencocokkan client_name ke nama client yang beneran ada.
-- client_name lama TETAP disimpan (audit/fallback), non-destruktif.
-- =========================================================
ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS attendance_logs_client_id_idx ON public.attendance_logs(client_id);
