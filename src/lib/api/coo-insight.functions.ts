import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin.server";
import { generateCooInsightReport } from "@/lib/coo-insight-engine.server";

// Sama seperti requireAdmin di rider-auth.functions.ts / pnl-push.functions.ts
// — dicek ulang di sini (bukan di-share) supaya file ini tetap berdiri sendiri.
async function requireAdmin(adminToken: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(adminToken);
  if (userErr || !userRes.user)
    throw new Error(`Sesi admin tidak valid: ${userErr?.message ?? "no user"}`);
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id);
  if (!roles?.some((r) => r.role === "admin")) throw new Error("Hanya admin yang bisa lakukan ini");
  return userRes.user.id;
}

// Tombol "Generate Sekarang" di admin.coo-insights.tsx — sama persis logicnya
// dengan cron (src/routes/api.coo-insight.ts), cuma otentikasinya pakai sesi
// admin yang lagi login (bukan secret header).
export const triggerCooInsightManual = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ adminToken: z.string().min(1), weekStart: z.string(), weekEnd: z.string() }),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.adminToken);
    return generateCooInsightReport(data.weekStart, data.weekEnd);
  });

export const listCooInsightReports = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ adminToken: z.string().min(1), limit: z.number().min(1).max(52).default(12) }),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.adminToken);
    const admin = getSupabaseAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (admin as any)
      .from("coo_insight_reports")
      .select("*")
      .order("week_start", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addIncidentReport = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      adminToken: z.string().min(1),
      weekStart: z.string(),
      weekEnd: z.string(),
      type: z.enum(["operational", "financial", "system", "market"]),
      description: z.string().min(1),
      severity: z.enum(["HIGH", "MEDIUM", "LOW"]),
      estimatedImpact: z.number().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.adminToken);
    const admin = getSupabaseAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from("coo_incident_reports").insert({
      week_start: data.weekStart,
      week_end: data.weekEnd,
      type: data.type,
      description: data.description,
      severity: data.severity,
      estimated_impact: data.estimatedImpact ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listIncidentReports = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ adminToken: z.string().min(1), weekStart: z.string(), weekEnd: z.string() }),
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.adminToken);
    const admin = getSupabaseAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (admin as any)
      .from("coo_incident_reports")
      .select("*")
      .gte("week_start", data.weekStart)
      .lte("week_end", data.weekEnd)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const deleteIncidentReport = createServerFn({ method: "POST" })
  .inputValidator(z.object({ adminToken: z.string().min(1), id: z.string().uuid() }))
  .handler(async ({ data }) => {
    await requireAdmin(data.adminToken);
    const admin = getSupabaseAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from("coo_incident_reports").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
