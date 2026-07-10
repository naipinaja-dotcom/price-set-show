import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin-layout";
import {
  PRICING_TYPES,
  type PricingCalcType,
  type PricingScheme,
  type PricingEnvelope,
  type SchemeFor,
  type StepTier,
} from "@/lib/pricing-types";
import {
  getPricingScheme,
  listClients,
  savePricingScheme,
  type MockClient,
} from "@/lib/pricing-store";
import { formatRupiah, parseRupiah } from "@/lib/format";
import {
  ArrowLeft,
  Info,
  MapPin,
  Truck,
  Ruler,
  Route as RouteIcon,
  Home,
  Package,
  CalendarDays,
  Calculator,
  Plus,
  Save,
  Trash2,
  Layers,
} from "lucide-react";
import { calcAttendanceScheme } from "@/lib/pricing-calc";
import { toast } from "sonner";

const ICONS = { MapPin, Truck, Ruler, Route: RouteIcon, Home, Package, CalendarDays, Layers } as const;

// -------------------- Bentuk state form (semua string, di-parse saat simpan) --------------------
interface StepTierState {
  base_fee: string;
  base_until: string;
  tiers: { from: string; to: string; step: string; add_per_step: string }[];
}
interface FlatUnitState {
  unit: "awb" | "unique_address";
  rate_by: "flat" | "column";
  match_column: string;
  flat_rate: string;
  default_rate: string;
  rates: { key: string; rate: string }[];
}
interface TierState {
  distanceOn: boolean;
  distance: StepTierState;
  weightOn: boolean;
  weight: StepTierState;
}
interface ThresholdState {
  group_by: string;
  default_threshold: string;
  default_rate: string;
  rules: { key: string; threshold: string; rate: string }[];
}
interface AttendanceState {
  full_fee: string;
  standard_hours: string; // ditampilkan dalam jam, disimpan sebagai menit di config
  overtimeOn: boolean;
  overtime_rate_per_hour: string;
  incentives: { label: string; amount: string; condition: "always" | "ontime_only" }[];
}
interface CombinedState {
  daily_fee: string;
  standard_hours: string;
  ontime_bonus: string;
  order_by: "distance" | "weight";
  order_tier: StepTierState;
}

const emptyStepTier = (): StepTierState => ({ base_fee: "", base_until: "", tiers: [] });

interface FormState {
  flatUnit: FlatUnitState;
  tier: TierState; // dipakai untuk "tier" dan "tier_daily"
  threshold: ThresholdState;
  attendance: AttendanceState;
  // modifiers
  combined: CombinedState;
  addKgOn: boolean;
  addKg: StepTierState;
  multiDropOn: boolean;
  multiDropFee: string;
  billingOn: boolean;
  billing: { min_charge: string; admin_fee_flat: string; ppn_percent: string };
}

function emptyForm(): FormState {
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
    },
    threshold: {
      group_by: "Area",
      default_threshold: "10",
      default_rate: "40000",
      rules: [{ key: "Store A", threshold: "4", rate: "12000" }],
    },
    attendance: {
      full_fee: "100000",
      standard_hours: "8",
      overtimeOn: false,
      overtime_rate_per_hour: "0",
      incentives: [{ label: "Insentif Ontime", amount: "40000", condition: "ontime_only" }],
    },
    combined: {
      daily_fee: "100000",
      standard_hours: "8",
      ontime_bonus: "20000",
      order_by: "distance",
      order_tier: { base_fee: "5000", base_until: "5", tiers: [{ from: "5", to: "", step: "1", add_per_step: "1000" }] },
    },
    addKgOn: false,
    addKg: emptyStepTier(),
    multiDropOn: false,
    multiDropFee: "3000",
    billingOn: false,
    billing: { min_charge: "", admin_fee_flat: "", ppn_percent: "11" },
  };
}

// -------------------- build state -> envelope (JSON tersimpan) --------------------
function buildStepTier(s: StepTierState): StepTier {
  return {
    base_fee: parseRupiah(s.base_fee),
    base_until: Number(s.base_until) || 0,
    tiers: s.tiers.map((t) => ({
      from: Number(t.from) || 0,
      to: t.to.trim() === "" ? null : Number(t.to),
      step: Number(t.step) || 1,
      add_per_step: parseRupiah(t.add_per_step),
    })),
  };
}

function buildConfig(type: PricingCalcType, f: FormState): Record<string, unknown> {
  switch (type) {
    case "flat_unit":
      return {
        unit: f.flatUnit.unit,
        rate_by: f.flatUnit.rate_by,
        match_column: f.flatUnit.match_column,
        flat_rate: parseRupiah(f.flatUnit.flat_rate),
        default_rate: parseRupiah(f.flatUnit.default_rate),
        rates: f.flatUnit.rates
          .filter((r) => r.key.trim())
          .map((r) => ({ key: r.key.trim(), rate: parseRupiah(r.rate) })),
      };
    case "tier":
    case "tier_daily":
      return {
        distance: f.tier.distanceOn ? buildStepTier(f.tier.distance) : null,
        weight: f.tier.weightOn ? buildStepTier(f.tier.weight) : null,
        combine: "sum",
      };
    case "threshold_multiple":
      return {
        qty_source: "weight_kg",
        group_by: f.threshold.group_by,
        default: { threshold: Number(f.threshold.default_threshold) || 0, rate: parseRupiah(f.threshold.default_rate) },
        rules: f.threshold.rules
          .filter((r) => r.key.trim())
          .map((r) => ({ key: r.key.trim(), threshold: Number(r.threshold) || 0, rate: parseRupiah(r.rate) })),
      };
    case "attendance":
      return {
        full_fee: parseRupiah(f.attendance.full_fee),
        standard_minutes: (Number(f.attendance.standard_hours) || 0) * 60,
        overtime: f.attendance.overtimeOn ? { enabled: true, rate_per_hour: parseRupiah(f.attendance.overtime_rate_per_hour) } : null,
        incentives: f.attendance.incentives
          .filter((c) => c.label.trim())
          .map((c) => ({ label: c.label.trim(), amount: parseRupiah(c.amount), condition: c.condition })),
      };
    case "combined":
      return {
        full_fee: parseRupiah(f.combined.daily_fee),
        standard_minutes: (Number(f.combined.standard_hours) || 0) * 60,
        ontime_bonus: parseRupiah(f.combined.ontime_bonus),
        order_by: f.combined.order_by,
        order_tier: buildStepTier(f.combined.order_tier),
      };
  }
}

