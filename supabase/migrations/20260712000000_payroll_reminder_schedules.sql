-- Payroll Disbursement Reminder (PRD.md §10 backlog #8 "Calendar Reminder")
-- Scope confirmed by product owner 2026-07-12: reminder soal jadwal disbursement
-- rider per client (bukan due-date generik) — banyak client, siklus bayar beda-beda,
-- Admin gampang lupa client/rider mana yang harus digaji hari itu.
--
-- Jadwal disimpan per baris, di-scope ke client, ke rider, ATAU keduanya sekaligus
-- (rider tertentu dari client tertentu) — minimal salah satu wajib diisi.
-- weekdays: array hari-dalam-minggu yang aktif, 0=Minggu .. 6=Sabtu (JS Date.getUTCDay()).

CREATE TABLE public.payroll_reminder_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  client_id uuid REFERENCES public.clients ON DELETE CASCADE,
  rider_id uuid REFERENCES public.riders ON DELETE CASCADE,
  weekdays smallint[] NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_reminder_schedules_scope_chk CHECK (client_id IS NOT NULL OR rider_id IS NOT NULL),
  CONSTRAINT payroll_reminder_schedules_weekdays_chk CHECK (
    array_length(weekdays, 1) > 0 AND weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_reminder_schedules TO authenticated;
GRANT ALL ON public.payroll_reminder_schedules TO service_role;
ALTER TABLE public.payroll_reminder_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll reminder schedules admin all" ON public.payroll_reminder_schedules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Histori pengiriman (dipakai buat tabel "10 histori terakhir" ala Weekly PNL Push,
-- BUKAN untuk dedup keras — cron & test-manual dua-duanya boleh nulis log kapan aja).
CREATE TABLE public.payroll_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_date date NOT NULL,
  due_clients jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{id, name}]
  due_riders jsonb NOT NULL DEFAULT '[]'::jsonb,    -- [{id, full_name, employee_id, client_name}]
  push_status jsonb NOT NULL,                       -- {slack:{ok,error?}, email:{ok,error?}}
  triggered_by text NOT NULL,                        -- 'cron' | 'manual'
  triggered_by_user uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_reminder_log TO authenticated;
GRANT ALL ON public.payroll_reminder_log TO service_role;
ALTER TABLE public.payroll_reminder_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll reminder log admin all" ON public.payroll_reminder_log FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
