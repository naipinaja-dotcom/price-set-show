// =========================================================
// PnL Engine (murni, tanpa DB/UI) — dipakai bersama oleh halaman
// Margin Analytics (admin.pnl.tsx) & Executive Dashboard.
// Pilih skema rider/client per client, jalanin calcScheme dua sisi,
// keluarin ringkasan per client + rincian per-baris (buat trend harian).
// =========================================================
import { calcScheme, type DeliveryRow, type RowFee } from "./pricing-calc";
import type { PricingScheme, SchemeFor } from "./pricing-types";

export type ClientLite = { id: string; name: string };

export interface ClientPnl {
  clientId: string;
  client: string;
  revenue: number | null; // null = belum ada skema client
  cost: number;
  margin: number | null;
  marginPct: number | null;
  costRows: RowFee[];
  revenueRows: RowFee[];
}

export interface PnlResult {
  perClient: ClientPnl[];
  totRevenue: number;
  totCost: number;
  totMargin: number;
  totMarginPct: number;
}

// skema aktif: harus emang berlaku hari ini (effective_from..effective_to),
// lalu yang khusus client itu diutamakan atas "semua client", lalu yang
// effective_from/created_at paling baru menang kalau masih ada dobel.
export function pickPricingScheme(schemes: PricingScheme[], clientId: string, kind: SchemeFor) {
  const today = new Date().toISOString().slice(0, 10);
  const cands = schemes.filter(
    (s) =>
      s.scheme_for === kind &&
      s.params?.version === 1 &&
      (s.client_id === clientId || s.client_id === null) &&
      s.effective_from <= today &&
      (!s.effective_to || s.effective_to >= today)
  );
  return cands.sort((a, b) => {
    const aSpecific = a.client_id === clientId;
    const bSpecific = b.client_id === clientId;
    if (aSpecific !== bSpecific) return aSpecific ? -1 : 1;
    if (a.effective_from !== b.effective_from) return a.effective_from > b.effective_from ? -1 : 1;
    return a.created_at > b.created_at ? -1 : 1;
  })[0];
}

export function computePnl(
  rows: (DeliveryRow & { client_id: string | null })[],
  schemes: PricingScheme[],
  clients: ClientLite[]
): PnlResult {
  const byClient = new Map<string, DeliveryRow[]>();
  for (const r of rows) {
    const cid = r.client_id ?? "(tanpa client)";
    (byClient.get(cid) ?? byClient.set(cid, []).get(cid)!).push(r);
  }

  const nameOf = new Map(clients.map((c) => [c.id, c.name]));
  const perClient: ClientPnl[] = [];
  for (const [cid, crows] of byClient) {
    const riderS = pickPricingScheme(schemes, cid, "rider");
    const clientS = pickPricingScheme(schemes, cid, "client");
    const costResult = riderS ? calcScheme(riderS.params, crows) : null;
    const revResult = clientS ? calcScheme(clientS.params, crows) : null;
    const cost = costResult?.subtotal ?? 0;
    const revenue = revResult ? revResult.subtotal : null;
    const margin = revenue === null ? null : revenue - cost;
    const marginPct = revenue && revenue > 0 && margin !== null ? (margin / revenue) * 100 : null;
    perClient.push({
      clientId: cid,
      client: nameOf.get(cid) ?? "(tanpa client)",
      revenue,
      cost,
      margin,
      marginPct,
      costRows: costResult?.perRow ?? [],
      revenueRows: revResult?.perRow ?? [],
    });
  }
  perClient.sort((a, b) => (b.margin ?? -Infinity) - (a.margin ?? -Infinity));

  const totRevenue = perClient.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const totCost = perClient.reduce((s, r) => s + r.cost, 0);
  const totMargin = totRevenue - totCost;
  const totMarginPct = totRevenue > 0 ? (totMargin / totRevenue) * 100 : 0;

  return { perClient, totRevenue, totCost, totMargin, totMarginPct };
}

export type TrendGranularity = "daily" | "weekly" | "monthly";

export interface TrendPoint {
  bucket: string; // label tampil
  sortKey: string; // dipakai sort chronological
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
}

function bucketKey(date: string, granularity: TrendGranularity): { sortKey: string; label: string } {
  const d = new Date(date + "T00:00:00");
  if (granularity === "daily") return { sortKey: date, label: d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) };
  if (granularity === "monthly") {
    const key = date.slice(0, 7);
    return { sortKey: key, label: d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" }) };
  }
  // weekly: kunci = Senin minggu itu
  const day = (d.getDay() + 6) % 7; // Senin=0
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  const key = monday.toISOString().slice(0, 10);
  return { sortKey: key, label: monday.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) };
}

// Rangkai trend BCR (margin %) dari seluruh perRow cost+revenue semua client, dikelompokkan per bucket waktu.
export function buildTrend(perClient: ClientPnl[], granularity: TrendGranularity): TrendPoint[] {
  const buckets = new Map<string, { label: string; revenue: number; cost: number }>();
  const add = (date: string, field: "revenue" | "cost", amount: number) => {
    const { sortKey, label } = bucketKey(date, granularity);
    const b = buckets.get(sortKey) ?? { label, revenue: 0, cost: 0 };
    b[field] += amount;
    buckets.set(sortKey, b);
  };
  for (const c of perClient) {
    for (const rf of c.costRows) add(rf.date, "cost", rf.fee);
    for (const rf of c.revenueRows) add(rf.date, "revenue", rf.fee);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([sortKey, b]) => ({
      bucket: b.label,
      sortKey,
      revenue: b.revenue,
      cost: b.cost,
      margin: b.revenue - b.cost,
      marginPct: b.revenue > 0 ? ((b.revenue - b.cost) / b.revenue) * 100 : 0,
    }));
}
