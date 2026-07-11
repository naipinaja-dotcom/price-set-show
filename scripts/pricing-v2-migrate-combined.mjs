// =========================================================
// Pricing Engine v2 — Migrate calc_type='combined' -> hybrid shape
// =========================================================
// Purpose (docs/pricing-engine-v2-design.md SS4/SS7): transform existing
// pricing_schemes rows with calc_type = 'combined' into the new hybrid
// category/subtype shape:
//
//   before: { calc_type: "combined",
//             params: { type: "combined", config: { full_fee, standard_minutes,
//                        ontime_bonus, order_by, order_tier, ... } } }
//
//   after:  { calc_type: "hybrid",
//             params: { subtype: "tier", delivery_config: { distance, weight },
//                        attendance_config: { full_fee, standard_minutes,
//                        overtime, incentives }, add_kg, multi_drop,
//                        billing_addons, version } }
//
// SCHEMA NOTE (flag for whoever owns docs/pricing-engine-v2-design.md SS4):
// the design doc's before/after example shows `category`/`subtype` as
// top-level row fields (implying new DB columns). The real pricing_schemes
// table (supabase/migrations/20260705180000_MASTER_schema_reset.sql) only has
// `calc_type text` + `params jsonb` -- there is no `category`/`subtype`
// column. This script does NOT add columns (that is a schema migration,
// out of scope for a data-migration script). Instead it re-tags the existing
// `calc_type` column to the new category name ("hybrid") -- consistent with
// design doc SS2 principle 4 ("hanya re-tag kategori") -- and puts
// `subtype` + `delivery_config` + `attendance_config` inside the existing
// `params` jsonb column, alongside the untouched envelope fields
// (`version`, `add_kg`, `multi_drop`, `billing_addons`). Reconcile with the
// design doc author before step 4 (pricing-types.ts / pricing-form.tsx
// update) if a literal `category`+`subtype` column split is actually wanted.
//
// Idempotent: rows whose params already look migrated (params.subtype is
// present, i.e. no more params.config/order_by/order_tier) are skipped on
// both dry-run and apply, so re-running after a partial apply is safe.
//
// Anomalies found during inventory (see task notes) are skipped by id via
// SKIP_ROW_IDS below -- currently empty because inventory found zero
// calc_type='combined' rows in the real table, so there is nothing to skip
// or migrate as of this writing.
//
// Usage:
//   node scripts/pricing-v2-migrate-combined.mjs                # dry-run (default)
//   node scripts/pricing-v2-migrate-combined.mjs --dry-run       # dry-run (explicit)
//   node scripts/pricing-v2-migrate-combined.mjs --apply         # WRITES to DB
//
// Uses the service-role key (bypasses RLS enabled on pricing_schemes, per
// design doc SS7 step 5). Never import this from app code.
// =========================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---- flags ----
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const DRY_RUN = !APPLY; // dry-run is the default; --apply is the only way to write

// ---- minimal .env loader (no dotenv dependency in this repo; mirrors
// scripts/pricing-v2-regression-snapshot.mjs) ----
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

// Anomalous row ids flagged during inventory (docs/pricing-engine-v2-design.md
// SS7 step 1) -- left untouched, never transformed, reported separately.
// Empty as of 2026-07-11: inventory found zero calc_type='combined' rows in
// the real table, so there are no anomalous rows (yet) to name here.
const SKIP_ROW_IDS = new Set([
  // "<uuid-of-anomalous-row>",
]);

function isAlreadyMigrated(params) {
  // New shape has params.subtype + params.delivery_config; old shape has
  // params.type === "combined" + params.config.order_by/order_tier.
  return !!params && typeof params === "object" && typeof params.subtype === "string" && !!params.delivery_config;
}

// Transform one legacy `combined` row's params into the new hybrid shape.
// Returns { calc_type, params } to write back, or throws if the row's
// config doesn't match the shape docs/pricing-engine-v2-design.md SS4 assumes
// (caller treats a throw as "anomaly -- skip, don't write").
function transformCombinedRow(row) {
  const params = row.params ?? {};
  const config = params.config ?? {};

  const { full_fee, standard_minutes, ontime_bonus, order_by, order_tier, ...restConfig } = config;

  if (order_by !== "distance" && order_by !== "weight") {
    throw new Error(`unexpected config.order_by "${order_by}" (expected "distance" or "weight")`);
  }
  if (!order_tier || typeof order_tier !== "object") {
    throw new Error("missing/invalid config.order_tier -- cannot build delivery_config");
  }

  const deliveryConfig =
    order_by === "distance" ? { distance: order_tier, weight: null } : { distance: null, weight: order_tier };

  const incentives = [];
  if (ontime_bonus != null) {
    incentives.push({ label: "Bonus Ontime", amount: ontime_bonus, condition: "ontime_only" });
  }

  const newParams = {
    version: params.version ?? 1,
    subtype: "tier", // combined's order_tier is always StepTier-based (design doc SS4)
    delivery_config: deliveryConfig,
    attendance_config: {
      full_fee: full_fee ?? null,
      standard_minutes: standard_minutes ?? null,
      overtime: null,
      incentives,
    },
    // modifiers stay exactly as they are today (design doc SS2 principle 1/SS4)
    add_kg: params.add_kg ?? null,
    multi_drop: params.multi_drop ?? null,
    billing_addons: params.billing_addons ?? null,
  };
  if (Object.keys(restConfig).length > 0) {
    // preserve anything unexpected instead of silently dropping it
    newParams._unrecognized_config_fields = restConfig;
  }

  return { calc_type: "hybrid", params: newParams };
}

