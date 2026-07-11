// Kalkulator interaktif — preview hasil hitung tanpa perlu commit data.
// Sudah cukup berdiri sendiri di kode lama, dipindah nyaris apa adanya per
// docs/pricing-engine-v2-design.md §6 (cuma nama field "calcType" 6-way
// diganti jadi kombinasi category+subtype).
import { useEffect, useMemo, useState } from "react";
import { Calculator, Plus, Trash2 } from "lucide-react";
import type { PricingCategory, PricingSubtype, SchemeFor, PricingEnvelope } from "@/lib/pricing-types";
import { calcAttendanceScheme } from "@/lib/pricing-calc";
import { formatRupiah, parseRupiah } from "@/lib/format";
import { type DeliveryState } from "./delivery-fields";
import { type AttendanceState, buildAttendanceConfig } from "./attendance-fields";
import { stepTierBreakdown, type ExStep } from "./shared";

export interface HybridState {
  daily_fee: string;
  standard_hours: string;
  ontime_bonus: string;
  order_by: "distance" | "weight";
  order_tier: { base_fee: string; base_until: string; tiers: { from: string; to: string; step: string; add_per_step: string }[] };
}

export const emptyHybridState = (): HybridState => ({
  daily_fee: "100000",
  standard_hours: "8",
  ontime_bonus: "20000",
  order_by: "distance",
  order_tier: { base_fee: "5000", base_until: "5", tiers: [{ from: "5", to: "", step: "1", add_per_step: "1000" }] },
});

interface WorkedExample {
  steps: ExStep[];
  total: { label: string; amount: number };
  notes: string[];
}

interface CalcInputs {
  units: string;
  area: string;
  distance: string;
  weight: string;
  totalKg: string;
  hours: string;
  isLate: boolean;
  orders: { val: string }[];
}

interface InteractiveCalcProps {
  category: PricingCategory;
  subtype: PricingSubtype;
  delivery: DeliveryState;
  attendance: AttendanceState;
  hybrid: HybridState;
  schemeFor: SchemeFor;
  addKgOn: boolean;
  multiDropOn: boolean;
  multiDropFee: string;
  billingOn: boolean;
}

function defaultCalcInputs(p: InteractiveCalcProps): CalcInputs {
  return {
    units: "3",
    area: p.delivery.flatUnit.rates.find((r) => r.key.trim())?.key ?? "",
    distance: String((Number(p.delivery.tier.distance.base_until) || 0) + 3),
    weight: String((Number(p.delivery.tier.weight.base_until) || 0) + 3),
    totalKg: String((Number(p.delivery.threshold.default_threshold) || 10) * 2 + 1),
    hours: p.category === "hybrid" ? (p.hybrid.standard_hours || "8") : (p.attendance.standard_hours || "8"),
    isLate: false,
    orders: [{ val: String((Number(p.hybrid.order_tier.base_until) || 0) + 3) }],
  };
}

