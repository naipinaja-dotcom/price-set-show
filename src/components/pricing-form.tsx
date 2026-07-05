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
} from "lucide-react";
import { calcAttendanceScheme } from "@/lib/pricing-calc";
import { toast } from "sonner";

const ICONS = { MapPin, Truck, Ruler, Route: RouteIcon, Home, Package, CalendarDays } as const;

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

const emptyStepTier = (): StepTierState => ({ base_fee: "", base_until: "", tiers: [] });

interface FormState {
  flatUnit: FlatUnitState;
  tier: TierState; // dipakai untuk "tier" dan "tier_daily"
  threshold: ThresholdState;
  attendance: AttendanceState;
  // modifiers
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

// -------------------- Contoh perhitungan otomatis (buat orang awam) --------------------
// Bikin skenario contoh + rincian langkah, dihitung pakai LOGIKA yang SAMA
// persis dengan mesin asli (pricing-calc.ts) supaya contoh di layar = hasil beneran.
interface ExStep {
  text: string;
  amount?: number;
}
interface WorkedExample {
  scenario: string;
  steps: ExStep[];
  total: { label: string; amount: number };
  notes: string[];
}

// Cermin dari stepTierFee() di pricing-calc, tapi keluarin rincian tiap jenjang.
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

function buildExample(calcType: PricingCalcType, f: FormState, schemeFor: SchemeFor): WorkedExample | null {
  const notes: string[] = [];
  const addModifierNotes = () => {
    if ((calcType === "flat_unit" || calcType === "threshold_multiple") && f.addKgOn)
      notes.push("Add-KG nyala: biaya berat ditambah DI ATAS hasil ini, sesuai berat tiap kiriman.");
    if (f.multiDropOn)
      notes.push(`Multi-drop nyala: kiriman ke-2 dst di hari yang sama +${formatRupiah(parseRupiah(f.multiDropFee))} per kiriman.`);
    if (schemeFor === "client" && f.billingOn)
      notes.push("Billing client nyala: total tagihan masih ditambah min charge / admin fee & PPN di akhir.");
  };

  switch (calcType) {
    case "flat_unit": {
      if (f.flatUnit.rate_by === "flat") {
        const rate = parseRupiah(f.flatUnit.flat_rate);
        const unitWord = f.flatUnit.unit === "unique_address" ? "alamat" : "kiriman";
        const steps: ExStep[] = [
          { text: `Tarif per ${unitWord}`, amount: rate },
          { text: `Misal 3 ${unitWord} → 3 × ${formatRupiah(rate)}`, amount: rate * 3 },
        ];
        if (f.flatUnit.unit === "unique_address")
          notes.push("Per alamat unik: 3 paket ke 1 alamat yang sama dihitung 1× saja.");
        addModifierNotes();
        return { scenario: `Contoh: 3 ${unitWord}.`, steps, total: { label: `Total 3 ${unitWord}`, amount: rate * 3 }, notes };
      }
      const first = f.flatUnit.rates.find((r) => r.key.trim());
      const col = f.flatUnit.match_column || "Area";
      const rate = first ? parseRupiah(first.rate) : parseRupiah(f.flatUnit.default_rate);
      const def = parseRupiah(f.flatUnit.default_rate);
      const steps: ExStep[] = [
        { text: `${col} = "${first?.key ?? "(isi dulu)"}" → tarif`, amount: rate },
        { text: `${col} lain (tidak ada di daftar) → default`, amount: def },
      ];
      addModifierNotes();
      return { scenario: `Contoh: 1 kiriman, tarif ikut kolom "${col}".`, steps, total: { label: `Fee 1 kiriman ke "${first?.key ?? "-"}"`, amount: rate }, notes };
    }
    case "tier":
    case "tier_daily": {
      const useDist = f.tier.distanceOn || !f.tier.weightOn;
      const unit = useDist ? "km" : "kg";
      const src = useDist ? f.tier.distance : f.tier.weight;
      const sample = (Number(src.base_until) || 0) + 3;
      const { steps, total } = stepTierBreakdown(src, sample, unit);
      const scenario =
        calcType === "tier"
          ? `Contoh: 1 kiriman dengan ${useDist ? "jarak" : "berat"} ${sample} ${unit}.`
          : `Contoh: 1 rider, total ${useDist ? "jarak" : "berat"} sehari ${sample} ${unit}.`;
      if (f.tier.distanceOn && f.tier.weightOn)
        notes.push("Jarak & berat dua-duanya nyala → hasil berat dihitung dengan cara yang sama, lalu DIJUMLAH ke hasil ini.");
      addModifierNotes();
      return { scenario, steps, total: { label: "Total", amount: total }, notes };
    }
    case "threshold_multiple": {
      const rule = f.threshold.rules.find((r) => r.key.trim());
      const th = Number(rule?.threshold ?? f.threshold.default_threshold) || 0;
      const rate = parseRupiah(rule?.rate ?? f.threshold.default_rate);
      const sampleKg = th > 0 ? th * 2 + 1 : 0;
      const mult = th > 0 ? Math.ceil(sampleKg / th) : 0;
      const fee = mult * rate;
      const label = rule?.key ?? "(store default)";
      const steps: ExStep[] = [
        { text: `Aturan: tiap ${th} kg dihitung 1× (@ ${formatRupiah(rate)})` },
        { text: `${sampleKg} kg ÷ ${th} = ${th > 0 ? (sampleKg / th).toFixed(2) : "-"} → dibulatkan ke ATAS: ${mult}×` },
        { text: `${mult} × ${formatRupiah(rate)}`, amount: fee },
      ];
      addModifierNotes();
      return { scenario: `Contoh: store "${label}" total ${sampleKg} kg dalam sehari.`, steps, total: { label: "Fee store hari itu", amount: fee }, notes };
    }
    case "attendance": {
      const env = buildEnvelope("attendance", schemeFor, f);
      const std = Number(f.attendance.standard_hours) || 0;
      const worked = std > 1 ? std - 1 : std; // kerja kurang 1 jam biar keliatan prorata-nya
      const res = calcAttendanceScheme(env, [
        { log_date: "2026-01-01", duration_minutes: Math.round(worked * 60), is_late: false, is_absent: false },
      ]);
      const row = res.perRow[0];
      const full = parseRupiah(f.attendance.full_fee);
      const pct = std > 0 ? Math.round((worked / std) * 100) : 0;
      const steps: ExStep[] = [
        { text: "Fee penuh per shift", amount: full },
        { text: `Kerja ${worked} dari ${std} jam (${pct}%) → fee dasar`, amount: row?.base ?? 0 },
      ];
      if ((row?.overtime ?? 0) > 0) steps.push({ text: "Lembur", amount: row.overtime });
      f.attendance.incentives
        .filter((c) => c.label.trim())
        .forEach((c) => {
          const amt = parseRupiah(c.amount);
          steps.push({ text: `+ ${c.label} ${c.condition === "always" ? "(selalu)" : "(status ONTIME ✓)"}`, amount: amt });
        });
      notes.push('Kalau statusnya LATE, insentif bersyarat "ONTIME" jadi Rp0 (biner, tidak setengah).');
      return { scenario: `Contoh: 1 hari kerja ${worked} jam, status ONTIME.`, steps, total: { label: "Fee hari itu", amount: row?.fee ?? 0 }, notes };
    }
  }
  return null;
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

  // contoh perhitungan otomatis (live, pakai mesin asli)
  const example = useMemo(() => buildExample(calcType, f, schemeFor), [calcType, f, schemeFor]);

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
      <div className="rounded-lg border border-border bg-card p-5 mb-4">
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
      <div className="rounded-lg border border-border bg-card p-5 mb-4">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-3">Pilih tipe kalkulasi</p>
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
                  "text-left rounded-md px-3 py-2.5 flex flex-col gap-0.5 transition-colors border " +
                  (active ? "border-2 border-primary bg-primary-soft" : "border-border hover:border-primary-border hover:bg-primary-soft/40")
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

        <p className="text-sm font-medium pb-2 mb-3 border-b border-border flex items-center gap-2">
          <ActiveIcon className="w-4 h-4 text-primary" />
          Parameter: {activeType.name.toLowerCase()}
        </p>

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

        {/* Contoh perhitungan otomatis */}
        {example && (
          <div className="rounded-lg border border-primary-border/60 bg-primary-soft/40 px-4 py-3.5 mt-4">
            <div className="flex items-center gap-2 mb-1.5">
              <Calculator className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold text-primary-soft-foreground">Contoh Perhitungan</p>
              <span className="text-[10px] text-muted-foreground">(otomatis dari angka di atas)</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2.5">{example.scenario}</p>
            <div className="space-y-1">
              {example.steps.map((s, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{s.text}</span>
                  {s.amount !== undefined && (
                    <span className="font-medium tabular-nums whitespace-nowrap">{formatRupiah(s.amount)}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 mt-2.5 pt-2.5 border-t border-primary-border/50">
              <span className="text-xs font-semibold">{example.total.label}</span>
              <span className="text-base font-bold text-primary tabular-nums">{formatRupiah(example.total.amount)}</span>
            </div>
            {example.notes.length > 0 && (
              <ul className="mt-2.5 space-y-1">
                {example.notes.map((n, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5">
                    <span className="text-primary flex-shrink-0">•</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ===== MODIFIERS ===== */}
      <div className="rounded-lg border border-border bg-card p-5 mb-4 space-y-3">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Modifier (opsional)</p>

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
