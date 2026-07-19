import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import type {} from "@tanstack/react-start";
import { verifyImportSecret, runDailyImport } from "@/lib/data-import.server";
import { getPostHogClient } from "@/utils/posthog-server";

// Endpoint untuk cron harian — tarik data delivery & attendance dari sistem
// eksternal (REST API / direct DB) lalu insert ke Supabase.
//
// Autentikasi: header `x-data-import-secret` harus cocok dengan env
// DATA_IMPORT_SECRET. Jadwalkan via pg_cron + pg_net di Supabase — lihat
// supabase/migrations/20260719000000_data_import_cron.sql.
//
// Env vars yang dibutuhkan (set di Vercel):
//   DATA_IMPORT_SECRET           — shared secret buat autentikasi cron
//   IMPORT_DELIVERY_SOURCE_TYPE  — "rest_api" atau "database"
//   IMPORT_DELIVERY_SOURCE_URL   — URL endpoint / connection string
//   IMPORT_DELIVERY_AUTH_TOKEN   — bearer token (untuk rest_api)
//   IMPORT_ATTENDANCE_SOURCE_TYPE
//   IMPORT_ATTENDANCE_SOURCE_URL
//   IMPORT_ATTENDANCE_AUTH_TOKEN
//
// Body opsional: { "date": "2026-07-18" } — kalau kosong, default kemarin (WIB).

export const Route = createFileRoute("/api/data-import")({
  server: {
    handlers: {
      POST: async () => {
        const request = getRequest();
        const secretHeader = request?.headers.get("x-data-import-secret") ?? null;

        if (!verifyImportSecret(secretHeader)) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          let targetDate: string | undefined;
          try {
            const body = await request?.json();
            if (body?.date) targetDate = body.date;
          } catch {
            // no body or invalid JSON — use default (yesterday)
          }

          const result = await runDailyImport(targetDate);

          const posthog = getPostHogClient();
          posthog.capture({
            distinctId: "system-cron",
            event: "data_import_completed",
            properties: {
              triggered_by: "cron",
              date: targetDate ?? "yesterday",
              deliveries_inserted: result.deliveries.inserted,
              attendance_inserted: result.attendance.inserted,
              errors: result.errors.length,
            },
          });
          await posthog.flush();

          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: (e as Error).message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