function computeInteractive(p: InteractiveCalcProps, inp: CalcInputs): WorkedExample {
  const notes: string[] = [];
  const modNotes = () => {
    if ((p.category === "delivery") && (p.subtype === "flat" || p.subtype === "threshold") && p.addKgOn)
      notes.push("Add-KG nyala: biaya berat ditambah DI ATAS hasil ini.");
    if (p.multiDropOn)
      notes.push(`Multi-drop nyala: kiriman ke-2 dst +${formatRupiah(parseRupiah(p.multiDropFee))} per kiriman.`);
    if (p.schemeFor === "client" && p.billingOn)
      notes.push("Billing add-ons belum termasuk di sini (min charge / admin fee / PPN).");
  };

  if (p.category === "delivery" && p.subtype === "flat") {
    const f = p.delivery.flatUnit;
    const n = Math.max(1, Number(inp.units) || 1);
    const unitWord = f.unit === "unique_address" ? "alamat" : "kiriman";
    if (f.rate_by === "flat") {
      const rate = parseRupiah(f.flat_rate);
      modNotes();
      return { steps: [{ text: `Tarif per ${unitWord}`, amount: rate }, { text: `${n} × ${formatRupiah(rate)}`, amount: rate * n }], total: { label: `Total ${n} ${unitWord}`, amount: rate * n }, notes };
    }
    const hit = f.rates.find((r) => r.key.trim().toLowerCase() === (inp.area || "").toLowerCase());
    const rate = parseRupiah(hit ? hit.rate : f.default_rate);
    const label = hit ? hit.key : "(default)";
    modNotes();
    return { steps: [{ text: `${f.match_column || "Area"}: "${label}" → tarif`, amount: rate }, { text: `${n} kiriman × ${formatRupiah(rate)}`, amount: rate * n }], total: { label: `Total ${n} kiriman`, amount: rate * n }, notes };
  }

  if (p.category === "delivery" && p.subtype === "tier") {
    const t = p.delivery.tier;
    const steps: ExStep[] = [];
    let total = 0;
    if (t.distanceOn) {
      const { steps: s, total: tt } = stepTierBreakdown(t.distance, Number(inp.distance) || 0, "km");
      steps.push(...s);
      total += tt;
    }
    if (t.weightOn) {
      const { steps: s, total: tt } = stepTierBreakdown(t.weight, Number(inp.weight) || 0, "kg");
      steps.push(...s.map((x) => ({ ...x, text: `[Berat] ${x.text}` })));
      total += tt;
    }
    if (t.distanceOn && t.weightOn) notes.push("Jarak + berat dijumlah.");
    modNotes();
    return { steps, total: { label: "Total", amount: total }, notes };
  }

  if (p.category === "delivery" && p.subtype === "threshold") {
    const th = p.delivery.threshold;
    const kg = Number(inp.totalKg) || 0;
    const t = Number(th.default_threshold) || 0;
    const rate = parseRupiah(th.default_rate);
    const mult = t > 0 ? Math.ceil(kg / t) : 0;
    const fee = mult * rate;
    modNotes();
    return {
      steps: [
        { text: `${kg} kg ÷ ${t} = ${t > 0 ? (kg / t).toFixed(2) : "-"} → dibulatkan ke atas: ${mult}×` },
        { text: `${mult} × ${formatRupiah(rate)}`, amount: fee },
      ],
      total: { label: "Fee", amount: fee },
      notes,
    };
  }

  if (p.category === "attendance") {
    const a = p.attendance;
    const env: PricingEnvelope = { version: 1, type: "attendance", config: buildAttendanceConfig(a), add_kg: null, multi_drop: null, billing_addons: null };
    const std = Number(a.standard_hours) || 0;
    const actualMin = Math.round((Number(inp.hours) || 0) * 60);
    const res = calcAttendanceScheme(env, [{ log_date: "2026-01-01", duration_minutes: actualMin, is_late: inp.isLate, is_absent: false }]);
    const row = res.perRow[0];
    const full = parseRupiah(a.full_fee);
    const pct = std > 0 ? Math.min(100, Math.round(((Number(inp.hours) || 0) / std) * 100)) : 100;
    const steps: ExStep[] = [
      { text: `Fee penuh per shift`, amount: full },
      { text: `Kerja ${inp.hours} dari ${std} jam (${pct}%) → fee dasar`, amount: row?.base ?? 0 },
    ];
    if ((row?.overtime ?? 0) > 0) steps.push({ text: "Lembur", amount: row.overtime });
    a.incentives.filter((c) => c.label.trim()).forEach((c) => {
      const amt = parseRupiah(c.amount);
      const cair = c.condition === "always" || (c.condition === "ontime_only" && !inp.isLate);
      steps.push({ text: `+ ${c.label} ${c.condition === "always" ? "(selalu)" : inp.isLate ? "(LATE — tidak cair)" : "(ONTIME ✓)"}`, amount: cair ? amt : 0 });
    });
    return { steps, total: { label: "Fee hari itu", amount: row?.fee ?? 0 }, notes };
  }

  if (p.category === "hybrid") {
    const h = p.hybrid;
    const std = Number(h.standard_hours) || 0;
    const fullFee = parseRupiah(h.daily_fee);
    const proportion = std > 0 ? Math.min(1, (Number(inp.hours) || 0) / std) : ((Number(inp.hours) || 0) > 0 ? 1 : 0);
    const daily_base = Math.round(fullFee * proportion);
    const bonus = !inp.isLate ? parseRupiah(h.ontime_bonus) : 0;
    const unit = h.order_by === "weight" ? "kg" : "km";
    const steps: ExStep[] = [
      { text: `Fee harian (${inp.hours} dari ${std} jam)`, amount: daily_base },
      { text: `Bonus ontime${inp.isLate ? " (LATE — tidak cair)" : ""}`, amount: bonus },
    ];
    let orderTotal = 0;
    inp.orders.forEach((o, i) => {
      const { total: fee } = stepTierBreakdown(h.order_tier, Number(o.val) || 0, unit);
      steps.push({ text: `Kiriman ${i + 1}: ${o.val || 0} ${unit}`, amount: fee });
      orderTotal += fee;
    });
    if (inp.orders.length > 1) notes.push(`${inp.orders.length} kiriman — daily fee tetap 1× per hari.`);
    notes.push("Daily fee & bonus ontime diambil dari data absensi saat hitung real.");
    return { steps, total: { label: "Total hari itu", amount: daily_base + bonus + orderTotal }, notes };
  }

  return { steps: [], total: { label: "Total", amount: 0 }, notes: [] };
}

