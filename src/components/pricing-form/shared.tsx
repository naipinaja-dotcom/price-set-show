// Atom & helper generik dipakai bareng oleh delivery-fields.tsx,
// attendance-fields.tsx, interactive-calc.tsx, dan shell (pricing-form.tsx).
// Dipecah dari pricing-form.tsx per docs/pricing-engine-v2-design.md §6.
import type { StepTier } from "@/lib/pricing-types";
import { formatRupiah, parseRupiah } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";

// -------------------- StepTier: state form <-> envelope --------------------
export interface StepTierState {
  base_fee: string;
  base_until: string;
  tiers: { from: string; to: string; step: string; add_per_step: string }[];
}

export const emptyStepTier = (): StepTierState => ({ base_fee: "", base_until: "", tiers: [] });

export function buildStepTier(s: StepTierState): StepTier {
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

export function stepTierToState(t: StepTier | null | undefined): StepTierState {
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

// Dipakai kalkulator interaktif — hitung breakdown step-tier utk 1 nilai (km/kg).
export interface ExStep {
  text: string;
  amount?: number;
}

export function stepTierBreakdown(s: StepTierState, value: number, unit: string): { steps: ExStep[]; total: number } {
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

// -------------------- Shared inputs --------------------
export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
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

export function RupiahInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
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

export function AddRowBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
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

export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">{(children as any)[0]}</tr>
      </thead>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <tbody>{(children as any).slice(1)}</tbody>
    </table>
  );
}
export function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={"font-medium pb-2 pr-2 " + className}>{children}</th>;
}
export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={"py-1 pr-2 align-middle " + className}>{children}</td>;
}
export function RowDeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted">
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs text-muted-foreground">{children}</label>;
}

// StepTier editor (dipakai tier jarak/berat, Add-KG, & order-tier hybrid)
export function StepTierEditor({ value, onChange, unit }: { value: StepTierState; onChange: (v: StepTierState) => void; unit: "km" | "kg" }) {
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

export function ToggleBlock({ label, hint, on, onToggle, children }: { label: string; hint?: string; on: boolean; onToggle: (on: boolean) => void; children?: React.ReactNode }) {
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
