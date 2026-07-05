// =========================================================
// Calculator Engine (otak hitungan) — MURNI, tanpa DB/UI.
// Dikasih 1 skema (PricingEnvelope) + baris pengiriman → keluar:
//  - fee PER BARIS (buat disimpan ke delivery_records.fee → dipakai Payroll)
//  - rekap PER RIDER (buat preview)
// Bisa dites terpisah dengan data contoh.
// =========================================================
import type { PricingEnvelope, StepTier } from "./pricing-types";

// Bentuk baris data pengiriman (mengikuti tabel delivery_records)
export interface DeliveryRow {
  id?: string | null;
  rider_id?: string | null;
  driver_code?: string | null;
  delivery_date: string; // YYYY-MM-DD
  awb?: string | null;
  district?: string | null;
  distance_km?: number | null;
  weight_kg?: number | null;
  destination_address?: string | null;
  service_type?: string | null;
  status?: string | null;
  delivery_type?: string | null; // "DELIVERY" | "RETURN" | null (belum ke-klasifikasi)
}

export interface RowFee {
  id?: string | null;
  rider: string;
  date: string;
  base: number;
  add_kg: number;
  multi_drop: number;
  fee: number; // base + add_kg + multi_drop
}

export interface RiderLine {
  rider: string;
  units: number;
  base: number;
  add_kg: number;
  multi_drop: number;
  total: number;
}

export interface RowAnomaly {
  rider: string;
  date: string;
  awb?: string | null;
  kind: "zero_distance_paid" | "missing_weight" | "zero_fee";
  detail: string;
}

export interface CalcResult {
  perRow: RowFee[]; // 1 entri per baris COMPLETED (buat commit ke DB)
  perRider: RiderLine[];
  subtotal: number;
  billing?: { floored: boolean; admin_fee: number; ppn: number; final: number };
  grandTotal: number;
  completedRows: number;
  skippedRows: number;
  warnings: string[];
  anomalies: RowAnomaly[]; // ga bikin gagal komputasi, cuma diflag buat dicek manual
}

// ---------------- helpers ----------------
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const riderKey = (r: { rider_id?: string | null; driver_code?: string | null }) => r.rider_id || r.driver_code || "(tanpa rider)";
const isCompleted = (r: DeliveryRow) => norm(r.status) === "completed";

function resolveField(row: DeliveryRow, columnName: string): string {
  const c = norm(columnName);
  if (c.includes("service") || c.includes("layanan")) return String(row.service_type ?? "");
  if (c.includes("return") || c.includes("delivery type") || c.includes("tipe kirim")) return String(row.delivery_type ?? "");
  return String(row.district ?? "");
}

export function stepTierFee(tier: StepTier | null | undefined, value: number): number {
  if (!tier) return 0;
  let fee = tier.base_fee || 0;
  const v = Number(value) || 0;
  for (const t of tier.tiers || []) {
    const lo = Number(t.from) || 0;
    const hi = t.to === null || t.to === undefined ? Infinity : Number(t.to);
    if (v > lo) {
      const span = Math.min(v, hi) - lo;
      const step = Number(t.step) || 1;
      fee += Math.ceil(span / step) * (Number(t.add_per_step) || 0);
    }
  }
  return fee;
}

function groupBy<T>(arr: T[], keyFn: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of arr) {
    const k = keyFn(x);
    const g = m.get(k);
    if (g) g.push(x);
    else m.set(k, [x]);
  }
  return m;
}

// Bagi `total` (rupiah bulat) ke beberapa baris sesuai bobot, hasilnya PAS
// (jumlah alokasi == total). Sisa recehan ditaruh ke baris berbobot terbesar.
function allocInt(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const T = Math.round(total);
  const w = weights.map((x) => Math.max(0, Number(x) || 0));
  const sumW = w.reduce((a, b) => a + b, 0);
  const raw = sumW > 0 ? w.map((x) => (x / sumW) * T) : w.map(() => T / n);
  const floors = raw.map((x) => Math.floor(x));
  let rem = T - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rem && k < n; k++) floors[order[k].i]++;
  return floors;
}

