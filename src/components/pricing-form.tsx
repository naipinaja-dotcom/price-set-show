import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin-layout";
import {
  PRICING_TYPES,
  type PricingCalcType,
  type PricingScheme,
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
  Plus,
  Save,
  Trash2,
  Lightbulb,
} from "lucide-react";
import { toast } from "sonner";

const ICONS = { MapPin, Truck, Ruler, Route: RouteIcon, Home, Package } as const;

// -------------------- Param state shapes --------------------
interface AreaRow {
  districts: string;
  rate: string;
}
interface ServiceRow {
  name: string;
  rate: string;
}
interface DistanceTier {
  type: "flat" | "tier";
  from: string;
  to: string;
  base: string;
  step: string;
  rate_per_step: string;
}
interface WeightTier extends DistanceTier {}
interface KmWeightRow {
  from: string;
  to: string;
  surcharge: string;
}
interface AddrRow {
  district: string;
  rate: string;
}
interface BoxRow {
  store: string;
  threshold: string;
  rate: string;
}

interface ParamsState {
  area: { rows: AreaRow[]; default_rate: string };
  service: { rows: ServiceRow[] };
  tier: {
    distance: DistanceTier[];
    weight: WeightTier[];
    stop_flat: string;
    stop_starts_from: string;
  };
  km: {
    base_price: string;
    threshold_km: string;
    rate_over: string;
    weight: KmWeightRow[];
  };
  addr: { default_rate: string; rows: AddrRow[] };
  box: { rows: BoxRow[] };
}

function emptyParams(): ParamsState {
  return {
    area: {
      default_rate: "10000",
      rows: [
        { districts: "Jakarta Pusat, Depok", rate: "10000" },
        { districts: "Bekasi, Tangerang", rate: "12000" },
      ],
    },
    service: {
      rows: [
        { name: "Delivery", rate: "25000" },
        { name: "Return", rate: "10000" },
      ],
    },
    tier: {
      distance: [
        { type: "flat", from: "0", to: "5", base: "13000", step: "0", rate_per_step: "0" },
        { type: "tier", from: "5", to: "15", base: "16000", step: "1", rate_per_step: "2000" },
      ],
      weight: [{ type: "flat", from: "0", to: "20", base: "0", step: "0", rate_per_step: "0" }],
      stop_flat: "3500",
      stop_starts_from: "3",
    },
    km: {
      base_price: "20000",
      threshold_km: "10",
      rate_over: "1500",
      weight: [
        { from: "0", to: "20", surcharge: "0" },
        { from: "20", to: "999", surcharge: "2000" },
      ],
    },
    addr: {
      default_rate: "10000",
      rows: [{ district: "Jakarta Pusat", rate: "12000" }],
    },
    box: {
      rows: [
        { store: "Store A", threshold: "4", rate: "12000" },
        { store: "Store B", threshold: "4", rate: "20000" },
      ],
    },
  };
}

