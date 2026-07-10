-- invoice_details was defined in the original Lovable scaffold migration but never
-- actually got created on this project's live DB (confirmed missing 4 Jul 2026,
-- and again by "Could not find the table" error while wiring the client invoice
-- commit feature). CREATE TABLE IF NOT EXISTS so this is safe whether or not it
-- already exists elsewhere. Then add header fields (period range + status) needed
-- for "1 row = 1 client invoice per period", which the original shape didn't have
-- (only a single invoice_date).
CREATE TABLE IF NOT EXISTS public.invoice_details (
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

DROP POLICY IF EXISTS "Admins manage invoice_details" ON public.invoice_details;
CREATE POLICY "Admins manage invoice_details"
  ON public.invoice_details
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Riders view own invoice_details" ON public.invoice_details;
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

-- Header fields for "1 row = 1 client invoice per period" (commit from Hitung Fee).
ALTER TABLE public.invoice_details
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS scheme_name text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