function buildEnvelope(type: PricingCalcType, schemeFor: SchemeFor, f: FormState): PricingEnvelope {
  return {
    version: 1,
    type,
    config: buildConfig(type, f),
    add_kg: (type === "flat_unit" || type === "threshold_multiple") && f.addKgOn ? { enabled: true, tier: buildStepTier(f.addKg) } : null,
    multi_drop: f.multiDropOn ? { fee_per_extra_shipment: parseRupiah(f.multiDropFee) } : null,
    billing_addons:
      schemeFor === "client" && f.billingOn
        ? {
            min_charge: parseRupiah(f.billing.min_charge),
            admin_fee_flat: parseRupiah(f.billing.admin_fee_flat),
            ppn_percent: Number(f.billing.ppn_percent) || 0,
          }
        : null,
  };
}

// -------------------- Kalkulator interaktif --------------------
interface ExStep { text: string; amount?: number }
interface WorkedExample { steps: ExStep[]; total: { label: string; amount: number }; notes: string[] }

function stepTierBreakdown(s: StepTierState, value: number, unit: string): { steps: ExStep[]; total: number } {
  const base = parseRupiah(s.base_fee);
  const baseUntil = Number(s.base_until) || 0;
  const steps: ExStep[] = [{ text: `Tarif dasar (0–${baseUntil} ${unit})`, amount: base }];
  let fee = base;
  for (const t of s.tiers) {
    const lo = Number(t.from) || 0;
    const hi = t.to.trim() === "" ? Infinity : Number(t.to);
    const step = Number(t.step) || 1;
    const perStep = parseRupiah(t.add_per_step);
    if (value > lo) {
      const span = Math.min(value, hi) - lo;
      const count = Math.ceil(span / step);
      const add = count * perStep;
      fee += add;
      const hiLabel = hi === Infinity ? "∞" : String(hi);
      steps.push({ text: `${lo}–${hiLabel} ${unit}: ${count} step × ${formatRupiah(perStep)}`, amount: add });
    }
  }
  return { steps, total: fee };
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

function defaultCalcInputs(calcType: PricingCalcType, f: FormState): CalcInputs {
  return {
    units: "3",
    area: f.flatUnit.rates.find((r) => r.key.trim())?.key ?? "",
    distance: String((Number(f.tier.distance.base_until) || 0) + 3),
    weight: String((Number(f.tier.weight.base_until) || 0) + 3),
    totalKg: String((Number(f.threshold.default_threshold) || 10) * 2 + 1),
    hours: calcType === "combined" ? (f.combined.standard_hours || "8") : (f.attendance.standard_hours || "8"),
    isLate: false,
    orders: [{ val: String((Number(f.combined.order_tier.base_until) || 0) + 3) }],
  };
}

function computeInteractive(calcType: PricingCalcType, f: FormState, schemeFor: SchemeFor, inp: CalcInputs): WorkedExample {
  const notes: string[] = [];
  const modNotes = () => {
    if ((calcType === "flat_unit" || calcType === "threshold_multiple") && f.addKgOn)
      notes.push("Add-KG nyala: biaya berat ditambah DI ATAS hasil ini.");
    if (f.multiDropOn)
      notes.push(`Multi-drop nyala: kiriman ke-2 dst +${formatRupiah(parseRupiah(f.multiDropFee))} per kiriman.`);
    if (schemeFor === "client" && f.billingOn)
      notes.push("Billing add-ons belum termasuk di sini (min charge / admin fee / PPN).");
  };

  switch (calcType) {
    case "flat_unit": {
      const n = Math.max(1, Number(inp.units) || 1);
      const unitWord = f.flatUnit.unit === "unique_address" ? "alamat" : "kiriman";
      if (f.flatUnit.rate_by === "flat") {
        const rate = parseRupiah(f.flatUnit.flat_rate);
        modNotes();
        return { steps: [{ text: `Tarif per ${unitWord}`, amount: rate }, { text: `${n} × ${formatRupiah(rate)}`, amount: rate * n }], total: { label: `Total ${n} ${unitWord}`, amount: rate * n }, notes };
      }
      const hit = f.flatUnit.rates.find((r) => r.key.trim().toLowerCase() === (inp.area || "").toLowerCase());
      const rate = parseRupiah(hit ? hit.rate : f.flatUnit.default_rate);
      const label = hit ? hit.key : "(default)";
      modNotes();
      return { steps: [{ text: `${f.flatUnit.match_column || "Area"}: "${label}" → tarif`, amount: rate }, { text: `${n} kiriman × ${formatRupiah(rate)}`, amount: rate * n }], total: { label: `Total ${n} kiriman`, amount: rate * n }, notes };
    }
    case "tier":
    case "tier_daily": {
      const steps: ExStep[] = [];
      let total = 0;
      if (f.tier.distanceOn) {
        const { steps: s, total: t } = stepTierBreakdown(f.tier.distance, Number(inp.distance) || 0, "km");
        steps.push(...s);
        total += t;
      }
      if (f.tier.weightOn) {
        const { steps: s, total: t } = stepTierBreakdown(f.tier.weight, Number(inp.weight) || 0, "kg");
        steps.push(...s.map((x) => ({ ...x, text: `[Berat] ${x.text}` })));
        total += t;
      }
      if (f.tier.distanceOn && f.tier.weightOn) notes.push("Jarak + berat dijumlah.");
      modNotes();
      return { steps, total: { label: "Total", amount: total }, notes };
    }
    case "threshold_multiple": {
      const kg = Number(inp.totalKg) || 0;
      const th = Number(f.threshold.default_threshold) || 0;
      const rate = parseRupiah(f.threshold.default_rate);
      const mult = th > 0 ? Math.ceil(kg / th) : 0;
      const fee = mult * rate;
      modNotes();
      return {
        steps: [
          { text: `${kg} kg ÷ ${th} = ${th > 0 ? (kg / th).toFixed(2) : "-"} → dibulatkan ke atas: ${mult}×` },
          { text: `${mult} × ${formatRupiah(rate)}`, amount: fee },
        ],
        total: { label: "Fee", amount: fee },
        notes,
      };
    }
    case "attendance": {
      const env = buildEnvelope("attendance", schemeFor, f);
      const std = Number(f.attendance.standard_hours) || 0;
      const actualMin = Math.round((Number(inp.hours) || 0) * 60);
      const res = calcAttendanceScheme(env, [{ log_date: "2026-01-01", duration_minutes: actualMin, is_late: inp.isLate, is_absent: false }]);
      const row = res.perRow[0];
      const full = parseRupiah(f.attendance.full_fee);
      const pct = std > 0 ? Math.min(100, Math.round(((Number(inp.hours) || 0) / std) * 100)) : 100;
      const steps: ExStep[] = [
        { text: `Fee penuh per shift`, amount: full },
        { text: `Kerja ${inp.hours} dari ${std} jam (${pct}%) → fee dasar`, amount: row?.base ?? 0 },
      ];
      if ((row?.overtime ?? 0) > 0) steps.push({ text: "Lembur", amount: row.overtime });
      f.attendance.incentives.filter((c) => c.label.trim()).forEach((c) => {
        const amt = parseRupiah(c.amount);
        const cair = c.condition === "always" || (c.condition === "ontime_only" && !inp.isLate);
        steps.push({ text: `+ ${c.label} ${c.condition === "always" ? "(selalu)" : inp.isLate ? "(LATE — tidak cair)" : "(ONTIME ✓)"}`, amount: cair ? amt : 0 });
      });
      return { steps, total: { label: "Fee hari itu", amount: row?.fee ?? 0 }, notes };
    }
    case "combined": {
      const std = Number(f.combined.standard_hours) || 0;
      const fullFee = parseRupiah(f.combined.daily_fee);
      const proportion = std > 0 ? Math.min(1, (Number(inp.hours) || 0) / std) : ((Number(inp.hours) || 0) > 0 ? 1 : 0);
      const daily_base = Math.round(fullFee * proportion);
      const bonus = !inp.isLate ? parseRupiah(f.combined.ontime_bonus) : 0;
      const unit = f.combined.order_by === "weight" ? "kg" : "km";
      const steps: ExStep[] = [
        { text: `Fee harian (${inp.hours} dari ${std} jam)`, amount: daily_base },
        { text: `Bonus ontime${inp.isLate ? " (LATE — tidak cair)" : ""}`, amount: bonus },
      ];
      let orderTotal = 0;
      inp.orders.forEach((o, i) => {
        const { total: fee } = stepTierBreakdown(f.combined.order_tier, Number(o.val) || 0, unit);
        steps.push({ text: `Kiriman ${i + 1}: ${o.val || 0} ${unit}`, amount: fee });
        orderTotal += fee;
      });
      if (inp.orders.length > 1) notes.push(`${inp.orders.length} kiriman — daily fee tetap 1× per hari.`);
      notes.push("Daily fee & bonus ontime diambil dari data absensi saat hitung real.");
      return { steps, total: { label: "Total hari itu", amount: daily_base + bonus + orderTotal }, notes };
    }
    default:
      return { steps: [], total: { label: "Total", amount: 0 }, notes: [] };
  }
}

function InteractiveCalc({ calcType, f, schemeFor }: { calcType: PricingCalcType; f: FormState; schemeFor: SchemeFor }) {
  const [inp, setInp] = useState<CalcInputs>(() => defaultCalcInputs(calcType, f));
  useEffect(() => { setInp(defaultCalcInputs(calcType, f)); }, [calcType]); // eslint-disable-line react-hooks/exhaustive-deps

  const p = (patch: Partial<CalcInputs>) => setInp((prev) => ({ ...prev, ...patch }));
  const result = useMemo(() => computeInteractive(calcType, f, schemeFor, inp), [calcType, f, schemeFor, inp]);
  const orderUnit = f.combined.order_by === "weight" ? "kg" : "km";

  return (
    <div className="rounded-lg border border-primary-border/60 bg-primary-soft/40 px-4 py-3.5 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="w-4 h-4 text-primary" />
        <p className="text-xs font-semibold text-primary-soft-foreground">Kalkulator</p>
        <span className="text-[10px] text-muted-foreground">(ubah input → hasil update otomatis)</span>
      </div>

      {/* ── Inputs per tipe ── */}
      <div className="mb-3.5 space-y-2">
        {calcType === "flat_unit" && (
          <div className="flex flex-wrap gap-3 items-end">
            {f.flatUnit.rate_by === "column" && f.flatUnit.rates.some((r) => r.key.trim()) && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">{f.flatUnit.match_column || "Area"}</span>
                <select value={inp.area} onChange={(e) => p({ area: e.target.value })}
                  className="text-xs rounded border border-border bg-card px-2 py-1.5">
                  {f.flatUnit.rates.filter((r) => r.key.trim()).map((r, i) => <option key={i} value={r.key}>{r.key}</option>)}
                  <option value="">lainnya (default)</option>
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{f.flatUnit.unit === "unique_address" ? "Jumlah alamat unik" : "Jumlah kiriman"}</span>
              <input type="number" min="1" value={inp.units} onChange={(e) => p({ units: e.target.value })}
                className="w-20 text-xs rounded border border-border bg-card px-2 py-1.5" />
            </div>
          </div>
        )}

        {(calcType === "tier" || calcType === "tier_daily") && (
          <div className="flex flex-wrap gap-3">
            {f.tier.distanceOn && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">{calcType === "tier_daily" ? "Total jarak hari ini (km)" : "Jarak (km)"}</span>
                <input type="number" min="0" step="0.1" value={inp.distance} onChange={(e) => p({ distance: e.target.value })}
                  className="w-24 text-xs rounded border border-border bg-card px-2 py-1.5" />
              </div>
            )}
            {f.tier.weightOn && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">{calcType === "tier_daily" ? "Total berat hari ini (kg)" : "Berat (kg)"}</span>
                <input type="number" min="0" step="0.1" value={inp.weight} onChange={(e) => p({ weight: e.target.value })}
                  className="w-24 text-xs rounded border border-border bg-card px-2 py-1.5" />
              </div>
            )}
          </div>
        )}

        {calcType === "threshold_multiple" && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Total berat (kg)</span>
            <input type="number" min="0" step="0.1" value={inp.totalKg} onChange={(e) => p({ totalKg: e.target.value })}
              className="w-28 text-xs rounded border border-border bg-card px-2 py-1.5" />
          </div>
        )}

        {(calcType === "attendance" || calcType === "combined") && (
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

        {calcType === "combined" && (
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

// -------------------- load envelope -> state (best-effort saat edit) --------------------
function stepTierToState(t: StepTier | null | undefined): StepTierState {
  if (!t) return emptyStepTier();
  return {
    base_fee: String(t.base_fee ?? ""),
    base_until: String(t.base_until ?? ""),
    tiers: (t.tiers ?? []).map((x) => ({
      from: String(x.from ?? ""),
      to: x.to === null || x.to === undefined ? "" : String(x.to),
      step: String(x.step ?? ""),
      add_per_step: String(x.add_per_step ?? ""),
    })),
  };
}

function loadForm(scheme: PricingScheme | undefined): { form: FormState; calcType: PricingCalcType; schemeFor: SchemeFor } {
  const form = emptyForm();
  const validType = (t: unknown): t is PricingCalcType => PRICING_TYPES.some((o) => o.key === t);

  if (!scheme || !scheme.params || scheme.params.version !== 1) {
    return { form, calcType: validType(scheme?.calc_type) ? (scheme!.calc_type as PricingCalcType) : "flat_unit", schemeFor: scheme?.scheme_for ?? "rider" };
  }

  const env = scheme.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = env.config as any;
  const type: PricingCalcType = validType(env.type) ? env.type : "flat_unit";

  if (type === "flat_unit") {
    form.flatUnit = {
      unit: c.unit ?? "awb",
      rate_by: c.rate_by ?? "flat",
      match_column: c.match_column ?? "Area",
      flat_rate: String(c.flat_rate ?? ""),
      default_rate: String(c.default_rate ?? ""),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rates: (c.rates ?? []).map((r: any) => ({ key: r.key ?? "", rate: String(r.rate ?? "") })),
    };
  } else if (type === "tier" || type === "tier_daily") {
    form.tier = {
      distanceOn: !!c.distance,
      distance: stepTierToState(c.distance),
      weightOn: !!c.weight,
      weight: stepTierToState(c.weight),
    };
  } else if (type === "threshold_multiple") {
    form.threshold = {
      group_by: c.group_by ?? "Area",
      default_threshold: String(c.default?.threshold ?? ""),
      default_rate: String(c.default?.rate ?? ""),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rules: (c.rules ?? []).map((r: any) => ({ key: r.key ?? "", threshold: String(r.threshold ?? ""), rate: String(r.rate ?? "") })),
    };
  } else if (type === "attendance") {
    form.attendance = {
      full_fee: String(c.full_fee ?? ""),
      standard_hours: String((Number(c.standard_minutes) || 0) / 60 || ""),
      overtimeOn: !!c.overtime?.enabled,
      overtime_rate_per_hour: String(c.overtime?.rate_per_hour ?? "0"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      incentives: (c.incentives ?? []).map((x: any) => ({ label: x.label ?? "", amount: String(x.amount ?? ""), condition: x.condition === "ontime_only" ? "ontime_only" : "always" })),
    };
  } else if (type === "combined") {
    form.combined = {
      daily_fee: String(c.full_fee ?? ""),
      standard_hours: String((Number(c.standard_minutes) || 0) / 60 || ""),
      ontime_bonus: String(c.ontime_bonus ?? "0"),
      order_by: c.order_by === "weight" ? "weight" : "distance",
      order_tier: stepTierToState(c.order_tier),
    };
  }

  // modifiers
  if (env.add_kg) { form.addKgOn = true; form.addKg = stepTierToState(env.add_kg.tier); }
  if (env.multi_drop) { form.multiDropOn = true; form.multiDropFee = String(env.multi_drop.fee_per_extra_shipment ?? ""); }
  if (env.billing_addons) {
    form.billingOn = true;
    form.billing = {
      min_charge: String(env.billing_addons.min_charge ?? ""),
      admin_fee_flat: String(env.billing_addons.admin_fee_flat ?? ""),
      ppn_percent: String(env.billing_addons.ppn_percent ?? ""),
    };
  }

  return { form, calcType: type, schemeFor: scheme.scheme_for ?? "rider" };
}

// -------------------- Shared inputs --------------------
function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full text-sm rounded-md border border-border bg-card px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-ring focus:border-primary-border " +
        (props.className ?? "")
      }
    />
  );
}

function RupiahInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const display = value ? Number(parseRupiah(value)).toLocaleString("id-ID") : "";
  return (
    <TextInput
      value={display}
      placeholder={placeholder ?? "0"}
      onChange={(e) => onChange(String(parseRupiah(e.target.value)))}
      inputMode="numeric"
    />
  );
}

function AddRowBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full mt-2 text-xs text-primary border border-dashed border-primary-border rounded-md px-3 py-1.5 hover:bg-primary-soft/50 inline-flex items-center justify-center gap-1.5"
    >
      <Plus className="w-3.5 h-3.5" />
      {children}
    </button>
  );
}

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">{(children as any)[0]}</tr>
      </thead>
      <tbody>{(children as any).slice(1)}</tbody>
    </table>
  );
}
function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={"font-medium pb-2 pr-2 " + className}>{children}</th>;
}
function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={"py-1 pr-2 align-middle " + className}>{children}</td>;
}
function RowDeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted">
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs text-muted-foreground">{children}</label>;
}