// -------------------- Config builders (to JSON per spec) --------------------
function buildConfig(type: PricingCalcType, p: ParamsState): Record<string, unknown> {
  switch (type) {
    case "flat_per_awb_area":
      return {
        default_rate: parseRupiah(p.area.default_rate),
        area_rates: p.area.rows
          .filter((r) => r.districts.trim())
          .map((r) => ({
            districts: r.districts
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean),
            rate: parseRupiah(r.rate),
          })),
      };
    case "flat_per_awb_service_type":
      return {
        service_rates: Object.fromEntries(
          p.service.rows
            .filter((r) => r.name.trim())
            .map((r) => [r.name.trim().toLowerCase(), parseRupiah(r.rate)]),
        ),
      };
    case "tier_distance_weight":
      return {
        distance_tiers: p.tier.distance.map((t) => ({
          type: t.type,
          from: Number(t.from) || 0,
          to: Number(t.to) || 0,
          base: parseRupiah(t.base),
          step: Number(t.step) || 0,
          rate_per_step: parseRupiah(t.rate_per_step),
        })),
        weight_tiers: p.tier.weight.map((t) => ({
          type: t.type,
          from: Number(t.from) || 0,
          to: Number(t.to) || 0,
          base: parseRupiah(t.base),
          step: Number(t.step) || 0,
          rate_per_step: parseRupiah(t.rate_per_step),
        })),
        stop_fee: {
          flat_per_stop: parseRupiah(p.tier.stop_flat),
          starts_from_stop: Number(p.tier.stop_starts_from) || 0,
        },
      };
    case "km_accumulation_weight":
      return {
        km_base_price: parseRupiah(p.km.base_price),
        km_threshold: Number(p.km.threshold_km) || 0,
        km_rate_over_threshold: parseRupiah(p.km.rate_over),
        weight_tiers: p.km.weight.map((r) => ({
          from: Number(r.from) || 0,
          to: Number(r.to) || 0,
          surcharge: parseRupiah(r.surcharge),
        })),
        aggregation: "daily",
      };
    case "unique_address":
      return {
        default_rate_per_address: parseRupiah(p.addr.default_rate),
        district_rates: p.addr.rows
          .filter((r) => r.district.trim())
          .map((r) => ({ districts: [r.district.trim()], rate: parseRupiah(r.rate) })),
      };
    case "store_box_threshold":
      return {
        store_rules: p.box.rows
          .filter((r) => r.store.trim())
          .map((r) => ({
            store: r.store.trim(),
            threshold_box: Number(r.threshold) || 0,
            rate_per_threshold: parseRupiah(r.rate),
          })),
        rounding: "ceil",
      };
  }
}

