// Payroll Workflow (OES AI Workforce — payroll pertama) — cron HARIAN yang
// otomatis: per client aktif, cek apakah periode gajiannya jatuh tempo HARI
// INI (siklus per-client, bisa custom lewat Reminder Calendar — lihat
// payroll_reminder_schedules.period_start_weekday/period_end_weekday, default
// mingguan Senin-Minggu kalau client belum di-custom) -> bikin/reuse
// payroll_runs -> panggil generatePayrollDetails() (Business Engine, TIDAK
// diduplikat) -> validasi anomali -> AI audit (Hermes, non-critical) -> notif
// Slack/Email -> log 1 row ke payroll_workflow_runs.
//
// Sengaja SATU file lurus (bukan abstract Worker classes/generic runner) —
// pola yang sama persis dipakai payroll-reminder.server.ts & coo-insight-
// engine.server.ts, dan cuma ada 1 workflow nyata di sini. Kalau nanti beneran
// ada workflow ke-2 (Finance/RCA), baru worth diekstrak jadi shared runner —
// dari 2 contoh nyata jauh lebih gampang generalize drpd nebak dari 1.
//
// Kenapa cron-nya HARIAN (bukan mingguan): dulu semua client diasumsikan
// gajian mingguan Senin-Minggu seragam. Ternyata beda-beda per client — ada
// yang 2x seminggu dengan periode custom (mis. Selasa-Kamis DAN Jumat-Senin).
// Jadi tiap client dicek TIAP HARI: "apakah salah satu periodenya baru aja
// kelar kemarin?" — sama persis pola payroll-reminder.server.ts yang udah
// jalan harian buat kasus serupa (per-client/rider weekdays custom).
//
// Cuma nyentuh payroll_runs berstatus 'draft' — 'finalized'/'published' berarti
// admin udah review/lock manual, jangan ditimpa otomatis.
//
// Publisher (lock + generate payslip) SENGAJA TIDAK ada di sini — itu udah ada
// sebagai tombol "Publish" manual di admin.payroll.tsx (lihat publish() di
// situ), memang harus persetujuan manusia, bukan otomatis.
import { getSupabaseAdmin } from "./supabase-admin.server";
import { getServerConfig } from "./config.server";
import { generatePayrollDetails, findOrCreatePayrollRun, type PayrollRunLite } from "./payroll-generate";
import { callHermes } from "./agents/hermes-client.server";
import { sendSlackMessage } from "./notify/slack.server";
import { sendEmail } from "./notify/email.server";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

export interface ValidationWarning {
  type: "missing_bank_account" | "negative_net_pay" | "duplicate_period_payment" | "unresolved_rider";
  message: string;
}

export interface AuditReport {
  summary: string;
  recommendations: string[];
}

export interface PayrollWorkflowRunResult {
  runId: string;
  clientName: string;
  periodStart: string;
  periodEnd: string;
  detailCount: number;
  totalGross: number;
  totalNet: number;
  warnings: ValidationWarning[];
  audit: AuditReport | null;
}

export interface PayrollWorkflowResult {
  runs: PayrollWorkflowRunResult[];
  skippedClients: string[]; // "Client (periode)" yang run-nya udah finalized/published, gak disentuh
  runLogId?: string; // id row payroll_workflow_runs (log), diisi setelah insert
}

// Default kalau client belum di-custom di Reminder Calendar: Senin(1)-Minggu(0),
// sama ritme dengan Weekly PNL Push.
const DEFAULT_PERIOD_WEEKDAYS = { start: 1, end: 0 };

// 0=Minggu..6=Sabtu (sama seperti kolom weekdays yang udah ada). Periode
// dianggap JATUH TEMPO hari ini kalau KEMARIN persis hari terakhirnya
// (endWeekday) — baru dihitung setelah periode itu benar-benar tutup, bukan
// di hari terakhirnya sendiri. Support wrap-around minggu (mis. Jumat->Senin).
export function resolvePeriodIfDue(
  today: Date,
  startWeekday: number,
  endWeekday: number,
): { periodStart: string; periodEnd: string } | null {
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1);
  if (yesterday.getUTCDay() !== endWeekday) return null;

  const spanDays = ((endWeekday - startWeekday + 7) % 7) + 1;
  const start = new Date(yesterday);
  start.setUTCDate(yesterday.getUTCDate() - (spanDays - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { periodStart: fmt(start), periodEnd: fmt(yesterday) };
}

async function loadClientPeriodSchedules(admin: SupabaseAdmin): Promise<Map<string, { start: number; end: number }[]>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("payroll_reminder_schedules")
    .select("client_id, period_start_weekday, period_end_weekday")
    .not("client_id", "is", null)
    .is("rider_id", null) // periode = konsep level-client, bukan per-rider
    .eq("active", true)
    .not("period_start_weekday", "is", null);
  if (error) throw new Error(`Gagal ambil jadwal periode: ${error.message}`);

  const byClient = new Map<string, { start: number; end: number }[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of (data ?? []) as any[]) {
    const arr = byClient.get(s.client_id) ?? [];
    arr.push({ start: s.period_start_weekday, end: s.period_end_weekday });
    byClient.set(s.client_id, arr);
  }
  return byClient;
}

