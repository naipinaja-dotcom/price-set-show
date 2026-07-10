-- Remarks per rider per payroll run — diketik di halaman Reports (worksheet
-- finance), mis. "ayam rusak" / "potongan ev sisa 175k potong next payment".
-- Disimpan di payroll_details supaya ikut ke-download & ga ilang tiap buka ulang.
ALTER TABLE public.payroll_details
  ADD COLUMN IF NOT EXISTS remarks text;

NOTIFY pgrst, 'reload schema';
