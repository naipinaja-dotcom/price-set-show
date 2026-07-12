// =========================================================
// Taksonomi baru (v2): 3 kategori, bukan 6 calc_type.
// Lihat docs/pricing-engine-v2-design.md §3/§4 untuk rasional lengkap.
//
// - `PricingCategory` + `subtype` = apa yang dipilih user di UI (2 level:
//   kategori dulu, baru sub-tipe kalau relevan) dan apa yang disimpan di
//   kolom `calc_type` tabel `pricing_schemes` (kolom fisik BELUM diubah,
//   lihat migration plan §7 — mapping ke/dari string lama dilakukan di
//   `pricing-store.ts` lewat `calcTypeToCategory` / `categoryToCalcType`).
// - `PricingCalcType` (union lama, 6 nilai) TETAP ADA tapi jadi detail
//   internal: `PricingEnvelope.type` masih memakainya persis seperti
//   sebelumnya, karena `pricing-calc.ts` (`calcScheme`, `calcHybridScheme`,
//   `calcAttendanceScheme`, `rate-card.ts`) mendispatch berdasarkan field
//   ini dan SENGAJA tidak disentuh di tahap ini. Konfig JSON di dalam
//   `params.config` juga tidak berubah bentuk sama sekali untuk semua
//   kategori (termasuk hybrid — lihat catatan di bawah `PricingEnvelope`).
// =========================================================

export type PricingCategory = "delivery" | "attendance" | "hybrid";
export type DeliverySubtype = "flat" | "tier" | "threshold";
// attendance tidak punya subtype. hybrid subtype SELALU "tier" untuk
// sekarang — calcHybridScheme() cuma mendukung order-fee berbasis tier
// (lihat docs/pricing-engine-v2-design.md §9, open question belum settle
// buat varian flat/threshold di hybrid), jadi UI tidak menawarkan pilihan
// lain di bawah kategori Kombinasi supaya tidak ada opsi yang keliatan
// valid tapi diam-diam salah hitung.
export type PricingSubtype = DeliverySubtype | null;

/** Union lama (6 calc_type) — detail internal, lihat komentar di atas. */
export type PricingCalcType =
  | "flat_unit"
  | "tier"
  | "tier_daily"
  | "threshold_multiple"
  | "attendance"
  | "combined";

export type SchemeFor = "rider" | "client";

export interface PricingCategoryOption {
  key: PricingCategory;
  name: string;
  desc: string;
  icon: string; // lucide icon name (lihat ICONS di pricing-form)
  callout: string;
}

export const PRICING_CATEGORIES: PricingCategoryOption[] = [
  {
    key: "delivery",
    name: "Per Pengiriman",
    desc: "Dibayar per kiriman",
    icon: "Truck",
    callout:
      "Fee dihitung dari data pengiriman (delivery_records). Pilih sub-tipe di bawah: Flat per Unit, Tier Jarak & Berat, atau Threshold Kelipatan.",
  },
  {
    key: "attendance",
    name: "Per Kehadiran",
    desc: "Base harian + komponen (± kiriman)",
    icon: "CalendarDays",
    callout:
      "Base fee harian proporsional jam kerja (dari data absensi) + insentif opsional. Toggle 'Komponen per kiriman' untuk tambah fee per pengiriman (menggantikan tipe Kombinasi lama).",
  },
  // "hybrid" tidak muncul di UI lagi — scheme lama tetap terbaca.
  // Skema baru pakai category "attendance" + delivery_component toggle.
];

export interface DeliverySubtypeOption {
  key: DeliverySubtype;
  name: string;
  desc: string;
  icon: string;
  callout: string;
}

export const DELIVERY_SUBTYPES: DeliverySubtypeOption[] = [
  {
    key: "flat",
    name: "Flat per Unit",
    desc: "Tarif per kiriman / alamat",
    icon: "MapPin",
    callout:
      "Dibayar per satuan. Satuannya bisa per paket (AWB) atau per alamat unik (3 paket ke 1 alamat = 1). Tarifnya boleh flat, atau beda-beda per area.",
  },
  {
    key: "tier",
    name: "Tier Jarak & Berat",
    desc: "Tarif naik per jarak/kg",
    icon: "Ruler",
    callout:
      "Tarif berjenjang. Ada tarif dasar untuk jarak/berat awal, lebihnya nambah per step. Bisa pakai jarak, berat, atau dua-duanya. Bisa juga diakumulasi per hari dulu (opsi di bawah) sebelum dihitung tarifnya.",
  },
  {
    key: "threshold",
    name: "Threshold Kelipatan",
    desc: "Kelipatan berat per store",
    icon: "Package",
    callout:
      "Dikelompokkan per area/store. Berat total (kg) dibagi threshold lalu dibulatkan ke atas × rate. Contoh: threshold 10, total 23 kg → dihitung 3×.",
  },
];

