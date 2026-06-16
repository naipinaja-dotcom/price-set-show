export type PricingCalcType =
  | "flat_per_awb_area"
  | "flat_per_awb_service_type"
  | "tier_distance_weight"
  | "km_accumulation_weight"
  | "unique_address"
  | "store_box_threshold";

export interface PricingTypeOption {
  key: PricingCalcType;
  shortKey: "area" | "service" | "tier" | "km" | "addr" | "box";
  name: string;
  desc: string;
  icon: string; // lucide icon name
  callout: string;
}

export const PRICING_TYPES: PricingTypeOption[] = [
  {
    key: "flat_per_awb_area",
    shortKey: "area",
    name: "Per Paket · Area",
    desc: "Tarif beda per wilayah",
    icon: "MapPin",
    callout:
      "Rider dibayar per paket yang diantar. Tarifnya bisa beda-beda tergantung area tujuan — misalnya Jakarta Pusat beda sama Bekasi.",
  },
  {
    key: "flat_per_awb_service_type",
    shortKey: "service",
    name: "Per Paket · Layanan",
    desc: "Tarif beda per tipe kiriman",
    icon: "Truck",
    callout:
      "Rider dibayar per paket, tarifnya beda berdasarkan tipe layanan — misalnya tarif delivery beda sama return.",
  },
  {
    key: "tier_distance_weight",
    shortKey: "tier",
    name: "Tier Jarak & Berat",
    desc: "Tarif naik per jarak/kg",
    icon: "Ruler",
    callout:
      "Tarif dihitung berdasarkan jarak dan berat paket. Makin jauh atau makin berat, makin besar bayarannya. Ada juga bonus per stop.",
  },
  {
    key: "km_accumulation_weight",
    shortKey: "km",
    name: "Akumulasi KM",
    desc: "Total KM harian + berat",
    icon: "Route",
    callout:
      "Total KM yang ditempuh rider dalam satu hari dijumlah. Ada tarif dasar, dan kelebihan dari batas tertentu dibayar per km tambahan.",
  },
  {
    key: "unique_address",
    shortKey: "addr",
    name: "Per Alamat Unik",
    desc: "Bayar per titik beda",
    icon: "Home",
    callout:
      "Rider dibayar per alamat unik yang dikunjungi — bukan per paket. Antar 3 paket ke 1 alamat = tetap dihitung 1.",
  },
  {
    key: "store_box_threshold",
    shortKey: "box",
    name: "Per Store · Box",
    desc: "Threshold box per toko",
    icon: "Package",
    callout:
      "Setiap toko punya batas box. Jika box melebihi batas, dihitung kelipatan. Contoh: threshold 4, antar 5 box = dihitung 2×.",
  },
];

export interface PricingScheme {
  id: string;
  name: string;
  client_id: string | null;
  client_name?: string | null;
  calc_type: PricingCalcType;
  effective_from: string;
  effective_to: string | null;
  config: Record<string, unknown>;
  created_at: string;
}