function printTransform(label, before, after) {
  console.log(`\n---- ${label} ----`);
  console.log("BEFORE:");
  console.log(JSON.stringify(before, null, 2));
  console.log("AFTER:");
  console.log(JSON.stringify(after, null, 2));
}

// Synthetic sample straight from docs/pricing-engine-v2-design.md SS4, used
// ONLY to print one full worked example in the report when there are zero
// real calc_type='combined' rows to show (never read from or written to the
// DB).
function synthDesignDocExample() {
  const row = {
    id: "00000000-0000-0000-0000-000000000000",
    name: "(synthetic example from docs/pricing-engine-v2-design.md SS4 -- no real row)",
    client_id: null,
    scheme_for: "rider",
    calc_type: "combined",
    params: {
      version: 1,
      type: "combined",
      config: {
        full_fee: 100000,
        standard_minutes: 480,
        ontime_bonus: 20000,
        order_by: "distance",
        order_tier: { base_fee: 5000, base_until: 5, tiers: [{ from: 5, to: null, step: 1, add_per_step: 1000 }] },
      },
      add_kg: null,
      multi_drop: null,
      billing_addons: null,
    },
  };
  return { row, after: transformCombinedRow(row) };
}

async function main() {
  console.log(`[migrate-combined] mode: ${APPLY ? "APPLY (will write)" : "DRY-RUN (read-only, no writes)"}`);

  const admin = getSupabaseAdmin();

  const { data: rows, error } = await admin
    .from("pricing_schemes")
    .select("id, name, client_id, scheme_for, calc_type, effective_from, effective_to, params, created_at")
    .eq("calc_type", "combined");
  if (error) throw new Error(`pricing_schemes fetch failed: ${error.message}`);

  const combinedRows = rows ?? [];
  console.log(`[migrate-combined] found ${combinedRows.length} row(s) with calc_type='combined'`);

  const toMigrate = [];
  const skippedAnomaly = [];
  const skippedAlreadyMigrated = [];
  const errors = [];

  for (const row of combinedRows) {
    if (SKIP_ROW_IDS.has(row.id)) {
      skippedAnomaly.push({ id: row.id, name: row.name, reason: "flagged as anomaly in inventory" });
      continue;
    }
    if (isAlreadyMigrated(row.params)) {
      skippedAlreadyMigrated.push({ id: row.id, name: row.name });
      continue;
    }
    try {
      const after = transformCombinedRow(row);
      toMigrate.push({ row, after });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      errors.push({ id: row.id, name: row.name, reason });
    }
  }

  console.log(`\n[migrate-combined] plan: ${toMigrate.length} to migrate, ${skippedAlreadyMigrated.length} already migrated (idempotent skip), ${skippedAnomaly.length} anomaly-skip, ${errors.length} unparseable (skipped, not migrated)`);

  for (const { row, after } of toMigrate) {
    printTransform(
      `row ${row.id} (${row.name})`,
      { id: row.id, name: row.name, calc_type: row.calc_type, params: row.params },
      { id: row.id, name: row.name, calc_type: after.calc_type, params: after.params },
    );
  }

  if (errors.length > 0) {
    console.log("\n[migrate-combined] UNPARSEABLE rows (left untouched, needs manual review):");
    for (const e of errors) console.log(`  - ${e.id} (${e.name}): ${e.reason}`);
  }
  if (skippedAnomaly.length > 0) {
    console.log("\n[migrate-combined] anomaly-skip rows (left untouched, per inventory):");
    for (const s of skippedAnomaly) console.log(`  - ${s.id} (${s.name}): ${s.reason}`);
  }

  if (combinedRows.length === 0) {
    console.log(
      "\n[migrate-combined] No real calc_type='combined' rows found -- printing ONE synthetic sample transform " +
        "from docs/pricing-engine-v2-design.md SS4 so the shape can still be reviewed (not read from or written to the DB):",
    );
    const { row, after } = synthDesignDocExample();
    printTransform("SYNTHETIC EXAMPLE (design doc SS4, not a real DB row)", row, { ...row, ...after });
  }

  if (DRY_RUN) {
    console.log(`\n[migrate-combined] DRY-RUN complete. ${toMigrate.length} row(s) would be migrated. No writes performed. Re-run with --apply to write.`);
    return;
  }

  // --apply path
  console.log(`\n[migrate-combined] APPLYING ${toMigrate.length} update(s)...`);
  let applied = 0;
  for (const { row, after } of toMigrate) {
    const { error: updErr } = await admin
      .from("pricing_schemes")
      .update({ calc_type: after.calc_type, params: after.params })
      .eq("id", row.id);
    if (updErr) {
      console.error(`[migrate-combined] FAILED to update ${row.id} (${row.name}): ${updErr.message}`);
      process.exitCode = 1;
      continue;
    }
    applied++;
    console.log(`[migrate-combined] OK   updated ${row.id} (${row.name})`);
  }
  console.log(`[migrate-combined] APPLY complete: ${applied}/${toMigrate.length} row(s) updated.`);
}

main().catch((e) => {
  console.error("[migrate-combined] FATAL:", e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
