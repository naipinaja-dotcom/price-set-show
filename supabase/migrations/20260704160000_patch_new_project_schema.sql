-- =========================================================
-- Patch buat project Supabase BARU (ndgwfiimcvcswxzmnwoh).
-- Project ini punya rangka tabel yang beda dari migration kita
-- sebelumnya (kemungkinan di-scaffold terpisah oleh Lovable).
-- Migration ini CUMA nambal 2 tabel yang AKTIF dipakai fitur
-- yang sudah jalan sekarang: delivery_records (Hitung Fee/Commit)
-- dan deduction_types (halaman Deductions).
-- Non-destruktif: semua ADD COLUMN IF NOT EXISTS, aman dijalankan
-- berkali-kali, tidak menghapus data/kolom yang sudah ada.
-- Belum menyentuh: pricing_schemes, pricing_scheme_params,
-- invoice_details, profiles, user_roles (belum dipakai aktif
-- oleh kode sekarang / butuh keputusan terpisah).
-- =========================================================

-- delivery_records: kolom yang dibutuhkan Hitung Fee & Commit
ALTER TABLE public.delivery_records
  ADD COLUMN IF NOT EXISTS fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_code text;

-- deduction_types: kolom yang dibutuhkan halaman Deductions
ALTER TABLE public.deduction_types
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS installmentable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
