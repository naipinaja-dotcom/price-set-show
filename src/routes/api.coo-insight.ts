import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import type {} from "@tanstack/react-start";
import { generateCooInsightReport, verifyCooInsightSecret } from "@/lib/coo-insight-engine.server";

function defaultWeekRange(): { weekStart: string; weekEnd: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 6); // 7 hari trailing (inklusif hari ini)
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { weekStart: fmt(start), weekEnd: fmt(end) };
}

// Endpoint buat cron mingguan generate COO Insight Report (Worker->Lead->
// Manager->COO, model Hermes lewat OpenRouter). Dipanggil via HTTP POST +
// header `x-coo-insight-secret` (harus sama persis dengan env
// COO_INSIGHT_SECRET). Sengaja endpoint TERPISAH dari /api/pnl-weekly-push —
// kalau OpenRouter/Hermes lambat atau gagal, push Slack/Email PNL mingguan
// (lebih kritis) tetap jalan tanpa terganggu. Jadwalkan lewat pg_cron +
// pg_net BEBERAPA MENIT SETELAH cron pnl-weekly-push, biar snapshot minggu
// ini udah pasti ada duluan.
export const Route = createFileRoute("/api/coo-insight")({
  server: {
    handlers: {
      POST: async () => {
        const request = getRequest();
        const secretHeader = request?.headers.get("x-coo-insight-secret") ?? null;
        if (!verifyCooInsightSecret(secretHeader)) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const { weekStart, weekEnd } = defaultWeekRange();
          const result = await generateCooInsightReport(weekStart, weekEnd);
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
