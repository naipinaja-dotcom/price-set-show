import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import type {} from "@tanstack/react-start";
import {
  runPayrollReminderCheck,
  verifyPayrollReminderSecret,
} from "@/lib/payroll-reminder.server";
import { getPostHogClient } from "@/utils/posthog-server";

// Endpoint buat cron harian manggil Payroll Reminder (PRD.md §10 backlog #8).
// Dipanggil via HTTP POST + header `x-payroll-reminder-secret` (harus sama
// persis dengan env PAYROLL_REMINDER_SECRET). Jadwalkan lewat pg_cron + pg_net
// di Supabase — lihat supabase/migrations/20260712010000_payroll_reminder_cron.sql
// buat contoh SQL-nya (perlu diisi URL production & secret sebelum diaktifkan).
export const Route = createFileRoute("/api/payroll-reminder")({
  server: {
    handlers: {
      POST: async () => {
        const request = getRequest();
        const secretHeader = request?.headers.get("x-payroll-reminder-secret") ?? null;
        if (!verifyPayrollReminderSecret(secretHeader)) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const result = await runPayrollReminderCheck({ triggeredBy: "cron" });
          const posthog = getPostHogClient();
          posthog.capture({
            distinctId: "system-cron",
            event: "payroll_reminder_sent",
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
