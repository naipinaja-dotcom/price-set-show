
-- 1. pricing_schemes.scheme_for (only if table exists; currently stored in localStorage, not DB)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pricing_schemes') THEN
    ALTER TABLE public.pricing_schemes
      ADD COLUMN IF NOT EXISTS scheme_for text NOT NULL DEFAULT 'rider';
    ALTER TABLE public.pricing_schemes
      DROP CONSTRAINT IF EXISTS pricing_schemes_scheme_for_check;
    ALTER TABLE public.pricing_schemes
      ADD CONSTRAINT pricing_schemes_scheme_for_check CHECK (scheme_for IN ('rider','client'));
  END IF;
END $$;

-- 2. delivery_records: dedupe id columns
ALTER TABLE public.delivery_records
  ADD COLUMN IF NOT EXISTS dash_delivery_id text,
  ADD COLUMN IF NOT EXISTS provider_order_id text;

CREATE INDEX IF NOT EXISTS delivery_records_dash_delivery_id_idx
  ON public.delivery_records (dash_delivery_id);
CREATE INDEX IF NOT EXISTS delivery_records_provider_order_id_idx
  ON public.delivery_records (provider_order_id);

-- 3. invoice_details (client revenue side, mirrors payroll_details)
CREATE TABLE public.invoice_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_batch_id uuid REFERENCES public.upload_batches(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  rider_id uuid REFERENCES public.riders(id) ON DELETE SET NULL,
  invoice_date date NOT NULL,
  calculation_type text,
  component_label text,
  base_amount numeric NOT NULL DEFAULT 0,
  surcharge_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  detail_breakdown jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_details TO authenticated;
GRANT ALL ON public.invoice_details TO service_role;

ALTER TABLE public.invoice_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage invoice_details"
  ON public.invoice_details
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Riders view own invoice_details"
  ON public.invoice_details
  FOR SELECT
  TO authenticated
  USING (
    rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS invoice_details_client_id_idx ON public.invoice_details (client_id);
CREATE INDEX IF NOT EXISTS invoice_details_rider_id_idx ON public.invoice_details (rider_id);
CREATE INDEX IF NOT EXISTS invoice_details_invoice_date_idx ON public.invoice_details (invoice_date);
CREATE INDEX IF NOT EXISTS invoice_details_upload_batch_id_idx ON public.invoice_details (upload_batch_id);