// Reverse: load existing config back into form state (best-effort for editing demo schemes)
function loadParams(scheme: PricingScheme | undefined, base: ParamsState): ParamsState {
  if (!scheme) return base;
  const c = scheme.config as any;
  const p = { ...base };
  switch (scheme.calc_type) {
    case "flat_per_awb_area":
      p.area = {
        default_rate: String(c.default_rate ?? ""),
        rows: (c.area_rates ?? []).map((r: any) => ({
          districts: (r.districts ?? []).join(", "),
          rate: String(r.rate ?? ""),
        })),
      };
      break;
    case "flat_per_awb_service_type":
      p.service = {
        rows: Object.entries(c.service_rates ?? {}).map(([name, rate]) => ({
          name,
          rate: String(rate),
        })),
      };
      break;
    case "tier_distance_weight":
      p.tier = {
        distance: (c.distance_tiers ?? []).map((t: any) => ({
          type: t.type ?? "flat",
          from: String(t.from ?? ""),
          to: String(t.to ?? ""),
          base: String(t.base ?? ""),
          step: String(t.step ?? ""),
          rate_per_step: String(t.rate_per_step ?? ""),
        })),
        weight: (c.weight_tiers ?? []).map((t: any) => ({
          type: t.type ?? "flat",
          from: String(t.from ?? ""),
          to: String(t.to ?? ""),
          base: String(t.base ?? ""),
          step: String(t.step ?? ""),
          rate_per_step: String(t.rate_per_step ?? ""),
        })),
        stop_flat: String(c.stop_fee?.flat_per_stop ?? ""),
        stop_starts_from: String(c.stop_fee?.starts_from_stop ?? ""),
      };
      break;
    case "km_accumulation_weight":
      p.km = {
        base_price: String(c.km_base_price ?? ""),
        threshold_km: String(c.km_threshold ?? ""),
        rate_over: String(c.km_rate_over_threshold ?? ""),
        weight: (c.weight_tiers ?? []).map((r: any) => ({
          from: String(r.from ?? ""),
          to: String(r.to ?? ""),
          surcharge: String(r.surcharge ?? ""),
        })),
      };
      break;
    case "unique_address":
      p.addr = {
        default_rate: String(c.default_rate_per_address ?? ""),
        rows: (c.district_rates ?? []).map((r: any) => ({
          district: (r.districts ?? [])[0] ?? "",
          rate: String(r.rate ?? ""),
        })),
      };
      break;
    case "store_box_threshold":
      p.box = {
        rows: (c.store_rules ?? []).map((r: any) => ({
          store: r.store ?? "",
          threshold: String(r.threshold_box ?? ""),
          rate: String(r.rate_per_threshold ?? ""),
        })),
      };
      break;
  }
  return p;
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

function RupiahInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
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
    <button
      type="button"
      onClick={onClick}
      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

// -------------------- Main form --------------------
export function PricingForm({ mode, schemeId }: { mode: "create" | "edit"; schemeId?: string }) {
  const navigate = useNavigate();
  const [clients, setClients] = useState<MockClient[]>([]);

  const existing = useMemo(
    () => (mode === "edit" && schemeId ? getPricingScheme(schemeId) : undefined),
    [mode, schemeId],
  );

  const [name, setName] = useState(existing?.name ?? "");
  const [clientId, setClientId] = useState(existing?.client_id ?? "");
  const [effFrom, setEffFrom] = useState(existing?.effective_from ?? new Date().toISOString().slice(0, 10));
  const [effTo, setEffTo] = useState(existing?.effective_to ?? "");
  const [calcType, setCalcType] = useState<PricingCalcType>(existing?.calc_type ?? "flat_per_awb_area");
  const [params, setParams] = useState<ParamsState>(() => loadParams(existing, emptyParams()));
  const [tierSubtab, setTierSubtab] = useState<"distance" | "weight" | "stop">("distance");

  useEffect(() => {
    setClients(listClients());
  }, []);

  const activeType = PRICING_TYPES.find((t) => t.key === calcType)!;
  const ActiveIcon = ICONS[activeType.icon as keyof typeof ICONS] ?? MapPin;

  const handleSave = () => {
    if (!name.trim()) return toast.error("Nama skema wajib diisi");
    if (!effFrom) return toast.error("Tanggal berlaku dari wajib diisi");
    const client = clients.find((c) => c.id === clientId);
    const scheme: PricingScheme = {
      id: existing?.id ?? "ps_" + Math.random().toString(36).slice(2, 10),
      name: name.trim(),
      client_id: clientId || null,
      client_name: client?.name ?? null,
      calc_type: calcType,
      effective_from: effFrom,
      effective_to: effTo || null,
      config: buildConfig(calcType, params),
      created_at: existing?.created_at ?? new Date().toISOString(),
    };
    savePricingScheme(scheme);
    toast.success(mode === "create" ? "Skema berhasil dibuat" : "Skema berhasil diperbarui");
    navigate({ to: "/admin/pricing" });
  };

  // ------- Param editors -------
  const updateArea = (i: number, patch: Partial<AreaRow>) =>
    setParams((p) => ({
      ...p,
      area: { ...p.area, rows: p.area.rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) },
    }));
  const addArea = () =>
    setParams((p) => ({ ...p, area: { ...p.area, rows: [...p.area.rows, { districts: "", rate: "" }] } }));
  const delArea = (i: number) =>
    setParams((p) => ({ ...p, area: { ...p.area, rows: p.area.rows.filter((_, idx) => idx !== i) } }));

  const updateService = (i: number, patch: Partial<ServiceRow>) =>
    setParams((p) => ({
      ...p,
      service: { rows: p.service.rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) },
    }));
  const addService = () =>
    setParams((p) => ({ ...p, service: { rows: [...p.service.rows, { name: "", rate: "" }] } }));
  const delService = (i: number) =>
    setParams((p) => ({ ...p, service: { rows: p.service.rows.filter((_, idx) => idx !== i) } }));

  const updateTier = (which: "distance" | "weight", i: number, patch: Partial<DistanceTier>) =>
    setParams((p) => ({
      ...p,
      tier: { ...p.tier, [which]: p.tier[which].map((r, idx) => (idx === i ? { ...r, ...patch } : r)) },
    }));
  const addTier = (which: "distance" | "weight", type: "flat" | "tier") =>
    setParams((p) => ({
      ...p,
      tier: {
        ...p.tier,
        [which]: [...p.tier[which], { type, from: "", to: "", base: "", step: "", rate_per_step: "" }],
      },
    }));
  const delTier = (which: "distance" | "weight", i: number) =>
    setParams((p) => ({ ...p, tier: { ...p.tier, [which]: p.tier[which].filter((_, idx) => idx !== i) } }));

  const updateKmWeight = (i: number, patch: Partial<KmWeightRow>) =>
    setParams((p) => ({
      ...p,
      km: { ...p.km, weight: p.km.weight.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) },
    }));
  const addKmWeight = () =>
    setParams((p) => ({ ...p, km: { ...p.km, weight: [...p.km.weight, { from: "", to: "", surcharge: "" }] } }));
  const delKmWeight = (i: number) =>
    setParams((p) => ({ ...p, km: { ...p.km, weight: p.km.weight.filter((_, idx) => idx !== i) } }));

  const updateAddr = (i: number, patch: Partial<AddrRow>) =>
    setParams((p) => ({
      ...p,
      addr: { ...p.addr, rows: p.addr.rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) },
    }));
  const addAddr = () =>
    setParams((p) => ({ ...p, addr: { ...p.addr, rows: [...p.addr.rows, { district: "", rate: "" }] } }));
  const delAddr = (i: number) =>
    setParams((p) => ({ ...p, addr: { ...p.addr, rows: p.addr.rows.filter((_, idx) => idx !== i) } }));

  const updateBox = (i: number, patch: Partial<BoxRow>) =>
    setParams((p) => ({
      ...p,
      box: { rows: p.box.rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) },
    }));
  const addBox = () =>
    setParams((p) => ({ ...p, box: { rows: [...p.box.rows, { store: "", threshold: "", rate: "" }] } }));
  const delBox = (i: number) =>
    setParams((p) => ({ ...p, box: { rows: p.box.rows.filter((_, idx) => idx !== i) } }));

  // Preview estimasi (simple heuristic)
  const preview = useMemo(() => {
    switch (calcType) {
      case "flat_per_awb_area": {
        const first = parseRupiah(params.area.rows[0]?.rate ?? "0");
        return { label: "Estimasi pendapatan per paket", hint: "misal 10 paket area pertama", value: first * 10 };
      }
      case "flat_per_awb_service_type": {
        const sum = params.service.rows.reduce((acc, r) => acc + parseRupiah(r.rate), 0);
        return { label: "Estimasi per hari", hint: "1× setiap tipe layanan", value: sum };
      }
      case "tier_distance_weight": {
        const d = params.tier.distance[0];
        const w = params.tier.weight[0];
        return {
          label: "Estimasi per pengiriman",
          hint: "tier pertama distance + weight",
          value: parseRupiah(d?.base ?? "0") + parseRupiah(w?.base ?? "0"),
        };
      }
      case "km_accumulation_weight": {
        const base = parseRupiah(params.km.base_price);
        const over = Math.max(0, 15 - (Number(params.km.threshold_km) || 0)) * parseRupiah(params.km.rate_over);
        return { label: "Estimasi per hari", hint: "misal total 15 km", value: base + over };
      }
      case "unique_address": {
        return {
          label: "Estimasi per hari",
          hint: "10 alamat unik default",
          value: parseRupiah(params.addr.default_rate) * 10,
        };
      }
      case "store_box_threshold": {
        const r = params.box.rows[0];
        return {
          label: "Estimasi 1 toko (5 box)",
          hint: r?.store ?? "store pertama",
          value: Math.ceil(5 / (Number(r?.threshold) || 1)) * parseRupiah(r?.rate ?? "0"),
        };
      }
    }
  }, [calcType, params]);

  return (
    <AdminLayout
      title={mode === "create" ? "Tambah Skema Pricing" : "Edit Skema Pricing"}
      subtitle="Atur cara kalkulasi pendapatan rider untuk client tertentu."
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
            <label className="text-xs font-medium text-muted-foreground">Nama Skema</label>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="cth: JNE Jabodetabek 2026"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Client</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full text-sm rounded-md border border-border bg-card px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Semua Client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Berlaku Dari</label>
            <TextInput type="date" value={effFrom} onChange={(e) => setEffFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Berlaku Sampai <span className="font-normal">(opsional)</span>
            </label>
            <TextInput type="date" value={effTo} onChange={(e) => setEffTo(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Type chooser + dynamic params */}
      <div className="rounded-lg border border-border bg-card p-5 mb-4">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Pilih tipe kalkulasi
        </p>
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
                  (active
                    ? "border-2 border-primary bg-primary-soft"
                    : "border-border hover:border-primary-border hover:bg-primary-soft/40")
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

        {/* Params dinamis */}
        <p className="text-sm font-medium pb-2 mb-3 border-b border-border flex items-center gap-2">
          <ActiveIcon className="w-4 h-4 text-primary" />
          Parameter: {activeType.name.toLowerCase()}
        </p>

        {/* ===== AREA ===== */}
        {calcType === "flat_per_awb_area" && (
          <div>
            <TableShell>
              <>
                <Th>Area / District</Th>
                <Th className="w-44">Tarif per Paket (Rp)</Th>
                <Th className="w-10" />
              </>
              {params.area.rows.map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  <Td>
                    <TextInput
                      value={r.districts}
                      placeholder="Jakarta Pusat, Depok"
                      onChange={(e) => updateArea(i, { districts: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <RupiahInput value={r.rate} onChange={(v) => updateArea(i, { rate: v })} />
                  </Td>
                  <Td className="text-center">
                    <RowDeleteBtn onClick={() => delArea(i)} />
                  </Td>
                </tr>
              ))}
            </TableShell>
            <AddRowBtn onClick={addArea}>Tambah Area</AddRowBtn>
            <div className="mt-3">
              <label className="text-xs text-muted-foreground">Default Rate (jika tidak ada area yang match)</label>
              <div className="mt-1 max-w-xs">
                <RupiahInput
                  value={params.area.default_rate}
                  onChange={(v) => setParams((p) => ({ ...p, area: { ...p.area, default_rate: v } }))}
                />
              </div>
            </div>
          </div>
        )}

        {/* ===== SERVICE ===== */}
        {calcType === "flat_per_awb_service_type" && (
          <div>
            <TableShell>
              <>
                <Th>Tipe Layanan</Th>
                <Th className="w-44">Tarif (Rp)</Th>
                <Th className="w-10" />
              </>
              {params.service.rows.map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  <Td>
                    <TextInput
                      value={r.name}
                      placeholder="delivery"
                      onChange={(e) => updateService(i, { name: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <RupiahInput value={r.rate} onChange={(v) => updateService(i, { rate: v })} />
                  </Td>
                  <Td className="text-center">
                    <RowDeleteBtn onClick={() => delService(i)} />
                  </Td>
                </tr>
              ))}
            </TableShell>
            <AddRowBtn onClick={addService}>Tambah Tipe Layanan</AddRowBtn>
          </div>
        )}

        {/* ===== TIER ===== */}
        {calcType === "tier_distance_weight" && (
          <div>
            <div className="flex gap-1.5 mb-3">
              {(
                [
                  { k: "distance", l: "Tier Jarak" },
                  { k: "weight", l: "Tier Berat" },
                  { k: "stop", l: "Stop Fee" },
                ] as const
              ).map((t) => (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setTierSubtab(t.k)}
                  className={
                    "text-xs px-3 py-1.5 rounded-md border transition-colors " +
                    (tierSubtab === t.k
                      ? "bg-primary-soft text-primary-soft-foreground border-primary-border font-medium"
                      : "bg-card border-border text-muted-foreground hover:bg-muted")
                  }
                >
                  {t.l}
                </button>
              ))}
            </div>

            {tierSubtab !== "stop" && (
              <>
                <TableShell>
                  <>
                    <Th className="w-24">Tipe</Th>
                    <Th>Dari ({tierSubtab === "distance" ? "km" : "kg"})</Th>
                    <Th>Sampai ({tierSubtab === "distance" ? "km" : "kg"})</Th>
                    <Th>Base (Rp)</Th>
                    <Th>Step</Th>
                    <Th>+Rp/Step</Th>
                    <Th className="w-10" />
                  </>
                  {params.tier[tierSubtab].map((r, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <Td>
                        <select
                          value={r.type}
                          onChange={(e) => updateTier(tierSubtab, i, { type: e.target.value as "flat" | "tier" })}
                          className="w-full text-sm rounded-md border border-border bg-card px-2 py-1.5"
                        >
                          <option value="flat">Flat</option>
                          <option value="tier">Tier</option>
                        </select>
                      </Td>
                      <Td>
                        <TextInput
                          value={r.from}
                          inputMode="decimal"
                          onChange={(e) => updateTier(tierSubtab, i, { from: e.target.value })}
                        />
                      </Td>
                      <Td>
                        <TextInput
                          value={r.to}
                          inputMode="decimal"
                          onChange={(e) => updateTier(tierSubtab, i, { to: e.target.value })}
                        />
                      </Td>
                      <Td>
                        <RupiahInput value={r.base} onChange={(v) => updateTier(tierSubtab, i, { base: v })} />
                      </Td>
                      <Td>
                        <TextInput
                          value={r.step}
                          inputMode="decimal"
                          onChange={(e) => updateTier(tierSubtab, i, { step: e.target.value })}
                        />
                      </Td>
                      <Td>
                        <RupiahInput
                          value={r.rate_per_step}
                          onChange={(v) => updateTier(tierSubtab, i, { rate_per_step: v })}
                        />
                      </Td>
                      <Td className="text-center">
                        <RowDeleteBtn onClick={() => delTier(tierSubtab, i)} />
                      </Td>
                    </tr>
                  ))}
                </TableShell>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <AddRowBtn onClick={() => addTier(tierSubtab, "flat")}>Tambah Flat</AddRowBtn>
                  <AddRowBtn onClick={() => addTier(tierSubtab, "tier")}>Tambah Tier</AddRowBtn>
                </div>
              </>
            )}

            {tierSubtab === "stop" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Harga per Stop (Rp)</label>
                  <RupiahInput
                    value={params.tier.stop_flat}
                    onChange={(v) => setParams((p) => ({ ...p, tier: { ...p.tier, stop_flat: v } }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Berlaku mulai stop ke-</label>
                  <TextInput
                    value={params.tier.stop_starts_from}
                    inputMode="numeric"
                    onChange={(e) => setParams((p) => ({ ...p, tier: { ...p.tier, stop_starts_from: e.target.value } }))}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== KM ===== */}
        {calcType === "km_accumulation_weight" && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">Base Price (Rp)</label>
                <RupiahInput
                  value={params.km.base_price}
                  onChange={(v) => setParams((p) => ({ ...p, km: { ...p.km, base_price: v } }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">Threshold KM</label>
                <TextInput
                  value={params.km.threshold_km}
                  inputMode="numeric"
                  onChange={(e) => setParams((p) => ({ ...p, km: { ...p.km, threshold_km: e.target.value } }))}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5 mb-3">
              <label className="text-xs text-muted-foreground">Rate per KM Lebih (Rp/km)</label>
              <RupiahInput
                value={params.km.rate_over}
                onChange={(v) => setParams((p) => ({ ...p, km: { ...p.km, rate_over: v } }))}
              />
            </div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Surcharge Berat</p>
            <TableShell>
              <>
                <Th>Dari (kg)</Th>
                <Th>Sampai (kg)</Th>
                <Th>Surcharge (Rp)</Th>
                <Th className="w-10" />
              </>
              {params.km.weight.map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  <Td>
                    <TextInput
                      value={r.from}
                      inputMode="decimal"
                      onChange={(e) => updateKmWeight(i, { from: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <TextInput
                      value={r.to}
                      inputMode="decimal"
                      onChange={(e) => updateKmWeight(i, { to: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <RupiahInput value={r.surcharge} onChange={(v) => updateKmWeight(i, { surcharge: v })} />
                  </Td>
                  <Td className="text-center">
                    <RowDeleteBtn onClick={() => delKmWeight(i)} />
                  </Td>
                </tr>
              ))}
            </TableShell>
            <AddRowBtn onClick={addKmWeight}>Tambah Baris Berat</AddRowBtn>
          </div>
        )}

        {/* ===== ADDR ===== */}
        {calcType === "unique_address" && (
          <div>
            <div className="flex flex-col gap-1.5 mb-3 max-w-xs">
              <label className="text-xs text-muted-foreground">Default Rate per Alamat (Rp)</label>
              <RupiahInput
                value={params.addr.default_rate}
                onChange={(v) => setParams((p) => ({ ...p, addr: { ...p.addr, default_rate: v } }))}
              />
            </div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Rate Khusus per District</p>
            <TableShell>
              <>
                <Th>District</Th>
                <Th className="w-44">Rate (Rp)</Th>
                <Th className="w-10" />
              </>
              {params.addr.rows.map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  <Td>
                    <TextInput
                      value={r.district}
                      onChange={(e) => updateAddr(i, { district: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <RupiahInput value={r.rate} onChange={(v) => updateAddr(i, { rate: v })} />
                  </Td>
                  <Td className="text-center">
                    <RowDeleteBtn onClick={() => delAddr(i)} />
                  </Td>
                </tr>
              ))}
            </TableShell>
            <AddRowBtn onClick={addAddr}>Tambah District</AddRowBtn>
          </div>
        )}

        {/* ===== BOX ===== */}
        {calcType === "store_box_threshold" && (
          <div>
            <TableShell>
              <>
                <Th>Nama Store</Th>
                <Th className="w-32">Threshold Box</Th>
                <Th className="w-44">Rate per Threshold (Rp)</Th>
                <Th className="w-10" />
              </>
              {params.box.rows.map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  <Td>
                    <TextInput value={r.store} onChange={(e) => updateBox(i, { store: e.target.value })} />
                  </Td>
                  <Td>
                    <TextInput
                      value={r.threshold}
                      inputMode="numeric"
                      onChange={(e) => updateBox(i, { threshold: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <RupiahInput value={r.rate} onChange={(v) => updateBox(i, { rate: v })} />
                  </Td>
                  <Td className="text-center">
                    <RowDeleteBtn onClick={() => delBox(i)} />
                  </Td>
                </tr>
              ))}
            </TableShell>
            <AddRowBtn onClick={addBox}>Tambah Store</AddRowBtn>
            <div className="mt-3 rounded-md border border-primary-border bg-primary-soft px-3.5 py-2.5 flex items-start gap-2.5">
              <Lightbulb className="w-4 h-4 text-primary mt-0.5" />
              <p className="text-xs text-primary-soft-foreground">
                Contoh: Store A threshold 4 box, rider antar 5 box → dihitung 2× = Rp 24.000
              </p>
            </div>
          </div>
        )}

        {/* Preview box */}
        {preview && (
          <div className="rounded-md bg-muted px-3.5 py-3 mt-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">{preview.label}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{preview.hint}</div>
            </div>
            <div className="text-lg font-semibold text-primary-soft-foreground">{formatRupiah(preview.value)}</div>
          </div>
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
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          <Save className="w-4 h-4" />
          Simpan Skema
        </button>
      </div>
    </AdminLayout>
  );
}