async function validateRun(
  admin: SupabaseAdmin,
  run: PayrollRunLite,
): Promise<{ warnings: ValidationWarning[]; totalGross: number; totalNet: number }> {
  const warnings: ValidationWarning[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: details, error } = await (admin as any)
    .from("payroll_details")
    .select("rider_id, gross_earning, net_pay, riders(full_name, bank_account)")
    .eq("run_id", run.id);
  if (error) throw new Error(`Gagal ambil payroll_details: ${error.message}`);

  let totalGross = 0;
  let totalNet = 0;
  const riderIds: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of (details ?? []) as any[]) {
    totalGross += Number(d.gross_earning) || 0;
    totalNet += Number(d.net_pay) || 0;
    riderIds.push(d.rider_id);
    const riderName = d.riders?.full_name ?? d.rider_id;
    if (!d.riders?.bank_account) {
      warnings.push({ type: "missing_bank_account", message: `${riderName} belum punya nomor rekening bank` });
    }
    if (Number(d.net_pay) < 0) {
      warnings.push({ type: "negative_net_pay", message: `${riderName} net pay negatif (${d.net_pay})` });
    }
  }

  // Duplicate payment: rider yang sama juga punya payroll_details di run LAIN
  // dengan periode persis sama (client berbeda run tapi periode sama = resiko
  // dibayar dobel kalau dua-duanya sampai di-publish).
  if (riderIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: otherRuns } = await (admin as any)
      .from("payroll_runs")
      .select("id")
      .eq("period_start", run.period_start)
      .eq("period_end", run.period_end)
      .neq("id", run.id);
    const otherRunIds = (otherRuns ?? []).map((r: { id: string }) => r.id);
    if (otherRunIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dupes } = await (admin as any)
        .from("payroll_details")
        .select("rider_id, riders(full_name)")
        .in("run_id", otherRunIds)
        .in("rider_id", riderIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const d of (dupes ?? []) as any[]) {
        warnings.push({
          type: "duplicate_period_payment",
          message: `${d.riders?.full_name ?? d.rider_id} juga muncul di payroll run lain periode yang sama`,
        });
      }
    }
  }

  // Rider yang ada delivery/attendance periode ini tapi rider_id-nya gak
  // ke-resolve sama sekali (driver_code gak match rider manapun) — makanya
  // gak pernah masuk payroll_details, padahal ada aktivitas beneran.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: unresolvedDeliveries } = await (admin as any)
    .from("delivery_records")
    .select("driver_code")
    .is("rider_id", null)
    .not("driver_code", "is", null)
    .gte("delivery_date", run.period_start)
    .lte("delivery_date", run.period_end)
    .eq("client_id", run.client_id ?? undefined);
  const unresolvedCodes = [...new Set((unresolvedDeliveries ?? []).map((r: { driver_code: string }) => r.driver_code))];
  for (const code of unresolvedCodes) {
    warnings.push({ type: "unresolved_rider", message: `Ada kiriman dengan kode "${code}" yang gak match rider manapun` });
  }

  return { warnings, totalGross, totalNet };
}

async function runAudit(
  run: PayrollRunLite & { clientName: string },
  detailCount: number,
  totalGross: number,
  totalNet: number,
  warnings: ValidationWarning[],
): Promise<AuditReport | null> {
  try {
    const result = await callHermes({
      system:
        "Kamu auditor payroll internal PT. Dash Elektrik. Baca ringkasan run payroll & warning validasi, " +
        "balas HANYA JSON {\"summary\": string, \"recommendations\": string[]} dalam Bahasa Indonesia — " +
        "summary 2-3 kalimat, recommendations actionable & singkat.",
      user: JSON.stringify({
        client: run.clientName,
        period: `${run.period_start} – ${run.period_end}`,
        detailCount,
        totalGross,
        totalNet,
        warnings: warnings.map((w) => w.message),
      }),
      maxTokens: 500,
    });
    const parsed = result as Partial<AuditReport>;
    if (typeof parsed.summary !== "string" || !Array.isArray(parsed.recommendations)) return null;
    return { summary: parsed.summary, recommendations: parsed.recommendations };
  } catch {
    // Non-critical — audit AI gagal (OpenRouter down, dst) BUKAN alasan
    // workflow berhenti. Payroll udah kehitung tetap lanjut ke notif.
    return null;
  }
}

