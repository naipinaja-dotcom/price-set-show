import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import type {} from "@tanstack/react-start";
import { getSupabaseAdmin } from "@/lib/supabase-admin.server";
import { verifyCooInsightSecret } from "@/lib/coo-insight-engine.server";

// Read-only summary endpoint buat AI/automation eksternal (Hermes, n8n, dst) —
// satu payload gabungan pnl_weekly_snapshots + coo_insight_reports +
// coo_incident_reports open, biar konsumen luar gak perlu tau skema tabel
// internal. Gerbang secret sama dgn api.coo-insight.ts (satu konsumen, satu
// secret — gak perlu secret terpisah per endpoint).
export const Route = createFileRoute("/api/executive-dashboard")({
  server: {
    handlers: {
      GET: async () => {
        const request = getRequest();
        const secretHeader = request?.headers.get("x-coo-insight-secret") ?? null;
        if (!verifyCooInsightSecret(secretHeader)) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const admin = getSupabaseAdmin();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [{ data: snapshot }, { data: insight }, { data: openIncidents }] = await Promise.all([
          (admin as any)
            .from("pnl_weekly_snapshots")
            .select("*")
            .order("week_start", { ascending: false })
            .limit(1)
            .maybeSingle(),
          (admin as any)
            .from("coo_insight_reports")
            .select("*")
            .order("week_start", { ascending: false })
            .limit(1)
            .maybeSingle(),
          (admin as any)
            .from("coo_incident_reports")
            .select("id, week_start, week_end, type, description, severity, estimated_impact")
            .eq("status", "open")
            .order("week_start", { ascending: false }),
        ]);

        return new Response(
          JSON.stringify({
            ok: true,
            financial: snapshot
              ? {
                  week_start: snapshot.week_start,
                  week_end: snapshot.week_end,
                  revenue: snapshot.total_revenue,
                  cost: snapshot.total_cost,
                  margin: snapshot.total_margin,
                  margin_pct: snapshot.total_margin_pct,
                  per_client: snapshot.per_client,
                }
              : null,
            insight: insight
              ? {
                  week_start: insight.week_start,
                  week_end: insight.week_end,
                  worker_analysis: insight.worker_analysis,
                  lead_analysis: insight.lead_analysis,
                  manager_analysis: insight.manager_analysis,
                  coo_analysis: insight.coo_analysis,
                  generated_by: insight.generated_by,
                  generated_at: insight.generated_at,
                }
              : null,
            alerts: openIncidents ?? [],
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
