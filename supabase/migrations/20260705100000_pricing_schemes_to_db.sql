-- =========================================================
-- Pindahin penyimpanan pricing scheme dari localStorage ke DB.
-- pricing_schemes sudah ada (dengan effective_from/effective_to),
-- tinggal nambahin: calc_type, scheme_for, dan params (jsonb —
-- nyimpen 1 PricingEnvelope utuh per scheme, ga perlu tabel terpisah
-- karena relasinya 1:1).
-- Idempotent & non-destruktif.
-- =========================================================

ALTER TABLE public.pricing_schemes
  ADD COLUMN IF NOT EXISTS calc_type text,
  ADD COLUMN IF NOT EXISTS scheme_for text NOT NULL DEFAULT 'rider',
  ADD COLUMN IF NOT EXISTS params jsonb;

DO $$ BEGIN
  ALTER TABLE public.pricing_schemes
    ADD CONSTRAINT pricing_schemes_scheme_for_check CHECK (scheme_for IN ('rider','client'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.pricing_schemes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_schemes TO authenticated;
GRANT ALL ON public.pricing_schemes TO service_role;

DROP POLICY IF EXISTS "pricing_schemes admin all" ON public.pricing_schemes;
CREATE POLICY "pricing_schemes admin all" ON public.pricing_schemes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