// ---------------- main ----------------
export function calcScheme(env: PricingEnvelope, rows: DeliveryRow[]): CalcResult {
  const warnings: string[] = [];
  const completed = rows.filter(isCompleted);
  const skipped = rows.length - completed.length;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = env.config as any;

  // base fee per baris (index-aligned dgn `completed`)
  const baseByRow = new Array(completed.length).fill(0);
  const idxOf = new Map<DeliveryRow, number>();
  completed.forEach((r, i) => idxOf.set(r, i));

  const byRider = groupBy(completed, riderKey);

  for (const [, rrows] of byRider) {
    if (env.type === "flat_unit") {
      const seen = new Set<string>();
      for (const r of rrows) {
        let rate = 0;
        let billable = true;
        if (cfg.unit === "unique_address") {
          const key = r.delivery_date + "|" + norm(r.destination_address);
          if (seen.has(key)) billable = false;
          else seen.add(key);
        }
        if (billable) {
          if (cfg.rate_by === "flat") rate = Number(cfg.flat_rate) || 0;
          else {
            const hit = (cfg.rates || []).find((x: { key: string }) => norm(x.key) === norm(resolveField(r, cfg.match_column)));
            rate = hit ? Number(hit.rate) || 0 : Number(cfg.default_rate) || 0;
          }
        }
        baseByRow[idxOf.get(r)!] = rate;
      }
    } else if (env.type === "tier") {
      for (const r of rrows) {
        const d = cfg.distance ? stepTierFee(cfg.distance, r.distance_km ?? 0) : 0;
        const w = cfg.weight ? stepTierFee(cfg.weight, r.weight_kg ?? 0) : 0;
        baseByRow[idxOf.get(r)!] = d + w;
      }
    } else if (env.type === "tier_daily") {
      const byDay = groupBy(rrows, (r) => r.delivery_date);
      for (const [, drows] of byDay) {
        const sumKm = drows.reduce((s, r) => s + (Number(r.distance_km) || 0), 0);
        const sumKg = drows.reduce((s, r) => s + (Number(r.weight_kg) || 0), 0);
        const dayFee = (cfg.distance ? stepTierFee(cfg.distance, sumKm) : 0) + (cfg.weight ? stepTierFee(cfg.weight, sumKg) : 0);
        // alokasi ke tiap baris hari itu (proporsional jarak, fallback berat, fallback rata)
        const weights = drows.map((r) => (cfg.distance ? Number(r.distance_km) || 0 : Number(r.weight_kg) || 0));
        const parts = allocInt(dayFee, weights);
        drows.forEach((r, i) => (baseByRow[idxOf.get(r)!] = parts[i]));
      }
    } else if (env.type === "threshold_multiple") {
      const byStoreDay = groupBy(rrows, (r) => resolveField(r, cfg.group_by) + "||" + r.delivery_date);
      for (const [, grp] of byStoreDay) {
        const storeVal = resolveField(grp[0], cfg.group_by);
        const rule = (cfg.rules || []).find((x: { key: string }) => norm(x.key) === norm(storeVal));
        const threshold = Number(rule?.threshold ?? cfg.default?.threshold) || 0;
        const rate = Number(rule?.rate ?? cfg.default?.rate) || 0;
        const totalKg = grp.reduce((s, r) => s + (Number(r.weight_kg) || 0), 0);
        const grpFee = threshold > 0 ? Math.ceil(totalKg / threshold) * rate : 0;
        const parts = allocInt(grpFee, grp.map((r) => Number(r.weight_kg) || 0));
        grp.forEach((r, i) => (baseByRow[idxOf.get(r)!] = parts[i]));
      }
    }
  }

  // ---- modifier per baris ----
  const addByRow = new Array(completed.length).fill(0);
  const mdByRow = new Array(completed.length).fill(0);

  if (env.add_kg && env.type !== "attendance") {
    completed.forEach((r, i) => (addByRow[i] = stepTierFee(env.add_kg!.tier, r.weight_kg ?? 0)));
  }
  if (env.multi_drop) {
    const fee = Number(env.multi_drop.fee_per_extra_shipment) || 0;
    for (const [, rrows] of byRider) {
      const byDay = groupBy(rrows, (r) => r.delivery_date);
      for (const [, drows] of byDay) {
        drows.forEach((r, i) => (mdByRow[idxOf.get(r)!] = i === 0 ? 0 : fee)); // kiriman ke-2 dst
      }
    }
  }

  // ---- rakit perRow + perRider ----
  const perRow: RowFee[] = completed.map((r, i) => ({
    id: r.id ?? null,
    rider: riderKey(r),
    date: r.delivery_date,
    base: baseByRow[i],
    add_kg: addByRow[i],
    multi_drop: mdByRow[i],
    fee: baseByRow[i] + addByRow[i] + mdByRow[i],
  }));

  // ---- deteksi anomali sederhana — jangan gagalin komputasi, cuma diflag ----
  const dependsOnWeight = !!env.add_kg || (["tier", "tier_daily"].includes(env.type) && !!cfg?.weight);
  const anomalies: RowAnomaly[] = [];
  completed.forEach((r, i) => {
    const fee = perRow[i].fee;
    const dist = Number(r.distance_km) || 0;
    if ((!r.distance_km || dist === 0) && fee > 0) {
      anomalies.push({ rider: riderKey(r), date: r.delivery_date, awb: r.awb, kind: "zero_distance_paid", detail: `Jarak 0/kosong tapi kena fee ${fee.toLocaleString("id-ID")}` });
    }
    if (dependsOnWeight && (r.weight_kg === null || r.weight_kg === undefined)) {
      anomalies.push({ rider: riderKey(r), date: r.delivery_date, awb: r.awb, kind: "missing_weight", detail: "Berat kosong padahal skema butuh berat" });
    }
    if (fee === 0) {
      anomalies.push({ rider: riderKey(r), date: r.delivery_date, awb: r.awb, kind: "zero_fee", detail: "Fee 0 padahal status COMPLETED — cek apakah ada tarif yang cocok" });
    }
  });

  const riderMap = new Map<string, RiderLine>();
  perRow.forEach((rf) => {
    const line = riderMap.get(rf.rider) ?? { rider: rf.rider, units: 0, base: 0, add_kg: 0, multi_drop: 0, total: 0 };
    line.units += 1;
    line.base += rf.base;
    line.add_kg += rf.add_kg;
    line.multi_drop += rf.multi_drop;
    line.total += rf.fee;
    riderMap.set(rf.rider, line);
  });
  const perRider = [...riderMap.values()].sort((a, b) => b.total - a.total);

  const subtotal = perRow.reduce((s, r) => s + r.fee, 0);

  // ---- billing add-ons (khusus scheme client) → level invoice ----
  let billing: CalcResult["billing"] | undefined;
  let grandTotal = subtotal;
  if (env.billing_addons) {
    const b = env.billing_addons;
    let amt = subtotal;
    const floored = amt < (Number(b.min_charge) || 0);
    if (floored) amt = Number(b.min_charge) || 0;
    const admin = Number(b.admin_fee_flat) || 0;
    amt += admin;
    const ppn = amt * ((Number(b.ppn_percent) || 0) / 100);
    grandTotal = amt + ppn;
    billing = { floored, admin_fee: admin, ppn, final: grandTotal };
  }

  if (skipped > 0) warnings.push(`${skipped} baris di-skip (status bukan COMPLETED).`);

  return { perRow, perRider, subtotal, billing, grandTotal, completedRows: completed.length, skippedRows: skipped, warnings, anomalies };
}

