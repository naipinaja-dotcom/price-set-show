// =========================================================
// Pricing Engine v2 — Regression Baseline Snapshot (READ-ONLY)
// =========================================================
// Purpose (docs/pricing-engine-v2-design.md §5/§8 step 1): capture what the
// CURRENT calcScheme() / calcAttendanceScheme() / calcCombinedScheme() engines
// produce for every REAL pricing_schemes row, against a bounded sample of its
// matching delivery_records / attendance_logs. This is the ground truth the
// next refactor stage (component extraction) must match byte-for-byte.
//
// This script does NOT modify pricing-calc.ts, pricing_schemes, delivery_records,
// or attendance_logs. It only reads, computes in-memory, and writes this one
// JSON file. Uses the service-role key (bypasses RLS) — read-only queries only.
//
// Run: node scripts/pricing-v2-regression-snapshot.mjs
// =========================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { calcScheme, calcAttendanceScheme, calcHybridScheme } from "../src/lib/pricing-calc.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "scripts", "pricing-v2-regression-snapshot.json");
const SAMPLE_LIMIT = 500;

// ---- minimal .env loader (no dotenv dependency in this repo) ----
function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY on the server");
  }
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

const DELIVERY_SELECT =
  "id, rider_id, driver_code, delivery_date, awb, district, distance_km, weight_kg, destination_address, service_type, status, delivery_type";
const ATTENDANCE_SELECT = "id, rider_id, driver_code, log_date, duration_minutes, is_late, is_absent";

async function fetchDeliverySample(admin, clientId) {
  let q = admin
    .from("delivery_records")
    .select(DELIVERY_SELECT)
    .order("delivery_date", { ascending: true })
    .order("id", { ascending: true })
    .limit(SAMPLE_LIMIT);
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error } = await q;
  if (error) throw new Error(`delivery_records fetch failed (client_id=${clientId}): ${error.message}`);
  return data ?? [];
}

async function fetchAttendanceSample(admin, clientId) {
  let q = admin
    .from("attendance_logs")
    .select(ATTENDANCE_SELECT)
    .order("log_date", { ascending: true })
    .order("id", { ascending: true })
    .limit(SAMPLE_LIMIT);
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error } = await q;
  if (error) throw new Error(`attendance_logs fetch failed (client_id=${clientId}): ${error.message}`);
  return data ?? [];
}

async function main() {
  const admin = getSupabaseAdmin();

  const { data: schemesRaw, error: schemesErr } = await admin
    .from("pricing_schemes")
    .select("id, name, client_id, scheme_for, calc_type, effective_from, effective_to, params, created_at")
    .order("created_at", { ascending: true });
  if (schemesErr) throw new Error(`pricing_schemes fetch failed: ${schemesErr.message}`);

  const schemes = schemesRaw ?? [];
  console.log(`[snapshot] fetched ${schemes.length} pricing_schemes rows`);

  const results = [];

  for (const scheme of schemes) {
    const base = {
      scheme_id: scheme.id,
      scheme_name: scheme.name,
      client_id: scheme.client_id,
      scheme_for: scheme.scheme_for,
      calc_type: scheme.calc_type,
    };

    if (!scheme.params || scheme.params.version !== 1) {
      results.push({ ...base, skipped: true, reason: `params missing or version !== 1 (got ${scheme.params?.version ?? "null"})` });
      console.log(`[snapshot] SKIP ${scheme.name} (${scheme.id}) — invalid/old params version`);
      continue;
    }

    try {
      if (scheme.calc_type === "attendance") {
        const attRows = await fetchAttendanceSample(admin, scheme.client_id);
        const calc = calcAttendanceScheme(scheme.params, attRows);
        results.push({ ...base, sample: { attendance_rows: attRows.length }, result: calc });
      } else if (scheme.calc_type === "combined") {
        const [deliveryRows, attRows] = await Promise.all([
          fetchDeliverySample(admin, scheme.client_id),
          fetchAttendanceSample(admin, scheme.client_id),
        ]);
        const calc = calcHybridScheme(scheme.params, deliveryRows, attRows);
        results.push({ ...base, sample: { delivery_rows: deliveryRows.length, attendance_rows: attRows.length }, result: calc });
      } else {
        // flat_unit / tier / tier_daily / threshold_multiple
        const deliveryRows = await fetchDeliverySample(admin, scheme.client_id);
        const calc = calcScheme(scheme.params, deliveryRows);
        results.push({ ...base, sample: { delivery_rows: deliveryRows.length }, result: calc });
      }
      console.log(`[snapshot] OK   ${scheme.name} (${scheme.id}) — calc_type=${scheme.calc_type}`);
    } catch (e) {
      results.push({ ...base, error: e instanceof Error ? e.message : String(e) });
      console.error(`[snapshot] ERROR ${scheme.name} (${scheme.id}):`, e instanceof Error ? e.message : e);
    }
  }

  const snapshot = {
    generated_at: new Date().toISOString(),
    sample_limit: SAMPLE_LIMIT,
    scheme_count: schemes.length,
    schemes: results,
  };

  writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  console.log(`[snapshot] wrote ${OUT_PATH}`);

  const errored = results.filter((r) => r.error);
  const skipped = results.filter((r) => r.skipped);
  console.log(`[snapshot] done: ${results.length - errored.length - skipped.length} computed, ${skipped.length} skipped, ${errored.length} errored`);
  if (errored.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("[snapshot] FATAL:", e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
