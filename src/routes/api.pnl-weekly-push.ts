import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import type {} from "@tanstack/react-start";
import { runWeeklyPnlPush, verifyPnlPushSecret } from "@/lib/pnl-weekly-push.server";
import { getPostHogClient } from "@/utils/posthog-server";

// Endpoint buat cron mingguan manggil Weekly PNL Push (Fase 2, C.5).
// Dipanggil via HTTP POST + header `x-pnl-push-secret` (harus sama persis
// dengan env PNL_PUSH_SECRET). Jadwalkan lewat pg_cron + pg_net di Supabase —
// lihat supabase/migrations/20260711140000_pnl_weekly_push_cron.sql buat
// contoh SQL-nya (perlu diisi URL production & secret sebelum diaktifkan).
export const Route = createFileRoute("/api/pnl-weekly-push")({
  server: {
    handlers: {
      POST: async () => {
        const request = getRequest();
        const secretHeader = request?.headers.get("x-pnl-push-secret") ?? null;
        if (!verifyPnlPushSecret(secretHeader)) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const result = await runWeeklyPnlPush({ triggeredBy: "cron" });
          const posthog = getPostHogClient();
          posthog.capture({
            distinctId: "system-cron",
            event: "pnl_weekly_push_sent",
            properties: { triggered_by: "cron", ...result },
          });
          await posthog.flush();
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