function buildNotification(result: PayrollWorkflowResult): { subject: string; text: string; html: string } {
  const { runs, skippedClients } = result;
  const totalWarnings = runs.reduce((s, r) => s + r.warnings.length, 0);
  const today = new Date().toISOString().slice(0, 10);
  const subject = `Payroll Workflow — ${today}`;
  const lines = [`*💸 Payroll Workflow — ${today}*`];
  if (runs.length === 0) {
    lines.push("Gak ada periode yang jatuh tempo hari ini.");
  }
  for (const r of runs) {
    lines.push(
      `• *${r.clientName}* (${r.periodStart} → ${r.periodEnd}) — ${r.detailCount} rider, net Rp${Math.round(r.totalNet).toLocaleString("id-ID")}` +
        (r.warnings.length ? ` (⚠️ ${r.warnings.length} warning)` : ""),
    );
    if (r.audit) lines.push(`  _${r.audit.summary}_`);
  }
  if (skippedClients.length) lines.push(`Dilewati (udah finalized/published): ${skippedClients.join(", ")}`);
  lines.push(`Total warning: ${totalWarnings}. Cek Payroll Run untuk review sebelum publish.`);
  const text = lines.join("\n");

  const runRows = runs
    .map(
      (r) => `<li><b>${r.clientName}</b> (${r.periodStart} → ${r.periodEnd}) — ${r.detailCount} rider, net Rp${Math.round(r.totalNet).toLocaleString("id-ID")}` +
        (r.warnings.length ? ` (${r.warnings.length} warning)` : "") +
        (r.audit ? `<br/><i>${r.audit.summary}</i>` : "") +
        `</li>`,
    )
    .join("");
  const html = `
  <div style="font-family:sans-serif;max-width:640px;margin:0 auto">
    <h2>Payroll Workflow — ${today}</h2>
    ${runs.length ? `<ul>${runRows}</ul>` : "<p>Gak ada periode yang jatuh tempo hari ini.</p>"}
    ${skippedClients.length ? `<p>Dilewati (udah finalized/published): ${skippedClients.join(", ")}</p>` : ""}
    <p>Total warning: ${totalWarnings}. Cek halaman Payroll Run untuk review sebelum publish.</p>
    <p style="color:#888;font-size:12px;margin-top:16px">Dikirim otomatis oleh Dash Payroll Engine — Payroll Workflow.</p>
  </div>`;
  return { subject, text, html };
}

export async function runPayrollWorkflow(opts: {
  triggeredBy: "cron" | "manual" | "event";
  triggeredByUserId?: string;
}): Promise<PayrollWorkflowResult> {
  const admin = getSupabaseAdmin();
  const today = new Date();
  const startedAt = new Date().toISOString();

  const [{ data: clients, error: clientsErr }, periodsByClient] = await Promise.all([
    admin.from("clients").select("id, name").eq("active", true),
    loadClientPeriodSchedules(admin),
  ]);
  if (clientsErr) throw new Error(`Gagal ambil daftar client: ${clientsErr.message}`);

  const runs: PayrollWorkflowRunResult[] = [];
  const skippedClients: string[] = [];
  let hardError: string | null = null;

  try {
    for (const c of clients ?? []) {
      const clientPeriods = periodsByClient.get(c.id) ?? [DEFAULT_PERIOD_WEEKDAYS];

      for (const p of clientPeriods) {
        const period = resolvePeriodIfDue(today, p.start, p.end);
        if (!period) continue; // periode ini belum jatuh tempo hari ini

        const run = await findOrCreatePayrollRun(
          { clientId: c.id, clientName: c.name, periodStart: period.periodStart, periodEnd: period.periodEnd },
          admin as never,
        );
        if (run.status !== "draft") {
          skippedClients.push(`${c.name} (${period.periodStart}–${period.periodEnd})`);
          continue;
        }

        const { detailCount } = await generatePayrollDetails(run, admin as never);
        if (detailCount === 0) continue; // gak ada aktivitas periode ini — bukan warning, cuma dilewati diam-diam

        const { warnings, totalGross, totalNet } = await validateRun(admin, run);
        const audit = await runAudit({ ...run, clientName: c.name }, detailCount, totalGross, totalNet, warnings);

        runs.push({
          runId: run.id,
          clientName: c.name,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          detailCount,
          totalGross,
          totalNet,
          warnings,
          audit,
        });
      }
    }
  } catch (e) {
    hardError = (e as Error).message;
  }

  const result: PayrollWorkflowResult = { runs, skippedClients };
  const notif = buildNotification(result);
  const slackResult = await sendSlackMessage(notif.text);
  const emailResult = await sendEmail({ subject: notif.subject, html: notif.html });

  const status = hardError ? (runs.length > 0 ? "partial" : "failed") : "completed";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: logRow, error: logErr } = await (admin as any)
    .from("payroll_workflow_runs")
    .insert({
      trigger_type: opts.triggeredBy,
      triggered_by: opts.triggeredByUserId ?? (opts.triggeredBy === "cron" ? "system-cron" : "admin"),
      status,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      result: { ...result, notifyStatus: { slack: slackResult, email: emailResult } },
      error: hardError,
    })
    .select("id")
    .single();
  if (logErr) console.error("[payroll-workflow] gagal simpan log run:", logErr.message);

  if (hardError && runs.length === 0) throw new Error(hardError);
  return { ...result, runLogId: logRow?.id as string | undefined };
}

export function verifyPayrollWorkflowSecret(headerValue: string | null): boolean {
  const expected = getServerConfig().payrollWorkflowSecret;
  return !!expected && !!headerValue && headerValue === expected;
}
