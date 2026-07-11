// Kategori 3 — Kombinasi (hybrid). Bukan sub-tipe berdiri sendiri secara
// kalkulasi (lihat docs/pricing-engine-v2-design.md §3) — field-nya gabungan
// kecil dari komponen harian (mirip attendance) + 1 order-tier (mirip
// delivery subtype "tier"), jadi dikasih file kecil sendiri daripada
// dipaksa reuse DeliveryFields/AttendanceFields yang py punya field lebih
// banyak (overtime, incentives list, flat/threshold) yang tidak dipakai di
// sini — calcHybridScheme() di pricing-calc.ts (tidak disentuh di tahap
// ini) cuma baca full_fee/standard_minutes/ontime_bonus/order_by/order_tier.
import { parseRupiah } from "@/lib/format";
import { FieldLabel, RupiahInput, StepTierEditor, TextInput, buildStepTier, stepTierToState } from "./shared";
import type { HybridState } from "./interactive-calc";

export function buildHybridConfig(h: HybridState): Record<string, unknown> {
  return {
    full_fee: parseRupiah(h.daily_fee),
    standard_minutes: (Number(h.standard_hours) || 0) * 60,
    ontime_bonus: parseRupiah(h.ontime_bonus),
    order_by: h.order_by,
    order_tier: buildStepTier(h.order_tier),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadHybridState(c: any): HybridState {
  return {
    daily_fee: String(c.full_fee ?? ""),
    standard_hours: String((Number(c.standard_minutes) || 0) / 60 || ""),
    ontime_bonus: String(c.ontime_bonus ?? "0"),
    order_by: c.order_by === "weight" ? "weight" : "distance",
    order_tier: stepTierToState(c.order_tier),
  };
}

export function HybridFields({ value, onChange }: { value: HybridState; onChange: (v: HybridState) => void }) {
  const patch = (p: Partial<HybridState>) => onChange({ ...value, ...p });

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-primary-border bg-primary-soft px-3.5 py-2.5 text-xs text-primary-soft-foreground">
        Tiga komponen: <strong>fee harian</strong> (proporsional jam kerja dari absensi) + <strong>bonus ontime</strong> (kalau tidak terlambat) + <strong>fee per kiriman</strong> berdasarkan {value.order_by === "weight" ? "berat (kg)" : "jarak (km)"} berjenjang.
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Komponen Harian (dari data absensi)</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Fee Penuh per Hari (Rp)</FieldLabel>
            <RupiahInput value={value.daily_fee} onChange={(v) => patch({ daily_fee: v })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Jam Standar per Shift</FieldLabel>
            <TextInput type="number" value={value.standard_hours} onChange={(e) => patch({ standard_hours: e.target.value })} placeholder="8" />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Bonus Ontime (Rp)</FieldLabel>
            <RupiahInput value={value.ontime_bonus} onChange={(v) => patch({ ontime_bonus: v })} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5">Fee harian proporsional jam kerja. Bonus ontime cair kalau rider tidak terlambat. Kalau tidak ada data absensi hari itu, kedua komponen ini = Rp0.</p>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Komponen Per Kiriman (dari data pengiriman)</p>
        <div className="flex gap-1.5 mb-3">
          {([{ k: "distance", l: "Jarak (km)" }, { k: "weight", l: "Berat (kg)" }] as const).map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => patch({ order_by: t.k })}
              className={
                "text-xs px-3 py-1.5 rounded-md border transition-colors " +
                (value.order_by === t.k ? "bg-primary-soft text-primary-soft-foreground border-primary-border font-medium" : "bg-card border-border text-muted-foreground hover:bg-muted")
              }
            >
              {t.l}
            </button>
          ))}
        </div>
        <StepTierEditor
          unit={value.order_by === "weight" ? "kg" : "km"}
          value={value.order_tier}
          onChange={(v) => patch({ order_tier: v })}
        />
      </div>
    </div>
  );
}
