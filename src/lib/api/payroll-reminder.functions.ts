import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin.server";
import { runPayrollReminderCheck } from "@/lib/payroll-reminder.server";

// Sama seperti requireAdmin di pnl-push.functions.ts — dicek ulang di sini
// (bukan di-share) supaya file ini tetap bisa dibaca berdiri sendiri.
async function requireAdmin(adminToken: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(adminToken);
  if (userErr || !userRes.user) throw new Error(`Sesi admin tidak valid: ${userErr?.message ?? "no user"}`);
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userRes.user.id);
  if (!roles?.some((r) => r.role === "admin")) throw new Error("Hanya admin yang bisa lakukan ini");
  return userRes.user.id;
}

// Tombol "Test Kirim Sekarang" di halaman Payroll — sama persis logicnya
// dengan cron (src/routes/api.payroll-reminder.ts), cuma triggeredBy beda
// dan otentikasinya pakai sesi admin yang lagi login (bukan secret header).
export const triggerPayrollReminderManual = createServerFn({ method: "POST" })
  .inputValidator(z.object({ adminToken: z.string().min(1), forDate: z.string().optional() }))
  .handler(async ({ data }) => {
    const userId = await requireAdmin(data.adminToken);
    return runPayrollReminderCheck({ triggeredBy: "manual", triggeredByUserId: userId, forDate: data.forDate });
  });
