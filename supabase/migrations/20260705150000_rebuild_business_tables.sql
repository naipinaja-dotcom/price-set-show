-- =========================================================
-- REBUILD 4 tabel bisnis biar PAS 100% sama kode aplikasi.
-- Tabel-tabel ini di-scaffold Lovable dengan bentuk berbeda &
-- SEMUANYA KOSONG (0 baris) — jadi aman dibangun ulang.
-- `clients` (ada isinya) TIDAK disentuh.
-- Drop pakai CASCADE: konstraint FK dari payroll_details/
-- rider_installments/payslips/invoice_details ke tabel ini ikut
-- kehapus (tabelnya sendiri tetap ada & kosong).
-- =========================================================

DROP TABLE IF EXISTS public.delivery_records CASCADE;
DROP TABLE IF EXISTS public.attendance_logs CASCADE;
DROP TABLE IF EXISTS public.upload_batches CASCADE;
DROP TABLE IF EXISTS public.riders CASCADE;

-- ---------- RIDERS (identitas mandiri = employee_id/kode MTR) ----------
CREATE TABLE public.riders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  employee_id text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text, email text,
  client_id uuid REFERENCES public.clients ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  join_date date DEFAULT CURRENT_DATE,
  bank_name text, bank_account text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.riders TO authenticated;
GRANT ALL ON public.riders TO service_role;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "riders read self/admin" ON public.riders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR user_id = auth.uid());
CREATE POLICY "riders admin write" ON public.riders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------- UPLOAD_BATCHES ----------
CREATE TABLE public.upload_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  client_id uuid REFERENCES public.clients ON DELETE SET NULL,
  filename text,
  row_count int NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.upload_batches TO authenticated;
GRANT ALL ON public.upload_batches TO service_role;
ALTER TABLE public.upload_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "batches admin all" ON public.upload_batches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------- DELIVERY_RECORDS ----------
CREATE TABLE public.delivery_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.upload_batches ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients ON DELETE SET NULL,
  rider_id uuid REFERENCES public.riders ON DELETE SET NULL,
  driver_code text,
  delivery_date date NOT NULL,
  awb text, district text,
  distance_km numeric(10,2), weight_kg numeric(10,2),
  destination_address text, sender_name text, receiver_name text, service_type text,
  status text,
  dash_delivery_id text, provider_order_id text,
  delivery_type text CHECK (delivery_type IN ('DELIVERY','RETURN')),
  fee numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_records_date_idx ON public.delivery_records(delivery_date);
CREATE INDEX delivery_records_rider_idx ON public.delivery_records(rider_id);
CREATE INDEX delivery_records_client_idx ON public.delivery_records(client_id);
CREATE INDEX delivery_records_dash_idx ON public.delivery_records(dash_delivery_id);
CREATE INDEX delivery_records_provider_idx ON public.delivery_records(provider_order_id);
CREATE INDEX delivery_records_dtype_idx ON public.delivery_records(delivery_type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_records TO authenticated;
GRANT ALL ON public.delivery_records TO service_role;
ALTER TABLE public.delivery_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deliv read self/admin" ON public.delivery_records FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid()));
CREATE POLICY "deliv admin write" ON public.delivery_records FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------- ATTENDANCE_LOGS ----------
CREATE TABLE public.attendance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.upload_batches ON DELETE SET NULL,
  rider_id uuid REFERENCES public.riders ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients ON DELETE SET NULL,
  driver_code text, client_name text,
  log_date date NOT NULL, clock_in time, clock_out time,
  duration_minutes int,
  is_late boolean NOT NULL DEFAULT false,
  is_absent boolean NOT NULL DEFAULT false,
  fee numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendance_logs_date_idx ON public.attendance_logs(log_date);
CREATE INDEX attendance_logs_rider_idx ON public.attendance_logs(rider_id);
CREATE INDEX attendance_logs_client_idx ON public.attendance_logs(client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_logs TO authenticated;
GRANT ALL ON public.attendance_logs TO service_role;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "att_log read self/admin" ON public.attendance_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid()));
CREATE POLICY "att_log admin write" ON public.attendance_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