// StepTier editor (dipakai tier jarak/berat & Add-KG)
function StepTierEditor({ value, onChange, unit }: { value: StepTierState; onChange: (v: StepTierState) => void; unit: "km" | "kg" }) {
  const setTier = (i: number, patch: Partial<StepTierState["tiers"][number]>) =>
    onChange({ ...value, tiers: value.tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) });
  const addTier = () => onChange({ ...value, tiers: [...value.tiers, { from: value.base_until || "0", to: "", step: "1", add_per_step: "" }] });
  const delTier = (i: number) => onChange({ ...value, tiers: value.tiers.filter((_, idx) => idx !== i) });

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Base Fee (Rp)</FieldLabel>
          <RupiahInput value={value.base_fee} onChange={(v) => onChange({ ...value, base_fee: v })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Base sampai ({unit})</FieldLabel>
          <TextInput value={value.base_until} inputMode="decimal" onChange={(e) => onChange({ ...value, base_until: e.target.value })} />
        </div>
      </div>
      <TableShell>
        <>
          <Th>Dari ({unit})</Th>
          <Th>Sampai ({unit})</Th>
          <Th>Step</Th>
          <Th>+Rp / step</Th>
          <Th className="w-10" />
        </>
        {value.tiers.map((t, i) => (
          <tr key={i} className="border-t border-border/60">
            <Td><TextInput value={t.from} inputMode="decimal" onChange={(e) => setTier(i, { from: e.target.value })} /></Td>
            <Td><TextInput value={t.to} placeholder="∞" inputMode="decimal" onChange={(e) => setTier(i, { to: e.target.value })} /></Td>
            <Td><TextInput value={t.step} inputMode="decimal" onChange={(e) => setTier(i, { step: e.target.value })} /></Td>
            <Td><RupiahInput value={t.add_per_step} onChange={(v) => setTier(i, { add_per_step: v })} /></Td>
            <Td className="text-center"><RowDeleteBtn onClick={() => delTier(i)} /></Td>
          </tr>
        ))}
      </TableShell>
      <AddRowBtn onClick={addTier}>Tambah Jenjang</AddRowBtn>
    </div>
  );
}