/** Label tampil gabungan kategori+subtype, dipakai di daftar/preview skema. */
export function pricingLabel(category: PricingCategory, subtype: PricingSubtype): string {
  if (category === "attendance") return "Daily / Attendance";
  if (category === "hybrid") return "Kombinasi (Daily + Per Order)";
  switch (subtype) {
    case "flat":
      return "Flat per Unit";
    case "tier":
      return "Tier Jarak & Berat";
    case "threshold":
      return "Threshold Kelipatan";
    default:
      return "Per Pengiriman";
  }
}

/**
 * Mapping DARI nilai `calc_type` lama (kolom fisik di tabel, belum
 * dimigrasi — lihat docs/pricing-engine-v2-design.md §7) KE {category,
 * subtype} yang dipakai UI/aplikasi. `tier` & `tier_daily` sama-sama jadi
 * subtype "tier" — bedanya (akumulasi per-order vs per-hari) direkonstruksi
 * dari `params.type` (envelope), bukan dari sini, karena config JSON tidak
 * berubah bentuk (prinsip desain §2/§4).
 */
export function calcTypeToCategory(calcType: string): { category: PricingCategory; subtype: PricingSubtype } {
  switch (calcType) {
    case "flat_unit":
      return { category: "delivery", subtype: "flat" };
    case "tier":
    case "tier_daily":
      return { category: "delivery", subtype: "tier" };
    case "threshold_multiple":
      return { category: "delivery", subtype: "threshold" };
    case "attendance":
      return { category: "attendance", subtype: null };
    case "combined":
      return { category: "hybrid", subtype: "tier" };
    default:
      return { category: "delivery", subtype: "flat" };
  }
}

// -------------------- Bentuk "amplop" params (envelope) --------------------
// Dipakai lintas tipe. Modifier nempel di luar `config` supaya bisa on/off
// tanpa ganggu isi tiap tipe. `null` = modifier mati.
export interface StepTier {
  base_fee: number;
  base_until: number;
  tiers: { from: number; to: number | null; step: number; add_per_step: number }[];
}

export interface AddKg {
  enabled: true;
  tier: StepTier;
}

export interface MultiDrop {
  fee_per_extra_shipment: number; // otomatis mulai kiriman ke-2 per rider per hari
}

export interface BillingAddons {
  min_charge: number;
  admin_fee_flat: number;
  ppn_percent: number;
}

// Bentuk `params` (envelope) TIDAK BERUBAH oleh redesign ini — termasuk
// untuk hybrid (dulu "combined"): `calcHybridScheme()` di pricing-calc.ts
// masih membaca `config` sebagai objek flat (full_fee/standard_minutes/
// ontime_bonus/order_by/order_tier), bukan bentuk delivery_config/
// attendance_config yang digambarkan di docs/pricing-engine-v2-design.md §4
// sebagai target akhir migrasi data — itu baru berlaku setelah migration
// script (§7) benar-benar jalan DAN pricing-calc.ts diupdate mengikutinya,
// keduanya di luar scope tahap ini (non-goal: jangan sentuh pricing-calc.ts
// atau database). `type` dipertahankan persis seperti semula karena jadi
// kunci dispatch internal `calcScheme()`.
export interface PricingEnvelope {
  version: number;
  type: PricingCalcType;
  config: Record<string, unknown>; // isi spesifik per tipe
  add_kg: AddKg | null;
  multi_drop: MultiDrop | null;
  billing_addons: BillingAddons | null; // hanya untuk scheme_for = 'client'
}

export interface PricingScheme {
  id: string;
  name: string;
  client_id: string | null;
  client_name?: string | null;
  scheme_for: SchemeFor;
  category: PricingCategory;
  subtype: PricingSubtype;
  effective_from: string; // info saja, bukan logika kalkulasi
  effective_to: string | null;
  params: PricingEnvelope;
  created_at: string;
}
