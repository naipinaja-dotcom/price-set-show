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

// Rekap baris yang DI-SKIP (status bukan COMPLETED), dikelompokkan per rider —
// bukan data/aturan baru: ini isi "tumpukan buangan" yang selama ini cuma
// ditampilkan jumlahnya. Buat jawab "kok rider X ga muncul?" dengan bukti.
export interface SkippedRiderLine {
  rider: string;
  count: number;
  statuses: Record<string, number>; // mis. { PENDING_PICKUP: 5, FAILED: 1 }
}

export interface CalcResult {
  perRow: RowFee[]; // 1 entri per baris COMPLETED (buat commit ke DB)
  perRider: RiderLine[];
  subtotal: number;
  billing?: { floored: boolean; admin_fee: number; ppn: number; final: number };
  grandTotal: number;
  completedRows: number;
  skippedRows: number;
  skippedPerRider: SkippedRiderLine[];
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

  // kelompokkan baris yang di-skip per rider (transparansi, bukan aturan baru)
  const skipMap = new Map<string, SkippedRiderLine>();
  for (const r of rows) {
    if (isCompleted(r)) continue;
    const k = riderKey(r);
    const line = skipMap.get(k) ?? { rider: k, count: 0, statuses: {} };
    line.count++;
    const st = String(r.status ?? "").trim().toUpperCase() || "(KOSONG)";
    line.statuses[st] = (line.statuses[st] ?? 0) + 1;
    skipMap.set(k, line);
  }
  const skippedPerRider = [...skipMap.values()].sort((a, b) => b.count - a.count);

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

  return { perRow, perRider, subtotal, billing, grandTotal, completedRows: completed.length, skippedRows: skipped, skippedPerRider, warnings, anomalies };
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

export interface CombinedRiderLine {
  rider: string;
  daysWorked: number;
  units: number;
  daily_base: number;
  ontime_bonus: number;
  per_order: number;
  total: number;
}

export interface CombinedCalcResult {
  perRow: RowFee[];
  perRider: CombinedRiderLine[];
  subtotal: number;
  completedRows: number;
  skippedRows: number;
  skippedPerRider: SkippedRiderLine[];
  warnings: string[];
  anomalies: RowAnomaly[];
}

export function calcCombinedScheme(
  env: PricingEnvelope,
  deliveries: DeliveryRow[],
  attendanceLogs: AttendanceLogRow[],
): CombinedCalcResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = env.config as any;
  const fullFee = Number(cfg.full_fee) || 0;
  const standardMin = Number(cfg.standard_minutes) || 0;
  const ontimeBonus = Number(cfg.ontime_bonus) || 0;
  const orderBy: "distance" | "weight" = cfg.order_by === "weight" ? "weight" : "distance";
  const orderTier = cfg.order_tier ?? null;

  const warnings: string[] = [];

  // attendance lookup: riderKey+date -> log
  const attMap = new Map<string, AttendanceLogRow>();
  for (const log of attendanceLogs) {
    const k = (log.rider_id || log.driver_code || "") + "|" + log.log_date;
    attMap.set(k, log);
  }

  const completed = deliveries.filter(isCompleted);
  const skipped = deliveries.length - completed.length;

  const skipMap = new Map<string, SkippedRiderLine>();
  for (const r of deliveries) {
    if (isCompleted(r)) continue;
    const k = riderKey(r);
    const line = skipMap.get(k) ?? { rider: k, count: 0, statuses: {} };
    line.count++;
    const st = String(r.status ?? "").trim().toUpperCase() || "(KOSONG)";
    line.statuses[st] = (line.statuses[st] ?? 0) + 1;
    skipMap.set(k, line);
  }
  const skippedPerRider = [...skipMap.values()].sort((a, b) => b.count - a.count);

  const idxOf = new Map<DeliveryRow, number>();
  completed.forEach((r, i) => idxOf.set(r, i));

  // per-order fee per row
  const perOrderByRow = completed.map((r) => {
    const val = orderBy === "weight" ? (r.weight_kg ?? 0) : (r.distance_km ?? 0);
    return stepTierFee(orderTier, val);
  });

