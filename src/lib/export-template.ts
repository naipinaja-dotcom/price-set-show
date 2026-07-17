// Custom Export Template per Client — admin setup sekali kolom mana yang
// muncul di export "Ringkasan" Finance Worksheet, reusable tiap export.
// Lihat migration supabase/migrations/20260717000000_client_export_templates.sql
// dan pemakaian di src/components/finance-worksheet.tsx.
import { supabase } from "@/integrations/supabase/client";

// Tabel belum ikut proses auto-generate types Supabase (pola yang sama
// dipakai pricing_schemes — lihat komentar di pricing-store.ts) — pakai `sb`
// untyped khusus buat tabel ini.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface ExportColumnOption {
  key: string;
  label: string;
  desc: string;
}

// Kolom yang match 1:1 dengan header di summaryRows() finance-worksheet.tsx.
// "driver_name" SENGAJA tidak ada di sini — selalu tampil (identifier baris,
// export tanpa nama rider gak ada gunanya). "deductions" mewakili SEMUA
// kolom dedTypes (dinamis per periode) sebagai 1 toggle grup, bukan per nama
// potongan — nama potongan bisa beda tiap periode jadi gak bisa di-pin per key.
export const EXPORT_COLUMNS: ExportColumnOption[] = [
  { key: "employee_id", label: "Employee ID", desc: "Kode mitra/ID pegawai rider" },
  { key: "client", label: "Client", desc: "Nama client (kalau run mixed-client)" },
  { key: "order_count", label: "Order", desc: "Jumlah kiriman (COUNTA of Order)" },
  { key: "fee_rider", label: "Fee Rider", desc: "Fee kotor sebelum potongan" },
  { key: "active_date", label: "Active Date", desc: "Jumlah hari aktif kerja" },
  { key: "deductions", label: "Rincian Potongan", desc: "Semua kolom potongan per jenis (dinamis)" },
  { key: "total_fee", label: "Total Fee Order", desc: "Fee bersih setelah potongan" },
  { key: "remarks", label: "Remarks", desc: "Catatan admin per rider" },
];

export const ALL_EXPORT_COLUMN_KEYS = EXPORT_COLUMNS.map((c) => c.key);

/**
 * Ambil kolom yang enabled untuk client ini. Return `null` kalau belum ada
 * template disimpan (caller harus treat null = semua kolom, bukan array
 * kosong = gak ada kolom — biar client tanpa setup tetap keliatan lengkap
 * seperti sebelum fitur ini ada).
 */
export async function getClientExportTemplate(clientId: string): Promise<string[] | null> {
  const { data, error } = await sb
    .from("client_export_templates")
    .select("enabled_columns")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) {
    console.error("[getClientExportTemplate]", error);
    return null;
  }
  return data?.enabled_columns ?? null;
}

export async function saveClientExportTemplate(clientId: string, columns: string[]): Promise<void> {
  const { error } = await sb
    .from("client_export_templates")
    .upsert({ client_id: clientId, enabled_columns: columns, updated_at: new Date().toISOString() }, { onConflict: "client_id" });
  if (error) throw error;
}
