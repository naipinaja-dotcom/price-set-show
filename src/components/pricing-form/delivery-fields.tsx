// Kategori 1 — Per Pengiriman (flat / tier / threshold). Dipecah dari
// pricing-form.tsx per docs/pricing-engine-v2-design.md §6.
//
// Catatan penting: `accumulate` ("per_order" | "daily") sekarang jadi flag
// DI DALAM subtype "tier" (bukan subtype terpisah "tier_daily" lagi) sesuai
// §3 desain. Config JSON yang dikirim ke calcScheme() tetap identik dengan
// sebelumnya (tidak menyimpan `accumulate`) — bedanya direpresentasikan
// lewat `PricingEnvelope.type` ("tier" vs "tier_daily"), karena
// calcScheme() di pricing-calc.ts (tidak disentuh di tahap ini) masih
// mendispatch berdasarkan field itu persis seperti semula.
import { useState } from "react";
import type { DeliverySubtype, PricingCalcType } from "@/lib/pricing-types";
import { parseRupiah } from "@/lib/format";
import {
  AddRowBtn,
  FieldLabel,
  RupiahInput,
  StepTierEditor,
  Td,
  TableShell,
  TextInput,
  Th,
  RowDeleteBtn,
  ToggleBlock,
  emptyStepTier,
  buildStepTier,
  stepTierToState,
  type StepTierState,
} from "./shared";

export interface FlatUnitState {
  unit: "awb" | "unique_address";
  rate_by: "flat" | "column" | "delivery_type";
  match_column: string;
  flat_rate: string;
  default_rate: string;
  rates: { key: string; rate: string }[];
}

export interface TierState {
  distanceOn: boolean;
  distance: StepTierState;
  weightOn: boolean;
  weight: StepTierState;
  accumulate: "per_order" | "daily";
}

export interface ThresholdState {
  group_by: string;
  default_threshold: string;
  default_rate: string;
  rules: { key: string; threshold: string; rate: string }[];
}

export interface DeliveryState {
  flatUnit: FlatUnitState;
  tier: TierState;
  threshold: ThresholdState;
}

export function emptyDeliveryState(): DeliveryState {
  return {
    flatUnit: {
      unit: "awb",
      rate_by: "flat",
      match_column: "Area",
      flat_rate: "10000",
      default_rate: "10000",
      rates: [{ key: "Jakarta Pusat", rate: "10000" }],
    },
    tier: {
      distanceOn: true,
      distance: {
        base_fee: "13000",
        base_until: "5",
        tiers: [{ from: "5", to: "15", step: "1", add_per_step: "2000" }],
      },
      weightOn: false,
      weight: emptyStepTier(),
      accumulate: "per_order",
    },
    threshold: {
      group_by: "Area",
      default_threshold: "10",
      default_rate: "40000",
      rules: [{ key: "Store A", threshold: "4", rate: "12000" }],
    },
  };
}

export function buildDeliveryConfig(subtype: DeliverySubtype, d: DeliveryState): Record<string, unknown> {
  switch (subtype) {
    case "flat":
      return {
        unit: d.flatUnit.unit,
        rate_by: d.flatUnit.rate_by === "delivery_type" ? "column" : d.flatUnit.rate_by,
        match_column: d.flatUnit.rate_by === "delivery_type" ? "Delivery Type" : d.flatUnit.match_column,
        flat_rate: parseRupiah(d.flatUnit.flat_rate),
        default_rate: parseRupiah(d.flatUnit.default_rate),
        rates: d.flatUnit.rates.filter((r) => r.key.trim()).map((r) => ({ key: r.key.trim(), rate: parseRupiah(r.rate) })),
      };
    case "tier":
      return {
        distance: d.tier.distanceOn ? buildStepTier(d.tier.distance) : null,
        weight: d.tier.weightOn ? buildStepTier(d.tier.weight) : null,
        combine: "sum",
      };
    case "threshold":
      return {
        qty_source: "weight_kg",
        group_by: d.threshold.group_by,
        default: { threshold: Number(d.threshold.default_threshold) || 0, rate: parseRupiah(d.threshold.default_rate) },
        rules: d.threshold.rules.filter((r) => r.key.trim()).map((r) => ({ key: r.key.trim(), threshold: Number(r.threshold) || 0, rate: parseRupiah(r.rate) })),
      };
  }
}