  // daily fee per rider+day
  const byRider = groupBy(completed, riderKey);
  const dailyMap = new Map<string, { daily_base: number; ontime_bonus: number }>();
  for (const [rider, rrows] of byRider) {
    const byDay = groupBy(rrows, (r) => r.delivery_date);
    for (const [date] of byDay) {
      const log = attMap.get(rider + "|" + date);
      let daily_base = 0;
      let bonus = 0;
      if (log && !log.is_absent) {
        const actualMin = Number(log.duration_minutes) || 0;
        const proportion = standardMin > 0 ? Math.min(1, actualMin / standardMin) : (actualMin > 0 ? 1 : 0);
        daily_base = Math.round(fullFee * proportion);
        if (!log.is_late) bonus = ontimeBonus;
      }
      dailyMap.set(rider + "|" + date, { daily_base, ontime_bonus: bonus });
    }
  }

  // allocate daily fee across deliveries of that day (proportional by distance/weight)
  const dailyAllocByRow = new Array(completed.length).fill(0);
  for (const [rider, rrows] of byRider) {
    const byDay = groupBy(rrows, (r) => r.delivery_date);
    for (const [date, drows] of byDay) {
      const day = dailyMap.get(rider + "|" + date);
      const totalDaily = (day?.daily_base ?? 0) + (day?.ontime_bonus ?? 0);
      const rawWeights = drows.map((r) => orderBy === "weight" ? (Number(r.weight_kg) || 0) : (Number(r.distance_km) || 0));
      const weights = rawWeights.some((w) => w > 0) ? rawWeights : drows.map(() => 1);
      const parts = allocInt(totalDaily, weights);
      drows.forEach((r, i) => (dailyAllocByRow[idxOf.get(r)!] = parts[i]));
    }
  }

  const perRow: RowFee[] = completed.map((r, i) => ({
    id: r.id ?? null,
    rider: riderKey(r),
    date: r.delivery_date,
    base: perOrderByRow[i] + dailyAllocByRow[i],
    add_kg: 0,
    multi_drop: 0,
    fee: perOrderByRow[i] + dailyAllocByRow[i],
  }));

  const anomalies: RowAnomaly[] = [];
  completed.forEach((r, i) => {
    if (orderBy === "distance" && (!r.distance_km || Number(r.distance_km) === 0))
      anomalies.push({ rider: riderKey(r), date: r.delivery_date, awb: r.awb, kind: "zero_distance_paid", detail: "Jarak 0/kosong padahal skema pakai jarak" });
    if (orderBy === "weight" && (r.weight_kg === null || r.weight_kg === undefined))
      anomalies.push({ rider: riderKey(r), date: r.delivery_date, awb: r.awb, kind: "missing_weight", detail: "Berat kosong padahal skema pakai berat" });
    if (perRow[i].fee === 0)
      anomalies.push({ rider: riderKey(r), date: r.delivery_date, awb: r.awb, kind: "zero_fee", detail: "Fee 0 — cek data jarak/berat & tarif" });
  });

  // perRider summary (breakdown 3 komponen)
  const riderSummary = new Map<string, CombinedRiderLine>();
  for (const [rider, rrows] of byRider) {
    const byDay = groupBy(rrows, (r) => r.delivery_date);
    let daily_base_total = 0;
    let ontime_bonus_total = 0;
    for (const [date] of byDay) {
      const d = dailyMap.get(rider + "|" + date);
      daily_base_total += d?.daily_base ?? 0;
      ontime_bonus_total += d?.ontime_bonus ?? 0;
    }
    const per_order_total = rrows.reduce((s, r) => s + perOrderByRow[idxOf.get(r)!], 0);
    riderSummary.set(rider, {
      rider,
      daysWorked: byDay.size,
      units: rrows.length,
      daily_base: daily_base_total,
      ontime_bonus: ontime_bonus_total,
      per_order: per_order_total,
      total: daily_base_total + ontime_bonus_total + per_order_total,
    });
  }
  const perRider = [...riderSummary.values()].sort((a, b) => b.total - a.total);
  const subtotal = perRider.reduce((s, r) => s + r.total, 0);

  if (skipped > 0) warnings.push(`${skipped} baris di-skip (status bukan COMPLETED).`);
  if (attendanceLogs.length === 0) warnings.push("Tidak ada data absensi — daily fee & bonus ontime tidak dihitung.");

  return { perRow, perRider, subtotal, completedRows: completed.length, skippedRows: skipped, skippedPerRider, warnings, anomalies };
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
