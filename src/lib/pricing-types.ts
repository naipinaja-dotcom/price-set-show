export type PricingCalcType =
  | "flat_unit"
  | "tier"
  | "tier_daily"
  | "threshold_multiple"
  | "attendance";

export type SchemeFor = "rider" | "client";

export interface PricingTypeOption {
  key: PricingCalcType;
  name: string;
  desc: string;
  icon: string; // lucide icon name (lihat ICONS di pricing-form)
  callout: string;
}

export const PRICING_TYPES: PricingTypeOption[] = [
  {
    key: "flat_unit",
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
      "Tarif berjenjang. Ada tarif dasar untuk jarak/berat awal, lebihnya nambah per step. Bisa pakai jarak, berat, atau dua-duanya.",
  },
  {
    key: "tier_daily",
    name: "Akumulasi Harian",
    desc: "Jarak/berat 1 hari dijumlah",
    icon: "Route",
    callout:
      "Sama seperti Tier, tapi semua kiriman 1 rider dalam 1 hari dijumlah dulu (jarak/berat), baru dihitung tarifnya.",
  },
  {
    key: "threshold_multiple",
    name: "Threshold Kelipatan",
    desc: "Kelipatan berat per store",
    icon: "Package",
    callout:
      "Dikelompokkan per area/store. Berat total (kg) dibagi threshold lalu dibulatkan ke atas × rate. Contoh: threshold 10, total 23 kg → dihitung 3×.",
  },
  {
    key: "attendance",
    name: "Daily / Attendance",
    desc: "Base harian + komponen",
    icon: "CalendarDays",
    callout:
      "Bukan berdasarkan kiriman. Ada base fee harian + komponen tambahan (dinamai sendiri), sebagian bisa conditional. Fase terpisah — kriteria conditional belum final.",
  },
];

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
  calc_type: PricingCalcType;
  effective_from: string; // info saja, bukan logika kalkulasi
  effective_to: string | null;
  params: PricingEnvelope;
  created_at: string;
}