/** Nilai `PricingEnvelope.type` yang harus dipakai — lihat catatan di atas. */
export function deliveryEnvelopeType(subtype: DeliverySubtype, d: DeliveryState): PricingCalcType {
  if (subtype === "flat") return "flat_unit";
  if (subtype === "threshold") return "threshold_multiple";
  return d.tier.accumulate === "daily" ? "tier_daily" : "tier";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadDeliveryState(subtype: DeliverySubtype, legacyType: PricingCalcType, c: any): DeliveryState {
  const state = emptyDeliveryState();
  if (subtype === "flat") {
    const isDeliveryType = c.rate_by === "column" && /delivery type/i.test(c.match_column ?? "");
    state.flatUnit = {
      unit: c.unit ?? "awb",
      rate_by: isDeliveryType ? "delivery_type" : (c.rate_by ?? "flat"),
      match_column: c.match_column ?? "Area",
      flat_rate: String(c.flat_rate ?? ""),
      default_rate: String(c.default_rate ?? ""),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rates: (c.rates ?? []).map((r: any) => ({ key: r.key ?? "", rate: String(r.rate ?? "") })),
    };
  } else if (subtype === "tier") {
    state.tier = {
      distanceOn: !!c.distance,
      distance: stepTierToState(c.distance),
      weightOn: !!c.weight,
      weight: stepTierToState(c.weight),
      accumulate: legacyType === "tier_daily" ? "daily" : "per_order",
    };
  } else if (subtype === "threshold") {
    state.threshold = {
      group_by: c.group_by ?? "Area",
      default_threshold: String(c.default?.threshold ?? ""),
      default_rate: String(c.default?.rate ?? ""),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rules: (c.rules ?? []).map((r: any) => ({ key: r.key ?? "", threshold: String(r.threshold ?? ""), rate: String(r.rate ?? "") })),
    };
  }
  return state;
}

export function DeliveryFields({ subtype, value, onChange }: { subtype: DeliverySubtype; value: DeliveryState; onChange: (v: DeliveryState) => void }) {
  const [tierSubtab, setTierSubtab] = useState<"distance" | "weight">("distance");

  if (subtype === "flat") {
    const f = value.flatUnit;
    const patch = (p: Partial<FlatUnitState>) => onChange({ ...value, flatUnit: { ...f, ...p } });
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Unit yang dihitung</FieldLabel>
            <select
              value={f.unit}
              onChange={(e) => patch({ unit: e.target.value as FlatUnitState["unit"] })}
              className="w-full text-sm rounded-md border border-border bg-card px-2.5 py-1.5"
            >
              <option value="awb">Per kiriman (AWB)</option>
              <option value="unique_address">Per alamat unik</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Cara tentukan tarif</FieldLabel>
            <select
              value={f.rate_by}
              onChange={(e) => patch({ rate_by: e.target.value as FlatUnitState["rate_by"] })}
              className="w-full text-sm rounded-md border border-border bg-card px-2.5 py-1.5"
            >
              <option value="flat">Flat (1 tarif untuk semua)</option>
              <option value="column">Beda per kolom (mis. Area)</option>
              <option value="delivery_type">Antar / Kembali</option>
            </select>
          </div>
        </div>

        {f.rate_by === "flat" ? (
          <div className="flex flex-col gap-1.5 max-w-xs">
            <FieldLabel>Flat Rate (Rp)</FieldLabel>
            <RupiahInput value={f.flat_rate} onChange={(v) => patch({ flat_rate: v })} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {f.rate_by === "delivery_type" ? (
                <p className="text-[11px] text-muted-foreground self-end">Delivery vs Return dideteksi otomatis — tidak perlu kolom di CSV.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Nama Kolom</FieldLabel>
                  <TextInput value={f.match_column} onChange={(e) => patch({ match_column: e.target.value })} placeholder="Area" />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Default Rate (fallback, Rp)</FieldLabel>
                <RupiahInput value={f.default_rate} onChange={(v) => patch({ default_rate: v })} />
              </div>
            </div>
            <TableShell>
              <>
                <Th>{f.rate_by === "delivery_type" ? "Nilai (DELIVERY / RETURN)" : "Nilai Kolom (cth: Jakarta Pusat)"}</Th>
                <Th className="w-44">Tarif (Rp)</Th>
                <Th className="w-10" />
              </>
              {f.rates.map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  <Td><TextInput value={r.key} onChange={(e) => patch({ rates: f.rates.map((x, idx) => (idx === i ? { ...x, key: e.target.value } : x)) })} /></Td>
                  <Td><RupiahInput value={r.rate} onChange={(v) => patch({ rates: f.rates.map((x, idx) => (idx === i ? { ...x, rate: v } : x)) })} /></Td>
                  <Td className="text-center"><RowDeleteBtn onClick={() => patch({ rates: f.rates.filter((_, idx) => idx !== i) })} /></Td>
                </tr>
              ))}
            </TableShell>
            <AddRowBtn onClick={() => patch({ rates: [...f.rates, { key: "", rate: "" }] })}>Tambah Baris</AddRowBtn>
          </>
        )}
      </div>
    );
  }

  if (subtype === "tier") {
    const t = value.tier;
    const patch = (p: Partial<TierState>) => onChange({ ...value, tier: { ...t, ...p } });
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          {([{ k: "per_order", l: "Per Kiriman" }, { k: "daily", l: "Akumulasi Harian" }] as const).map((opt) => (
            <button
              key={opt.k}
              type="button"
              onClick={() => patch({ accumulate: opt.k })}
              className={
                "text-xs px-3 py-1.5 rounded-md border transition-colors " +
                (t.accumulate === opt.k ? "bg-primary-soft text-primary-soft-foreground border-primary-border font-medium" : "bg-card border-border text-muted-foreground hover:bg-muted")
              }
            >
              {opt.l}
            </button>
          ))}
        </div>
        {t.accumulate === "daily" && (
          <div className="rounded-md border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-xs text-warning">
            Akumulasi harian: jarak/berat semua kiriman 1 rider dalam 1 hari dijumlah dulu, baru dihitung.
          </div>
        )}
        <div className="flex gap-1.5 mb-1">
          {([{ k: "distance", l: "Jarak (km)" }, { k: "weight", l: "Berat (kg)" }] as const).map((opt) => (
            <button
              key={opt.k}
              type="button"
              onClick={() => setTierSubtab(opt.k)}
              className={
                "text-xs px-3 py-1.5 rounded-md border transition-colors " +
                (tierSubtab === opt.k ? "bg-primary-soft text-primary-soft-foreground border-primary-border font-medium" : "bg-card border-border text-muted-foreground hover:bg-muted")
              }
            >
              {opt.l}
            </button>
          ))}
        </div>

        {tierSubtab === "distance" && (
          <ToggleBlock label="Pakai Jarak (km)" on={t.distanceOn} onToggle={(on) => patch({ distanceOn: on })}>
            <StepTierEditor unit="km" value={t.distance} onChange={(v) => patch({ distance: v })} />
          </ToggleBlock>
        )}
        {tierSubtab === "weight" && (
          <ToggleBlock label="Pakai Berat (kg)" on={t.weightOn} onToggle={(on) => patch({ weightOn: on })}>
            <StepTierEditor unit="kg" value={t.weight} onChange={(v) => patch({ weight: v })} />
          </ToggleBlock>
        )}
        {t.distanceOn && t.weightOn && (
          <p className="text-[11px] text-muted-foreground">Jarak & berat dua-duanya aktif → hasilnya dijumlah.</p>
        )}
      </div>
    );
  }

  // threshold
  const th = value.threshold;
  const patch = (p: Partial<ThresholdState>) => onChange({ ...value, threshold: { ...th, ...p } });
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Qty dibaca dari berat aktual (kg). Fee per grup = ceil(total kg / threshold) × rate.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Kolom pengelompokan</FieldLabel>
          <TextInput value={th.group_by} onChange={(e) => patch({ group_by: e.target.value })} placeholder="Area" />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Default Threshold (kg)</FieldLabel>
          <TextInput value={th.default_threshold} inputMode="decimal" onChange={(e) => patch({ default_threshold: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Default Rate (Rp)</FieldLabel>
          <RupiahInput value={th.default_rate} onChange={(v) => patch({ default_rate: v })} />
        </div>
      </div>
      <TableShell>
        <>
          <Th>Area / Store</Th>
          <Th className="w-32">Threshold (kg)</Th>
          <Th className="w-44">Rate (Rp)</Th>
          <Th className="w-10" />
        </>
        {th.rules.map((r, i) => (
          <tr key={i} className="border-t border-border/60">
            <Td><TextInput value={r.key} onChange={(e) => patch({ rules: th.rules.map((x, idx) => (idx === i ? { ...x, key: e.target.value } : x)) })} /></Td>
            <Td><TextInput value={r.threshold} inputMode="decimal" onChange={(e) => patch({ rules: th.rules.map((x, idx) => (idx === i ? { ...x, threshold: e.target.value } : x)) })} /></Td>
            <Td><RupiahInput value={r.rate} onChange={(v) => patch({ rules: th.rules.map((x, idx) => (idx === i ? { ...x, rate: v } : x)) })} /></Td>
            <Td className="text-center"><RowDeleteBtn onClick={() => patch({ rules: th.rules.filter((_, idx) => idx !== i) })} /></Td>
          </tr>
        ))}
      </TableShell>
      <AddRowBtn onClick={() => patch({ rules: [...th.rules, { key: "", threshold: "", rate: "" }] })}>Tambah Store</AddRowBtn>
    </div>
  );
}
