// Aggregate delivery_records/attendance_logs (fee yang udah di-commit dari
// Hitung Fee) jadi payroll_details per rider, buat 1 payroll_runs row.
// Dipakai di 2 tempat: tombol "Generate Ulang" manual di Payroll Run, DAN
// otomatis dipanggil begitu commit() di Hitung Fee sukses — biar run-nya udah
// siap direview begitu balik ke Payroll Run, tanpa langkah manual tambahan.
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { resolveRiderIdentities } from "@/lib/rider-lookup";

export interface PayrollRunLite {
  id: string;
  client_id: string | null;
  period_start: string;
  period_end: string;
  status?: string;
}

// `client` opsional: default-nya client browser (anon) yang dipakai selama ini
// dari Hitung Fee/Payroll Run. Cron/workflow server-only (gak ada session admin)
// wajib kirim getSupabaseAdmin() di sini — lihat payroll-workflow.server.ts.
export async function generatePayrollDetails(
  run: PayrollRunLite,
  client: typeof supabase = supabase,
): Promise<{ detailCount: number }> {
  await client.from("payroll_details").delete().eq("run_id", run.id);

  const [deliveries, attendance] = await Promise.all([
    fetchAllRows<{ rider_id: string | null; driver_code: string | null; fee: number | null }>((sb, from, to) => {
      let q = sb.from("delivery_records").select("rider_id, driver_code, fee")
        .gte("delivery_date", run.period_start).lte("delivery_date", run.period_end);
      if (run.client_id) q = q.eq("client_id", run.client_id);
      return q.range(from, to);
    }, 1000, client),
    fetchAllRows<{ rider_id: string | null; driver_code: string | null; fee: number | null }>((sb, from, to) => {
      let q = (sb as any).from("attendance_logs").select("rider_id, driver_code, fee")
        .gte("log_date", run.period_start).lte("log_date", run.period_end);
      if (run.client_id) q = q.eq("client_id", run.client_id);
      return q.range(from, to);
    }, 1000, client),
  ]);

  const { resolvedIdOf } = await resolveRiderIdentities([...deliveries, ...attendance], client);
  const riderIds = [...new Set([
    ...deliveries.map(resolvedIdOf),
    ...attendance.map(resolvedIdOf),
  ])].filter((id): id is string => !!id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let riders: any[] = [];
  if (riderIds.length > 0) {
    const { data, error } = await client.from("riders")
      .select("id, client_id, employee_id, full_name")
      .in("id", riderIds);
    if (error) throw error;
    riders = data ?? [];
  }

  const [{ data: installments }, { data: autoTypes }] = await Promise.all([
    client.from("rider_installments").select("*").eq("active", true)
      .lte("next_deduction_date", run.period_end),
    (client as any).from("deduction_types").select("id, name, recurring_amount")
      .eq("active", true).eq("auto_recurring", true),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detailsToInsert: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deductionsToInsert: any[] = [];

  for (const rider of riders ?? []) {
    const rDelivs = deliveries.filter((d) => resolvedIdOf(d) === rider.id);
    const rAttend = attendance.filter((a) => resolvedIdOf(a) === rider.id);

    const deliveryFee = rDelivs.reduce((s, d) => s + Number(d.fee || 0), 0);
    const deliveryCount = rDelivs.length;
    const attendanceFee = rAttend.reduce((s, a) => s + Number(a.fee || 0), 0);

    // Skip rider yang gak ada kerja sama sekali periode ini — jangan bikin
    // baris payroll buat rider yang gross-nya nol.
    if (deliveryCount === 0 && attendanceFee === 0) continue;

    const incentiveTotal = 0;
    const penalty = 0;
    const gross = deliveryFee + attendanceFee + incentiveTotal - penalty;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rInstall = (installments ?? []).filter((i: any) => i.rider_id === rider.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const installTotal = rInstall.reduce((s: number, i: any) => s + Number(i.per_period_amount), 0);

    const autoTotal = gross > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (autoTypes ?? []).reduce((s: number, t: any) => s + (Number(t.recurring_amount) || 0), 0)
      : 0;

    const totalDed = installTotal + autoTotal;
    const net = Math.max(0, gross - totalDed);
    const detailId = crypto.randomUUID();
    // Prioritaskan client dari run (deliveries/attendance di atas udah
    // di-filter pakai run.client_id, jadi itu client yang BENERAN dihitung
    // periode ini) — fallback ke rider.client_id cuma buat run "Semua Client"
    // (run.client_id null) biar tetep ada label, bukan kosong.
    detailsToInsert.push({
      id: detailId, run_id: run.id, rider_id: rider.id, client_id: run.client_id ?? rider.client_id,
      delivery_count: deliveryCount, delivery_fee: deliveryFee,
      attendance_fee: attendanceFee, incentive: incentiveTotal, penalty,
      gross_earning: gross, total_deduction: totalDed, net_pay: net,
    });
    for (const ins of rInstall) {
      deductionsToInsert.push({
        detail_id: detailId, deduction_type_id: ins.deduction_type_id,
        installment_id: ins.id, description: `Cicilan ${ins.installments_paid + 1}/${ins.installment_count}`,
        amount: ins.per_period_amount,
      });
    }
    if (gross > 0) {
      for (const t of autoTypes ?? []) {
        const amt = Number(t.recurring_amount) || 0;
        if (amt <= 0) continue;
        deductionsToInsert.push({
          detail_id: detailId, deduction_type_id: t.id,
          installment_id: null, description: t.name, amount: amt,
        });
      }
    }
  }

  if (detailsToInsert.length) {
    const { error: e1 } = await client.from("payroll_details").insert(detailsToInsert);
    if (e1) throw e1;
  }
  if (deductionsToInsert.length) {
    const { error: e2 } = await client.from("payroll_deductions").insert(deductionsToInsert);
    if (e2) throw e2;
  }

  return { detailCount: detailsToInsert.length };
}

// Cari payroll_runs yang PERSIS cocok (client_id + period_start + period_end),
// belum published — kalau ada, reuse (recompute di atasnya). Kalau gak ada,
// bikin baru status "draft". Dipanggil otomatis abis commit() di Hitung Fee,
// biar run-nya langsung ready direview di Payroll Run — gak perlu klik "Buat
// Run" manual lagi.
export async function findOrCreatePayrollRun(
  opts: {
    clientId: string | null;
    clientName: string;
    periodStart: string;
    periodEnd: string;
  },
  client: typeof supabase = supabase,
): Promise<PayrollRunLite> {
  let q = (client as any).from("payroll_runs").select("id, client_id, period_start, period_end, status")
    .eq("period_start", opts.periodStart).eq("period_end", opts.periodEnd)
    .neq("status", "published");
  q = opts.clientId ? q.eq("client_id", opts.clientId) : q.is("client_id", null);
  const { data: existing, error: findErr } = await q.limit(1).maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing;

  const name = `Payroll ${opts.clientName} periode ${opts.periodStart} → ${opts.periodEnd}`;
  const { data: created, error: createErr } = await (client as any).from("payroll_runs")
    .insert({ name, period_type: "weekly", period_start: opts.periodStart, period_end: opts.periodEnd, client_id: opts.clientId })
    .select("id, client_id, period_start, period_end, status").single();
  if (createErr) throw createErr;
  return created;
}