// =========================================================
// Type E (Attendance) — data absensi harian, BEDA bentuk dari
// DeliveryRow, jadi engine-nya kepisah sendiri.
// Rumus: (fee_penuh × proporsi_jam_kerja) [+ lembur] + insentif
// (nominal insentif ditentuin di skema; data cuma dipakai cek syarat,
// mis. OTP=ONTIME buat insentif "ontime_only", biner: penuh/nol).
// =========================================================
export interface AttendanceLogRow {
  id?: string | null;
  rider_id?: string | null;
  driver_code?: string | null;
  log_date: string;
  duration_minutes?: number | null;
  is_late?: boolean | null;
  is_absent?: boolean | null;
}

export interface AttendanceRowFee {
  id?: string | null;
  rider: string;
  date: string;
  base: number;
  overtime: number;
  incentive: number;
  fee: number; // base + overtime + incentive
}

export interface AttendanceRiderLine {
  rider: string;
  daysWorked: number;
  base: number;
  overtime: number;
  incentive: number;
  total: number;
}

export interface AttendanceCalcResult {
  perRow: AttendanceRowFee[];
  perRider: AttendanceRiderLine[];
  subtotal: number;
  totalRows: number;
  absentRows: number;
  warnings: string[];
}

export function calcAttendanceScheme(env: PricingEnvelope, logs: AttendanceLogRow[]): AttendanceCalcResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = env.config as any;
  const fullFee = Number(cfg.full_fee) || 0;
  const standardMin = Number(cfg.standard_minutes) || 0;
  const overtimeOn = !!cfg.overtime?.enabled;
  const overtimeRatePerHour = Number(cfg.overtime?.rate_per_hour) || 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const incentives: any[] = cfg.incentives ?? [];

  const warnings: string[] = [];
  if (standardMin <= 0) warnings.push("Jam standar shift belum diisi di skema — proporsi jam kerja tidak bisa dihitung dengan benar.");

  let absentRows = 0;
  const perRow: AttendanceRowFee[] = logs.map((r) => {
    if (r.is_absent) {
      absentRows++;
      return { id: r.id ?? null, rider: riderKey(r), date: r.log_date, base: 0, overtime: 0, incentive: 0, fee: 0 };
    }
    const actualMin = Number(r.duration_minutes) || 0;
    const proportion = standardMin > 0 ? Math.min(1, actualMin / standardMin) : (actualMin > 0 ? 1 : 0);
    const base = Math.round(fullFee * proportion);

    let overtime = 0;
    if (overtimeOn && standardMin > 0 && actualMin > standardMin) {
      overtime = Math.round(((actualMin - standardMin) / 60) * overtimeRatePerHour);
    }

    let incentiveTotal = 0;
    for (const inc of incentives) {
      const amount = Number(inc.amount) || 0;
      if (inc.condition === "always") incentiveTotal += amount;
      else if (inc.condition === "ontime_only" && !r.is_late) incentiveTotal += amount;
    }

    return { id: r.id ?? null, rider: riderKey(r), date: r.log_date, base, overtime, incentive: incentiveTotal, fee: base + overtime + incentiveTotal };
  });

  const riderMap = new Map<string, AttendanceRiderLine>();
  perRow.forEach((rf, i) => {
    const line = riderMap.get(rf.rider) ?? { rider: rf.rider, daysWorked: 0, base: 0, overtime: 0, incentive: 0, total: 0 };
    if (!logs[i].is_absent) line.daysWorked += 1;
    line.base += rf.base; line.overtime += rf.overtime; line.incentive += rf.incentive; line.total += rf.fee;
    riderMap.set(rf.rider, line);
  });
  const perRider = [...riderMap.values()].sort((a, b) => b.total - a.total);

  const subtotal = perRow.reduce((s, r) => s + r.fee, 0);
  if (absentRows > 0) warnings.push(`${absentRows} baris absen (fee 0).`);

  return { perRow, perRider, subtotal, totalRows: logs.length, absentRows, warnings };
}