function ToggleBlock({ label, hint, on, onToggle, children }: { label: string; hint?: string; on: boolean; onToggle: (on: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-3.5">
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} className="mt-0.5" />
        <span>
          <span className="text-sm font-medium">{label}</span>
          {hint && <span className="block text-[11px] text-muted-foreground leading-snug">{hint}</span>}
        </span>
      </label>
      {on && <div className="mt-3">{children}</div>}
    </div>
  );
}

// -------------------- Main form --------------------
// Wrapper: ambil scheme yang mau di-edit dulu (async, dari Supabase) SEBELUM
// form-nya di-mount. Ini penting karena field di bawah pakai useState(initial)
// yang cuma jalan sekali pas mount — kalau datanya nyusul belakangan, field
// bakal tetep kosong. Jadi tunggu dulu, baru render form-nya.
export function PricingForm({ mode, schemeId }: { mode: "create" | "edit"; schemeId?: string }) {
  const [existing, setExisting] = useState<PricingScheme | null>(null);
  const [ready, setReady] = useState(mode === "create");

  useEffect(() => {
    if (mode === "edit" && schemeId) {
      getPricingScheme(schemeId).then((s) => {
        setExisting(s ?? null);
        setReady(true);
      });
    }
  }, [mode, schemeId]);

  if (!ready) {
    return (
      <AdminLayout title="Edit Skema Pricing">
        <div className="p-10 text-center text-muted-foreground text-sm">Memuat skema…</div>
      </AdminLayout>
    );
  }

  return <PricingFormInner key={existing?.id ?? "new"} mode={mode} existing={existing ?? undefined} />;
}

