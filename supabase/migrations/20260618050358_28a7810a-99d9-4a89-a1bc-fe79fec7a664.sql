
CREATE TYPE public.app_role AS ENUM ('admin', 'rider');
CREATE TYPE public.rider_status AS ENUM ('active', 'inactive', 'pending_review', 'suspended');
CREATE TYPE public.payroll_status AS ENUM ('draft', 'finalized', 'published');
CREATE TYPE public.period_type AS ENUM ('weekly', 'biweekly', 'monthly');
CREATE TYPE public.upload_kind AS ENUM ('delivery', 'attendance');

CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- profiles + user_roles (tables only, policies later)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT, email TEXT, employee_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "profiles read self/admin" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles admin write" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "roles self read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "roles admin manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE has_admin BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'admin'::public.app_role) INTO has_admin;
  IF NOT has_admin THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin'::public.app_role);
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'rider'::public.app_role);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ BUSINESS TABLES ============
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  address TEXT, contact_person TEXT, phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients read auth" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "clients admin write" ON public.clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE SET NULL,
  employee_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL, phone TEXT, email TEXT,
  client_id UUID REFERENCES public.clients ON DELETE SET NULL,
  status public.rider_status NOT NULL DEFAULT 'active',
  join_date DATE DEFAULT CURRENT_DATE,
  bank_name TEXT, bank_account TEXT, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER riders_updated_at BEFORE UPDATE ON public.riders FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.riders TO authenticated;
GRANT ALL ON public.riders TO service_role;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "riders read self/admin" ON public.riders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR user_id = auth.uid());
CREATE POLICY "riders admin write" ON public.riders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.attendance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  client_id UUID REFERENCES public.clients ON DELETE CASCADE,
  clockin_time TIME NOT NULL DEFAULT '08:00',
  min_duration_minutes INT NOT NULL DEFAULT 480,
  late_tolerance_minutes INT NOT NULL DEFAULT 15,
  daily_base_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  late_penalty NUMERIC(12,2) NOT NULL DEFAULT 0,
  absent_penalty NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER attendance_rules_updated_at BEFORE UPDATE ON public.attendance_rules FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_rules TO authenticated;
GRANT ALL ON public.attendance_rules TO service_role;
ALTER TABLE public.attendance_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "att_rules read auth" ON public.attendance_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "att_rules admin write" ON public.attendance_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.attendance_incentives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.attendance_rules ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  condition TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_incentives TO authenticated;
GRANT ALL ON public.attendance_incentives TO service_role;
ALTER TABLE public.attendance_incentives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incent read auth" ON public.attendance_incentives FOR SELECT TO authenticated USING (true);
CREATE POLICY "incent admin write" ON public.attendance_incentives FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.upload_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.upload_kind NOT NULL,
  client_id UUID REFERENCES public.clients ON DELETE SET NULL,
  filename TEXT, row_count INT NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.upload_batches TO authenticated;
GRANT ALL ON public.upload_batches TO service_role;
ALTER TABLE public.upload_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "batches admin all" ON public.upload_batches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.delivery_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.upload_batches ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients ON DELETE SET NULL,
  rider_id UUID REFERENCES public.riders ON DELETE SET NULL,
  driver_code TEXT, delivery_date DATE NOT NULL,
  awb TEXT, district TEXT,
  distance_km NUMERIC(10,2), weight_kg NUMERIC(10,2),
  destination_address TEXT, receiver_name TEXT, service_type TEXT,
  fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX delivery_records_date_idx ON public.delivery_records(delivery_date);
CREATE INDEX delivery_records_rider_idx ON public.delivery_records(rider_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_records TO authenticated;
GRANT ALL ON public.delivery_records TO service_role;
ALTER TABLE public.delivery_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deliv read self/admin" ON public.delivery_records FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid()));
CREATE POLICY "deliv admin write" ON public.delivery_records FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.upload_batches ON DELETE SET NULL,
  rider_id UUID REFERENCES public.riders ON DELETE SET NULL,
  driver_code TEXT, client_name TEXT,
  log_date DATE NOT NULL, clock_in TIME, clock_out TIME,
  duration_minutes INT,
  is_late BOOLEAN NOT NULL DEFAULT false,
  is_absent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX attendance_logs_date_idx ON public.attendance_logs(log_date);
CREATE INDEX attendance_logs_rider_idx ON public.attendance_logs(rider_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_logs TO authenticated;
GRANT ALL ON public.attendance_logs TO service_role;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "att_log read self/admin" ON public.attendance_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid()));
CREATE POLICY "att_log admin write" ON public.attendance_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.deduction_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  description TEXT,
  installmentable BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deduction_types TO authenticated;
GRANT ALL ON public.deduction_types TO service_role;
ALTER TABLE public.deduction_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ded_types read auth" ON public.deduction_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "ded_types admin write" ON public.deduction_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.rider_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES public.riders ON DELETE CASCADE,
  deduction_type_id UUID NOT NULL REFERENCES public.deduction_types,
  total_amount NUMERIC(12,2) NOT NULL,
  installment_count INT NOT NULL DEFAULT 1,
  installments_paid INT NOT NULL DEFAULT 0,
  per_period_amount NUMERIC(12,2) NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  next_deduction_date DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER rider_installments_updated_at BEFORE UPDATE ON public.rider_installments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rider_installments TO authenticated;
GRANT ALL ON public.rider_installments TO service_role;
ALTER TABLE public.rider_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instl read self/admin" ON public.rider_installments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid()));
CREATE POLICY "instl admin write" ON public.rider_installments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  period_type public.period_type NOT NULL DEFAULT 'monthly',
  period_start DATE NOT NULL, period_end DATE NOT NULL,
  status public.payroll_status NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users ON DELETE SET NULL,
  finalized_at TIMESTAMPTZ, published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER payroll_runs_updated_at BEFORE UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs TO authenticated;
GRANT ALL ON public.payroll_runs TO service_role;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "runs read auth" ON public.payroll_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "runs admin write" ON public.payroll_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.payroll_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.payroll_runs ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES public.riders ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients ON DELETE SET NULL,
  delivery_count INT NOT NULL DEFAULT 0,
  delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  attendance_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  incentive NUMERIC(12,2) NOT NULL DEFAULT 0,
  penalty NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_earning NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, rider_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_details TO authenticated;
GRANT ALL ON public.payroll_details TO service_role;
ALTER TABLE public.payroll_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "det read self/admin" ON public.payroll_details FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid()));
CREATE POLICY "det admin write" ON public.payroll_details FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.payroll_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detail_id UUID NOT NULL REFERENCES public.payroll_details ON DELETE CASCADE,
  deduction_type_id UUID REFERENCES public.deduction_types,
  installment_id UUID REFERENCES public.rider_installments ON DELETE SET NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_deductions TO authenticated;
GRANT ALL ON public.payroll_deductions TO service_role;
ALTER TABLE public.payroll_deductions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pded read self/admin" ON public.payroll_deductions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR detail_id IN (SELECT id FROM public.payroll_details WHERE rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid())));
CREATE POLICY "pded admin write" ON public.payroll_deductions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detail_id UUID NOT NULL UNIQUE REFERENCES public.payroll_details ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.payroll_runs ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES public.riders ON DELETE CASCADE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payslips TO authenticated;
GRANT ALL ON public.payslips TO service_role;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "slip read self/admin" ON public.payslips FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid()));
CREATE POLICY "slip admin write" ON public.payslips FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