export function InteractiveCalc(props: InteractiveCalcProps) {
  const [inp, setInp] = useState<CalcInputs>(() => defaultCalcInputs(props));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setInp(defaultCalcInputs(props)); }, [props.category, props.subtype]);

  const p = (patch: Partial<CalcInputs>) => setInp((prev) => ({ ...prev, ...patch }));
  const result = useMemo(() => computeInteractive(props, inp), [props, inp]);
  const orderUnit = props.hybrid.order_by === "weight" ? "kg" : "km";

  return (
    <div className="rounded-lg border border-primary-border/60 bg-primary-soft/40 px-4 py-3.5 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="w-4 h-4 text-primary" />
        <p className="text-xs font-semibold text-primary-soft-foreground">Kalkulator</p>
        <span className="text-[10px] text-muted-foreground">(ubah input → hasil update otomatis)</span>
      </div>

      {/* ── Inputs per tipe ── */}
      <div className="mb-3.5 space-y-2">
        {props.category === "delivery" && props.subtype === "flat" && (
          <div className="flex flex-wrap gap-3 items-end">
            {props.delivery.flatUnit.rate_by === "column" && props.delivery.flatUnit.rates.some((r) => r.key.trim()) && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">{props.delivery.flatUnit.match_column || "Area"}</span>
                <select value={inp.area} onChange={(e) => p({ area: e.target.value })}
                  className="text-xs rounded border border-border bg-card px-2 py-1.5">
                  {props.delivery.flatUnit.rates.filter((r) => r.key.trim()).map((r, i) => <option key={i} value={r.key}>{r.key}</option>)}
                  <option value="">lainnya (default)</option>
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{props.delivery.flatUnit.unit === "unique_address" ? "Jumlah alamat unik" : "Jumlah kiriman"}</span>
              <input type="number" min="1" value={inp.units} onChange={(e) => p({ units: e.target.value })}
                className="w-20 text-xs rounded border border-border bg-card px-2 py-1.5" />
            </div>
          </div>
        )}

        {props.category === "delivery" && props.subtype === "tier" && (
          <div className="flex flex-wrap gap-3">
            {props.delivery.tier.distanceOn && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">{props.delivery.tier.accumulate === "daily" ? "Total jarak hari ini (km)" : "Jarak (km)"}</span>
                <input type="number" min="0" step="0.1" value={inp.distance} onChange={(e) => p({ distance: e.target.value })}
                  className="w-24 text-xs rounded border border-border bg-card px-2 py-1.5" />
              </div>
            )}
            {props.delivery.tier.weightOn && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">{props.delivery.tier.accumulate === "daily" ? "Total berat hari ini (kg)" : "Berat (kg)"}</span>
                <input type="number" min="0" step="0.1" value={inp.weight} onChange={(e) => p({ weight: e.target.value })}
                  className="w-24 text-xs rounded border border-border bg-card px-2 py-1.5" />
              </div>
            )}
          </div>
        )}

        {props.category === "delivery" && props.subtype === "threshold" && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Total berat (kg)</span>
            <input type="number" min="0" step="0.1" value={inp.totalKg} onChange={(e) => p({ totalKg: e.target.value })}
              className="w-28 text-xs rounded border border-border bg-card px-2 py-1.5" />
          </div>
        )}

        {(props.category === "attendance" || props.category === "hybrid") && (
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Jam kerja</span>
              <input type="number" min="0" step="0.5" value={inp.hours} onChange={(e) => p({ hours: e.target.value })}
                className="w-20 text-xs rounded border border-border bg-card px-2 py-1.5" />
            </div>
            <div className="flex gap-1 pb-0.5">
              {([{ v: false, l: "Ontime" }, { v: true, l: "Late" }] as const).map((opt) => (
                <button key={String(opt.v)} type="button" onClick={() => p({ isLate: opt.v })}
                  className={"text-xs px-2.5 py-1.5 rounded border transition-colors " +
                    (inp.isLate === opt.v ? "bg-primary-soft border-primary-border text-primary-soft-foreground font-medium" : "bg-card border-border text-muted-foreground hover:bg-muted")}>
                  {opt.l}
                </button>
              ))}
            </div>
          </div>
        )}

        {props.category === "hybrid" && (
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">Kiriman ({orderUnit} masing-masing)</p>
            <div className="space-y-1.5">
              {inp.orders.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground w-14">Order {i + 1}</span>
                  <input type="number" min="0" step="0.1" value={o.val}
                    onChange={(e) => p({ orders: inp.orders.map((x, idx) => idx === i ? { val: e.target.value } : x) })}
                    className="w-24 text-xs rounded border border-border bg-card px-2 py-1.5" />
                  <span className="text-[11px] text-muted-foreground">{orderUnit}</span>
                  {inp.orders.length > 1 && (
                    <button type="button" onClick={() => p({ orders: inp.orders.filter((_, idx) => idx !== i) })}
                      className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => p({ orders: [...inp.orders, { val: inp.orders[0]?.val ?? "5" }] })}
              className="mt-1.5 text-[11px] text-primary flex items-center gap-1 hover:underline">
              <Plus className="w-3 h-3" /> Tambah kiriman
            </button>
          </div>
        )}
      </div>

      {/* ── Result ── */}
      <div className="border-t border-primary-border/40 pt-2.5 space-y-1">
        {result.steps.map((s, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-muted-foreground">{s.text}</span>
            {s.amount !== undefined && <span className="font-medium tabular-nums whitespace-nowrap">{formatRupiah(s.amount)}</span>}
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-primary-border/50">
          <span className="text-xs font-semibold">{result.total.label}</span>
          <span className="text-base font-bold text-primary tabular-nums">{formatRupiah(result.total.amount)}</span>
        </div>
        {result.notes.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {result.notes.map((n, i) => (
              <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5">
                <span className="text-primary flex-shrink-0">•</span><span>{n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