function PricingFormInner({ mode, existing }: { mode: "create" | "edit"; existing?: PricingScheme }) {
  const navigate = useNavigate();
  const [clients, setClients] = useState<MockClient[]>([]);

  const loaded = useMemo(() => loadForm(existing), [existing]);

  const [name, setName] = useState(existing?.name ?? "");
  const [clientId, setClientId] = useState(existing?.client_id ?? "");
  const [schemeFor, setSchemeFor] = useState<SchemeFor>(loaded.schemeFor);
  const [effFrom, setEffFrom] = useState(existing?.effective_from ?? new Date().toISOString().slice(0, 10));
  const [effTo, setEffTo] = useState(existing?.effective_to ?? "");
  const [calcType, setCalcType] = useState<PricingCalcType>(loaded.calcType);
  const [f, setF] = useState<FormState>(loaded.form);
  const [tierSubtab, setTierSubtab] = useState<"distance" | "weight">("distance");

  useEffect(() => {
    listClients().then(setClients);
  }, []);

  const activeType = PRICING_TYPES.find((t) => t.key === calcType)!;
  const ActiveIcon = ICONS[activeType.icon as keyof typeof ICONS] ?? MapPin;

  const patch = (p: Partial<FormState>) => setF((prev) => ({ ...prev, ...p }));

  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!effFrom) return toast.error("Tanggal berlaku dari wajib diisi");
    // Nama opsional — kalau dikosongin, dibikinin otomatis dari client + sisi + tipe.
    const autoName = [
      clients.find((c) => c.id === clientId)?.name ?? "Semua Client",
      schemeFor === "client" ? "Client" : "Rider",
      PRICING_TYPES.find((t) => t.key === calcType)?.name ?? calcType,
    ].join(" · ");
    const finalName = name.trim() || autoName;
    setSaving(true);
    try {
      await savePricingScheme({
        id: existing?.id,
        name: finalName,
        client_id: clientId || null,
        scheme_for: schemeFor,
        calc_type: calcType,
        effective_from: effFrom,
        effective_to: effTo || null,
        params: buildEnvelope(calcType, schemeFor, f),
      });
      toast.success(mode === "create" ? "Skema berhasil dibuat" : "Skema berhasil diperbarui");
      navigate({ to: "/admin/pricing" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout
      title={mode === "create" ? "Tambah Skema Pricing" : "Edit Skema Pricing"}
      subtitle="Atur cara kalkulasi harga — sisi rider (cost) atau client (revenue)."
    >
      <button
        type="button"
        onClick={() => navigate({ to: "/admin/pricing" })}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke daftar
      </button>

      {/* Info card */}
      <div className="rounded-xl border border-border bg-card p-5 mb-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Nama Skema <span className="font-normal text-muted-foreground">(opsional)</span></FieldLabel>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Kosongin = otomatis dari client + sisi + tipe" />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Client</FieldLabel>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full text-sm rounded-md border border-border bg-card px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Semua Client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Berlaku Dari</FieldLabel>
            <TextInput type="date" value={effFrom} onChange={(e) => setEffFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Berlaku Sampai <span className="font-normal">(opsional)</span></FieldLabel>
            <TextInput type="date" value={effTo} onChange={(e) => setEffTo(e.target.value)} />
          </div>
        </div>

        {/* Scheme for */}
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Skema untuk</p>
          <div className="grid grid-cols-2 gap-2">
            {(["rider", "client"] as SchemeFor[]).map((sf) => (
              <button
                key={sf}
                type="button"
                onClick={() => setSchemeFor(sf)}
                className={
                  "text-left rounded-md px-3 py-2.5 border transition-colors " +
                  (schemeFor === sf ? "border-2 border-primary bg-primary-soft" : "border-border hover:border-primary-border hover:bg-primary-soft/40")
                }
              >
                <span className="text-xs font-medium block">{sf === "rider" ? "Rider (Cost)" : "Client (Revenue)"}</span>
                <span className="text-[11px] text-muted-foreground">{sf === "rider" ? "Fee yang dibayar ke rider" : "Harga yang ditagih ke client"}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Type chooser + dynamic params */}
      <div className="rounded-xl border border-border bg-card p-5 mb-4 shadow-sm">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Pilih tipe kalkulasi</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
          {PRICING_TYPES.map((t) => {
            const Icon = ICONS[t.icon as keyof typeof ICONS] ?? MapPin;
            const active = calcType === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setCalcType(t.key)}
                className={
                  "text-left rounded-lg px-3 py-3 flex flex-col gap-1 transition-all duration-150 border " +
                  (active
                    ? "border-2 border-primary bg-primary-soft shadow-sm shadow-primary/10"
                    : "border-border hover:border-primary-border/60 hover:bg-primary-soft/20 hover:shadow-sm")
                }
              >
                <Icon className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium leading-tight">{t.name}</span>
                <span className="text-[11px] text-muted-foreground leading-snug">{t.desc}</span>
              </button>
            );
          })}
        </div>

        {/* Callout */}
        <div className="rounded-md border border-primary-border bg-primary-soft px-3.5 py-2.5 mb-4 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-xs text-primary-soft-foreground leading-relaxed">{activeType.callout}</p>
        </div>

        <div className="flex items-center gap-2 mb-4 mt-1">
          <div className="w-6 h-6 rounded-md bg-primary-soft grid place-items-center flex-shrink-0">
            <ActiveIcon className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-[13px] font-semibold tracking-tight" style={{fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            Parameter: <span className="text-muted-foreground font-medium">{activeType.name.toLowerCase()}</span>
          </span>
          <div className="flex-1 h-px bg-border ml-1" />
        </div>

        {/* ===== FLAT UNIT ===== */}
        {calcType === "flat_unit" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Unit yang dihitung</FieldLabel>
                <select
                  value={f.flatUnit.unit}
                  onChange={(e) => patch({ flatUnit: { ...f.flatUnit, unit: e.target.value as FlatUnitState["unit"] } })}
                  className="w-full text-sm rounded-md border border-border bg-card px-2.5 py-1.5"
                >
                  <option value="awb">Per kiriman (AWB)</option>
                  <option value="unique_address">Per alamat unik</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Cara tentukan tarif</FieldLabel>
                <select
                  value={f.flatUnit.rate_by}
                  onChange={(e) => patch({ flatUnit: { ...f.flatUnit, rate_by: e.target.value as FlatUnitState["rate_by"] } })}
                  className="w-full text-sm rounded-md border border-border bg-card px-2.5 py-1.5"
                >
                  <option value="flat">Flat (1 tarif untuk semua)</option>
                  <option value="column">Beda per kolom (mis. Area)</option>
                </select>
              </div>
            </div>

            {f.flatUnit.rate_by === "flat" ? (
              <div className="flex flex-col gap-1.5 max-w-xs">
                <FieldLabel>Flat Rate (Rp)</FieldLabel>
                <RupiahInput value={f.flatUnit.flat_rate} onChange={(v) => patch({ flatUnit: { ...f.flatUnit, flat_rate: v } })} />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>Tarif dibedakan berdasarkan</FieldLabel>
                    <select
                      value={/service|layanan/i.test(f.flatUnit.match_column) ? "Service Type" : /delivery type|return|tipe kirim/i.test(f.flatUnit.match_column) ? "Delivery Type" : "Area"}
                      onChange={(e) => patch({ flatUnit: { ...f.flatUnit, match_column: e.target.value } })}
                      className="w-full text-sm rounded-md border border-border bg-card px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="Area">Area / Wilayah</option>
                      <option value="Service Type">Jenis Layanan (Service)</option>
                      <option value="Delivery Type">Antar / Kembali (Delivery vs Return)</option>
                    </select>
                    <p className="text-[11px] text-muted-foreground">"Antar/Kembali" dideteksi otomatis oleh sistem — ga perlu ada kolomnya di file CSV.</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>Default Rate (fallback, Rp)</FieldLabel>
                    <RupiahInput value={f.flatUnit.default_rate} onChange={(v) => patch({ flatUnit: { ...f.flatUnit, default_rate: v } })} />
                  </div>
                </div>
                <TableShell>
                  <>
                    <Th>{/delivery type|return|tipe kirim/i.test(f.flatUnit.match_column) ? "Nilai (DELIVERY / RETURN)" : /service|layanan/i.test(f.flatUnit.match_column) ? "Nilai (cth: INSTANT)" : "Nilai Kolom (cth: Jakarta Pusat)"}</Th>
                    <Th className="w-44">Tarif (Rp)</Th>
                    <Th className="w-10" />
                  </>
                  {f.flatUnit.rates.map((r, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <Td><TextInput value={r.key} onChange={(e) => patch({ flatUnit: { ...f.flatUnit, rates: f.flatUnit.rates.map((x, idx) => (idx === i ? { ...x, key: e.target.value } : x)) } })} /></Td>
                      <Td><RupiahInput value={r.rate} onChange={(v) => patch({ flatUnit: { ...f.flatUnit, rates: f.flatUnit.rates.map((x, idx) => (idx === i ? { ...x, rate: v } : x)) } })} /></Td>
                      <Td className="text-center"><RowDeleteBtn onClick={() => patch({ flatUnit: { ...f.flatUnit, rates: f.flatUnit.rates.filter((_, idx) => idx !== i) } })} /></Td>
                    </tr>
                  ))}
                </TableShell>
                <AddRowBtn onClick={() => patch({ flatUnit: { ...f.flatUnit, rates: [...f.flatUnit.rates, { key: "", rate: "" }] } })}>Tambah Baris</AddRowBtn>
              </>
            )}
          </div>
        )}

        {/* ===== TIER / TIER_DAILY ===== */}
        {(calcType === "tier" || calcType === "tier_daily") && (
          <div className="space-y-3">
            {calcType === "tier_daily" && (
              <div className="rounded-md border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-xs text-warning">
                Akumulasi harian: jarak/berat semua kiriman 1 rider dalam 1 hari dijumlah dulu, baru dihitung.
              </div>
            )}
            <div className="flex gap-1.5 mb-1">
              {([{ k: "distance", l: "Jarak (km)" }, { k: "weight", l: "Berat (kg)" }] as const).map((t) => (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setTierSubtab(t.k)}
                  className={
                    "text-xs px-3 py-1.5 rounded-md border transition-colors " +
                    (tierSubtab === t.k ? "bg-primary-soft text-primary-soft-foreground border-primary-border font-medium" : "bg-card border-border text-muted-foreground hover:bg-muted")
                  }
                >
                  {t.l}
                </button>
              ))}
            </div>

            {tierSubtab === "distance" && (
              <ToggleBlock label="Pakai Jarak (km)" on={f.tier.distanceOn} onToggle={(on) => patch({ tier: { ...f.tier, distanceOn: on } })}>
                <StepTierEditor unit="km" value={f.tier.distance} onChange={(v) => patch({ tier: { ...f.tier, distance: v } })} />
              </ToggleBlock>
            )}
            {tierSubtab === "weight" && (
              <ToggleBlock label="Pakai Berat (kg)" on={f.tier.weightOn} onToggle={(on) => patch({ tier: { ...f.tier, weightOn: on } })}>
                <StepTierEditor unit="kg" value={f.tier.weight} onChange={(v) => patch({ tier: { ...f.tier, weight: v } })} />
              </ToggleBlock>
            )}
            {f.tier.distanceOn && f.tier.weightOn && (
              <p className="text-[11px] text-muted-foreground">Jarak & berat dua-duanya aktif → hasilnya dijumlah.</p>
            )}
          </div>
        )}

        {/* ===== THRESHOLD MULTIPLE ===== */}
        {calcType === "threshold_multiple" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Qty dibaca dari berat aktual (kg). Fee per grup = ceil(total kg / threshold) × rate.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Kolom pengelompokan</FieldLabel>
                <TextInput value={f.threshold.group_by} onChange={(e) => patch({ threshold: { ...f.threshold, group_by: e.target.value } })} placeholder="Area" />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Default Threshold (kg)</FieldLabel>
                <TextInput value={f.threshold.default_threshold} inputMode="decimal" onChange={(e) => patch({ threshold: { ...f.threshold, default_threshold: e.target.value } })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Default Rate (Rp)</FieldLabel>
                <RupiahInput value={f.threshold.default_rate} onChange={(v) => patch({ threshold: { ...f.threshold, default_rate: v } })} />
              </div>
            </div>
            <TableShell>
              <>
                <Th>Area / Store</Th>
                <Th className="w-32">Threshold (kg)</Th>
                <Th className="w-44">Rate (Rp)</Th>
                <Th className="w-10" />
              </>
              {f.threshold.rules.map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  <Td><TextInput value={r.key} onChange={(e) => patch({ threshold: { ...f.threshold, rules: f.threshold.rules.map((x, idx) => (idx === i ? { ...x, key: e.target.value } : x)) } })} /></Td>
                  <Td><TextInput value={r.threshold} inputMode="decimal" onChange={(e) => patch({ threshold: { ...f.threshold, rules: f.threshold.rules.map((x, idx) => (idx === i ? { ...x, threshold: e.target.value } : x)) } })} /></Td>
                  <Td><RupiahInput value={r.rate} onChange={(v) => patch({ threshold: { ...f.threshold, rules: f.threshold.rules.map((x, idx) => (idx === i ? { ...x, rate: v } : x)) } })} /></Td>
                  <Td className="text-center"><RowDeleteBtn onClick={() => patch({ threshold: { ...f.threshold, rules: f.threshold.rules.filter((_, idx) => idx !== i) } })} /></Td>
                </tr>
              ))}
            </TableShell>
            <AddRowBtn onClick={() => patch({ threshold: { ...f.threshold, rules: [...f.threshold.rules, { key: "", threshold: "", rate: "" }] } })}>Tambah Store</AddRowBtn>
          </div>
        )}

        {/* ===== ATTENDANCE ===== */}
        {calcType === "attendance" && (
          <div className="space-y-4">
            <div className="rounded-md border border-primary-border bg-primary-soft px-3.5 py-2.5 text-xs text-primary-soft-foreground">
              Rumus: (fee penuh × proporsi jam kerja) {f.attendance.overtimeOn ? "+ lembur " : ""}+ insentif (nominal ditentuin di sini, data absensi cuma dipakai cek syarat — mis. OTP=ONTIME).
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Fee Penuh per Shift (Rp)</FieldLabel>
                <RupiahInput value={f.attendance.full_fee} onChange={(v) => patch({ attendance: { ...f.attendance, full_fee: v } })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Jam Standar per Shift</FieldLabel>
                <TextInput type="number" value={f.attendance.standard_hours} onChange={(e) => patch({ attendance: { ...f.attendance, standard_hours: e.target.value } })} placeholder="8" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground -mt-2">Kerja kurang dari jam standar dibayar proporsional. Kerja pas/lebih = fee penuh (kecuali lembur dinyalain di bawah).</p>

            <ToggleBlock
              label="Lembur (bayar kelebihan jam kerja)"
              hint="Kalau mati, kerja lebih dari jam standar tetap mentok di fee penuh (tidak ada tambahan)."
              on={f.attendance.overtimeOn}
              onToggle={(on) => patch({ attendance: { ...f.attendance, overtimeOn: on } })}
            >
              <div className="max-w-xs">
                <FieldLabel>Tarif Lembur per Jam (Rp)</FieldLabel>
                <RupiahInput value={f.attendance.overtime_rate_per_hour} onChange={(v) => patch({ attendance: { ...f.attendance, overtime_rate_per_hour: v } })} />
              </div>
            </ToggleBlock>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Insentif</p>
              <TableShell>
                <>
                  <Th>Nama Insentif</Th>
                  <Th className="w-36">Jumlah (Rp)</Th>
                  <Th className="w-44">Syarat Cair</Th>
                  <Th className="w-10" />
                </>
                {f.attendance.incentives.map((c, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <Td><TextInput value={c.label} placeholder="cth: Insentif Ontime" onChange={(e) => patch({ attendance: { ...f.attendance, incentives: f.attendance.incentives.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)) } })} /></Td>
                    <Td><RupiahInput value={c.amount} onChange={(v) => patch({ attendance: { ...f.attendance, incentives: f.attendance.incentives.map((x, idx) => (idx === i ? { ...x, amount: v } : x)) } })} /></Td>
                    <Td>
                      <select
                        value={c.condition}
                        onChange={(e) => patch({ attendance: { ...f.attendance, incentives: f.attendance.incentives.map((x, idx) => (idx === i ? { ...x, condition: e.target.value as "always" | "ontime_only" } : x)) } })}
                        className="w-full text-sm rounded-md border border-border bg-card px-2 py-1.5"
                      >
                        <option value="always">Selalu (hari kerja)</option>
                        <option value="ontime_only">Cuma kalau ONTIME</option>
                      </select>
                    </Td>
                    <Td className="text-center"><RowDeleteBtn onClick={() => patch({ attendance: { ...f.attendance, incentives: f.attendance.incentives.filter((_, idx) => idx !== i) } })} /></Td>
                  </tr>
                ))}
              </TableShell>
              <AddRowBtn onClick={() => patch({ attendance: { ...f.attendance, incentives: [...f.attendance.incentives, { label: "", amount: "", condition: "always" }] } })}>Tambah Insentif</AddRowBtn>
              <p className="text-[11px] text-muted-foreground mt-1.5">"Cuma kalau ONTIME" itu biner — hari LATE dapet Rp0 buat insentif ini, ga ada setengah-setengah.</p>
            </div>
          </div>
        )}

        {/* ===== COMBINED ===== */}
        {calcType === "combined" && (
          <div className="space-y-4">
            <div className="rounded-md border border-primary-border bg-primary-soft px-3.5 py-2.5 text-xs text-primary-soft-foreground">
              Tiga komponen: <strong>fee harian</strong> (proporsional jam kerja dari absensi) + <strong>bonus ontime</strong> (kalau tidak terlambat) + <strong>fee per kiriman</strong> berdasarkan {f.combined.order_by === "weight" ? "berat (kg)" : "jarak (km)"} berjenjang.
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Komponen Harian (dari data absensi)</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Fee Penuh per Hari (Rp)</FieldLabel>
                  <RupiahInput value={f.combined.daily_fee} onChange={(v) => patch({ combined: { ...f.combined, daily_fee: v } })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Jam Standar per Shift</FieldLabel>
                  <TextInput type="number" value={f.combined.standard_hours} onChange={(e) => patch({ combined: { ...f.combined, standard_hours: e.target.value } })} placeholder="8" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Bonus Ontime (Rp)</FieldLabel>
                  <RupiahInput value={f.combined.ontime_bonus} onChange={(v) => patch({ combined: { ...f.combined, ontime_bonus: v } })} />
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
                    onClick={() => patch({ combined: { ...f.combined, order_by: t.k } })}
                    className={
                      "text-xs px-3 py-1.5 rounded-md border transition-colors " +
                      (f.combined.order_by === t.k ? "bg-primary-soft text-primary-soft-foreground border-primary-border font-medium" : "bg-card border-border text-muted-foreground hover:bg-muted")
                    }
                  >
                    {t.l}
                  </button>
                ))}
              </div>
              <StepTierEditor
                unit={f.combined.order_by === "weight" ? "kg" : "km"}
                value={f.combined.order_tier}
                onChange={(v) => patch({ combined: { ...f.combined, order_tier: v } })}
              />
            </div>
          </div>
        )}

        <InteractiveCalc calcType={calcType} f={f} schemeFor={schemeFor} />
      </div>

      {/* ===== MODIFIERS ===== */}
      <div className="rounded-xl border border-border bg-card p-5 mb-4 space-y-3 shadow-sm">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Modifier (opsional)</p>

        {(calcType === "flat_unit" || calcType === "threshold_multiple") && (
          <ToggleBlock
            label="Add-KG (surcharge berat)"
            hint="Biaya tambahan berdasarkan berat, bertingkat. Buat tipe yang belum punya hitungan berat sendiri."
            on={f.addKgOn}
            onToggle={(on) => patch({ addKgOn: on })}
          >
            <StepTierEditor unit="kg" value={f.addKg} onChange={(v) => patch({ addKg: v })} />
          </ToggleBlock>
        )}

        <ToggleBlock
          label="Multi-drop (kiriman ke-2 dst)"
          hint="Otomatis mulai kiriman ke-2 dalam hari yang sama, per rider."
          on={f.multiDropOn}
          onToggle={(on) => patch({ multiDropOn: on })}
        >
          <div className="flex flex-col gap-1.5 max-w-xs">
            <FieldLabel>Fee per kiriman ekstra (Rp)</FieldLabel>
            <RupiahInput value={f.multiDropFee} onChange={(v) => patch({ multiDropFee: v })} />
          </div>
        </ToggleBlock>

        {schemeFor === "client" && (
          <ToggleBlock
            label="Billing Add-ons (khusus client)"
            hint="Urutan hitung: min charge (lantai) → + admin fee → × (1 + PPN%). PPN paling akhir."
            on={f.billingOn}
            onToggle={(on) => patch({ billingOn: on })}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Min Charge (Rp)</FieldLabel>
                <RupiahInput value={f.billing.min_charge} onChange={(v) => patch({ billing: { ...f.billing, min_charge: v } })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Admin Fee (Rp)</FieldLabel>
                <RupiahInput value={f.billing.admin_fee_flat} onChange={(v) => patch({ billing: { ...f.billing, admin_fee_flat: v } })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel>PPN (%)</FieldLabel>
                <TextInput value={f.billing.ppn_percent} inputMode="decimal" onChange={(e) => patch({ billing: { ...f.billing, ppn_percent: e.target.value } })} />
              </div>
            </div>
          </ToggleBlock>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/admin/pricing" })}
          className="rounded-md border border-border bg-card px-4 py-2 text-sm hover:bg-muted"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? "Menyimpan…" : "Simpan Skema"}
        </button>
      </div>
    </AdminLayout>
  );
}
