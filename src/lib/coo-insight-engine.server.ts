// COO Insight Agents — analisis P&L mingguan berjenjang (Worker -> Lead ->
// Manager -> COO), dipicu manual dari admin.coo-insights.tsx ATAU cron lewat
// src/routes/api.coo-insight.ts. Butuh pnl_weekly_snapshots minggu itu udah
// ada (dibuat oleh Weekly PNL Push, lihat pnl-weekly-push.server.ts) — kalau
// belum, generate akan gagal dgn pesan yang jelas, bukan nebak angka.
//
// Model: Hermes (NousResearch) lewat OpenRouter, BUKAN Claude — lihat
// src/lib/agents/hermes-client.server.ts. Sengaja dipisah dari cron
// pnl-weekly-push (endpoint api/coo-insight sendiri) biar kalau OpenRouter
// lambat/gagal, push Slack/Email PNL mingguan yang lebih kritis tetap jalan.
import { getSupabaseAdmin } from "./supabase-admin.server";
import { getServerConfig } from "./config.server";
import { runWorkerAgent } from "./agents/worker-agent";
import { runLeadAgent } from "./agents/lead-agent";
import { runManagerAgent } from "./agents/manager-agent";
import { runCooAgent } from "./agents/coo-agent";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

type PnlSnapshotRow = {
  id: string;
  total_revenue: number;
  total_cost: number;
  total_margin: number;
  total_margin_pct: number;
  per_client: Array<{
    client_id: string | null;
    client: string;
    revenue: number | null;
    cost: number;
    margin: number | null;
    marginPct: number | null;
  }>;
};

function prevWeekRange(weekStart: string) {
  const end = new Date(`${weekStart}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { weekStart: fmt(start), weekEnd: fmt(end) };
}

async function findSnapshot(
  admin: SupabaseAdmin,
  weekStart: string,
  weekEnd: string,
): Promise<PnlSnapshotRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("pnl_weekly_snapshots")
    .select("*")
    .eq("week_start", weekStart)
    .eq("week_end", weekEnd)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function generateCooInsightReport(weekStart: string, weekEnd: string) {
  const admin = getSupabaseAdmin();

  const snapshot = await findSnapshot(admin, weekStart, weekEnd);
  if (!snapshot) {
    throw new Error(
      `Belum ada PNL snapshot untuk ${weekStart} – ${weekEnd}. Jalankan Weekly PNL Push dulu.`,
    );
  }

  const prevRange = prevWeekRange(weekStart);
  const prevSnapshot = await findSnapshot(admin, prevRange.weekStart, prevRange.weekEnd);

  // Rata-rata 4 minggu terakhir (termasuk minggu ini) jadi baseline "normal".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recentSnapshots, error: recentErr } = await (admin as any)
    .from("pnl_weekly_snapshots")
    .select("total_revenue, total_cost")
    .lte("week_start", weekStart)
    .order("week_start", { ascending: false })
    .limit(4);
  if (recentErr) throw new Error(recentErr.message);
  const average4week = recentSnapshots?.length
    ? {
        total_revenue:
          recentSnapshots.reduce(
            (s: number, r: { total_revenue: number }) => s + Number(r.total_revenue),
            0,
          ) / recentSnapshots.length,
        total_cost:
          recentSnapshots.reduce(
            (s: number, r: { total_cost: number }) => s + Number(r.total_cost),
            0,
          ) / recentSnapshots.length,
      }
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: incidentRows, error: incErr } = await (admin as any)
    .from("coo_incident_reports")
    .select("*")
    .gte("week_start", weekStart)
    .lte("week_end", weekEnd);
  if (incErr) throw new Error(incErr.message);
  const incidents = (incidentRows ?? []) as Array<{
    type: string;
    description: string;
    estimated_impact: number | null;
  }>;

  const workerAnalysis = await runWorkerAgent({
    current: {
      total_revenue: Number(snapshot.total_revenue),
      total_cost: Number(snapshot.total_cost),
      total_margin: Number(snapshot.total_margin),
      total_margin_pct: Number(snapshot.total_margin_pct),
      per_client: snapshot.per_client,
    },
    previous: prevSnapshot
      ? {
          total_revenue: Number(prevSnapshot.total_revenue),
          total_cost: Number(prevSnapshot.total_cost),
          total_margin: Number(prevSnapshot.total_margin),
        }
      : null,
    average4week,
    incidents: incidents.map((i) => ({
      type: i.type,
      description: i.description,
      estimated_impact: i.estimated_impact,
    })),
  });

  const leadAnalysis = await runLeadAgent({
    workerAnalysis,
    incidents: incidents.map((i) => ({ type: i.type, description: i.description })),
  });

  const managerAnalysis = await runManagerAgent({ workerAnalysis, leadAnalysis });

  const cooAnalysis = await runCooAgent({
    managerAnalysis,
    leadAnalysis,
    pnlContext: {
      revenue: Number(snapshot.total_revenue),
      costs: Number(snapshot.total_cost),
      margin: Number(snapshot.total_margin),
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: saved, error: insErr } = await (admin as any)
    .from("coo_insight_reports")
    .upsert(
      {
        week_start: weekStart,
        week_end: weekEnd,
        pnl_snapshot_id: snapshot.id,
        worker_analysis: workerAnalysis,
        lead_analysis: leadAnalysis,
        manager_analysis: managerAnalysis,
        coo_analysis: cooAnalysis,
        generated_by: getServerConfig().hermesModel,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "pnl_snapshot_id" },
    )
    .select("id")
    .single();
  if (insErr) throw new Error(`Gagal simpan insight report: ${insErr.message}`);

  return {
    id: saved.id,
    weekStart,
    weekEnd,
    workerAnalysis,
    leadAnalysis,
    managerAnalysis,
    cooAnalysis,
  };
}

export function verifyCooInsightSecret(headerValue: string | null): boolean {
  const expected = getServerConfig().cooInsightSecret;
  if (!expected) return false;
  return !!headerValue && headerValue === expected;
}
