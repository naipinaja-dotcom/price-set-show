import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { usePostHog } from "@posthog/react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { PageSizeSelect, PaginationBar } from "@/components/pagination-bar";
import { usePagination } from "@/lib/use-pagination";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { Plus, Loader2, CheckCircle2, Send, X, Download, ExternalLink } from "lucide-react";
import { fetchAllRows } from "@/lib/fetch-all";
import { getLastFeePeriod, type LastFeePeriod } from "@/lib/last-fee-period";
import { resolveRiderIdentities } from "@/lib/rider-lookup";
import {
  downloadBulkPaymentCSV,
  downloadBulkPaymentXLS,
  type BulkPaymentRow,
} from "@/lib/bulk-payment-export";

export const Route = createFileRoute("/admin/payroll")({ component: PayrollPage });

type Run = {
  id: string;
  name: string;
  period_type: string;
  period_start: string;
  period_end: string;
  status: string;
};
type Detail = {
  id: string;
  rider_id: string;
  client_id: string | null;
  delivery_count: number;
  delivery_fee: number;
  attendance_fee: number;
  incentive: number;
  penalty: number;
  gross_earning: number;
  total_deduction: number;
  net_pay: number;
  riders?: { full_name: string; employee_id: string };
};

function PayrollPage() {
  const posthog = usePostHog();
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [details, setDetails] = useState<Detail[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newRunOpen, setNewRunOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [exportingBulk, setExportingBulk] = useState(false);
  const [lastPeriod, setLastPeriod] = useState<LastFeePeriod | null>(null);
  const [prefill, setPrefill] = useState<{ start: string; end: string } | null>(null);
  const {
    pageSize: detailPageSize,
    setPageSize: setDetailPageSize,
    page: detailPage,
    setPage: setDetailPage,
    totalPages: detailTotalPages,
    paged: pagedDetails,
    from: detailFrom,
    to: detailTo,
    total: detailTotal,
  } = usePagination(details, 20);

  const loadRuns = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payroll_runs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRuns(data ?? []);
    setLoading(false);
  };
  useEffect(() => {
    loadRuns();
    setLastPeriod(getLastFeePeriod());
  }, []);

  const loadDetails = async (runId: string) => {
    const { data, error } = await supabase
      .from("payroll_details")
      .select("*, riders(full_name, employee_id)")
      .eq("run_id", runId)
      .order("net_pay", { ascending: false });
    if (error) toast.error(error.message);
    else setDetails((data ?? []) as any);
  };

  useEffect(() => {
    if (activeRun) loadDetails(activeRun.id);
  }, [activeRun]);

  const createRun = async (input: {
    name: string;
    period_type: string;
    period_start: string;
    period_end: string;
  }) => {
    setCreating(true);
    const { data, error } = await supabase
      .from("payroll_runs")
      .insert({
        name: input.name,
        period_type: input.period_type as any,
        period_start: input.period_start,
        period_end: input.period_end,
      })
      .select()
      .single();
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    posthog.capture("payroll_run_created", {
      period_type: input.period_type,
      period_from: input.period_start,
      period_to: input.period_end,
    });
    toast.success("Run dibuat");
    setRuns([data, ...runs]);
    setActiveRun(data);
    setNewRunOpen(false);
    setPrefill(null);
  };

  const generate = async () => {
    if (!activeRun) return;
    if (
      !(await confirmDialog({
        title: "Generate ulang payroll?",
        description: "Detail payroll yang lama untuk run ini akan dihapus dan dihitung ulang.",
        confirmText: "Generate ulang",
        danger: false,
      }))
    )
      return;
    setLoading(true);
    try {
      // delete existing details for this run
      await supabase.from("payroll_details").delete().eq("run_id", activeRun.id);

      // STEP 1: Fetch semua delivery & attendance di periode ini dulu (sekalian fee-nya)
      // Pakai fetchAllRows supaya data >1000 baris tidak terpotong diam-diam.
      const [deliveries, attendance] = await Promise.all([
        fetchAllRows<{ rider_id: string | null; driver_code: string | null; fee: number | null }>(
          (sb, from, to) =>
            sb
              .from("delivery_records")
              .select("rider_id, driver_code, fee")
              .gte("delivery_date", activeRun.period_start)
              .lte("delivery_date", activeRun.period_end)
              .range(from, to),
        ),
        fetchAllRows<{ rider_id: string | null; driver_code: string | null; fee: number | null }>(
          (sb, from, to) =>
            (sb as any)
              .from("attendance_logs")
              .select("rider_id, driver_code, fee")
              .gte("log_date", activeRun.period_start)
              .lte("log_date", activeRun.period_end)
              .range(from, to),
        ),
      ]);

      // STEP 2: resolve identitas rider dari rider_id ATAU fallback kode mitra —
      // baris lama yang link rider_id-nya putus (upload sebelum resolveOrCreateRiders
      // dipasang) tetap kehitung, bukan diam-diam hilang dari payroll.
      const { resolvedIdOf } = await resolveRiderIdentities([...deliveries, ...attendance]);
      const riderIds = [
        ...new Set([...deliveries.map(resolvedIdOf), ...attendance.map(resolvedIdOf)]),
      ].filter((id): id is string => !!id);

      // STEP 3: Fetch detail rider HANYA yang ada di list rider_ids
      let riders: any[] = [];
      if (riderIds.length > 0) {
        const { data, error } = await supabase
          .from("riders")
          .select("id, client_id, employee_id, full_name")
          .in("id", riderIds);
        if (error) throw error;
        riders = data ?? [];
      }
      console.log(
        `[Payroll Generate] ${deliveries.length} baris delivery, ${attendance.length} baris absensi, ${riderIds.length} rider_id unik, ${riders.length} rider ketemu di tabel riders.`,
      );

      // STEP 4: Fetch data pendukung lain (installments, deduction_types)
      const [{ data: installments }, { data: autoTypes }] = await Promise.all([
        supabase
          .from("rider_installments")
          .select("*")
          .eq("active", true)
          .lte("next_deduction_date", activeRun.period_end),
        (supabase as any)
          .from("deduction_types")
          .select("id, name, recurring_amount")
          .eq("active", true)
          .eq("auto_recurring", true),
      ]);

      const detailsToInsert: any[] = [];
      const deductionsToInsert: any[] = [];

      for (const rider of riders ?? []) {
        const rDelivs = deliveries.filter((d) => resolvedIdOf(d) === rider.id);
        const rAttend = attendance.filter((a) => resolvedIdOf(a) === rider.id);

        const deliveryFee = rDelivs.reduce((s, d) => s + Number(d.fee || 0), 0);
        const deliveryCount = rDelivs.length;
        const attendanceFee = rAttend.reduce((s, a) => s + Number(a.fee || 0), 0);
        // Insentif & penalty udah dianyam ke dalam attendance_fee sama Type E
        // engine (bukan line-item terpisah lagi kayak jalur lama).
        const incentiveTotal = 0;
        const penalty = 0;
        const gross = deliveryFee + attendanceFee + incentiveTotal - penalty;

        const rInstall = (installments ?? []).filter((i: any) => i.rider_id === rider.id);
        const installTotal = rInstall.reduce(
          (s: number, i: any) => s + Number(i.per_period_amount),
          0,
        );

        // potongan otomatis flat — cuma buat rider yg punya penghasilan periode ini
        const autoTotal =
          gross > 0
            ? (autoTypes ?? []).reduce(
                (s: number, t: any) => s + (Number(t.recurring_amount) || 0),
                0,
              )
            : 0;

        const totalDed = installTotal + autoTotal;
        const net = Math.max(0, gross - totalDed);
        const detailId = crypto.randomUUID();
        detailsToInsert.push({
          id: detailId,
          run_id: activeRun.id,
          rider_id: rider.id,
          client_id: rider.client_id,
          delivery_count: deliveryCount,
          delivery_fee: deliveryFee,
          attendance_fee: attendanceFee,
          incentive: incentiveTotal,
          penalty,
          gross_earning: gross,
          total_deduction: totalDed,
          net_pay: net,
        });
        for (const ins of rInstall) {
          deductionsToInsert.push({
            detail_id: detailId,
            deduction_type_id: ins.deduction_type_id,
            installment_id: ins.id,
            description: `Cicilan ${ins.installments_paid + 1}/${ins.installment_count}`,
            amount: ins.per_period_amount,
          });
        }
        if (gross > 0) {
          for (const t of autoTypes ?? []) {
            const amt = Number(t.recurring_amount) || 0;
            if (amt <= 0) continue;
            deductionsToInsert.push({
              detail_id: detailId,
              deduction_type_id: t.id,
              installment_id: null,
              description: t.name,
              amount: amt,
            });
          }
        }
      }
      if (detailsToInsert.length) {
        const { error: e1 } = await supabase.from("payroll_details").insert(detailsToInsert);
        if (e1) throw e1;
      }
      if (deductionsToInsert.length) {
        const { error: e2 } = await supabase.from("payroll_deductions").insert(deductionsToInsert);
        if (e2) throw e2;
      }
      posthog.capture("payroll_generated", {
        run_id: activeRun.id,
        rider_count: detailsToInsert.length,
        period_from: activeRun.period_start,
        period_to: activeRun.period_end,
      });
      toast.success(`Generate ${detailsToInsert.length} detail`);
      loadDetails(activeRun.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const finalize = async () => {
    if (!activeRun) return;
    setFinalizing(true);
    const { error } = await supabase
      .from("payroll_runs")
      .update({ status: "finalized", finalized_at: new Date().toISOString() })
      .eq("id", activeRun.id);
    setFinalizing(false);
    if (error) return toast.error(error.message);
    posthog.capture("payroll_finalized", {
      run_id: activeRun.id,
      period_from: activeRun.period_start,
      period_to: activeRun.period_end,
    });
    toast.success("Payroll difinalisasi");
    loadRuns();
  };

  const publish = async () => {
    if (!activeRun) return;
    setPublishing(true);
    try {
      // create payslips
      const { data: dets } = await supabase
        .from("payroll_details")
        .select("*")
        .eq("run_id", activeRun.id);
      if (!dets?.length) return toast.error("Belum ada detail");
      const slips = dets.map((d: any) => ({
        detail_id: d.id,
        run_id: activeRun.id,
        rider_id: d.rider_id,
        data: d,
      }));
      const { error: e1 } = await supabase
        .from("payslips")
        .upsert(slips, { onConflict: "detail_id" });
      if (e1) return toast.error(e1.message);
      // advance installments
      const { data: deds } = await supabase
        .from("payroll_deductions")
        .select("installment_id, amount, payroll_details!inner(run_id)")
        .eq("payroll_details.run_id", activeRun.id);
      for (const d of deds ?? []) {
        if (!d.installment_id) continue;
        const { data: ins } = await supabase
          .from("rider_installments")
          .select("*")
          .eq("id", d.installment_id)
          .single();
        if (!ins) continue;
        const paid = ins.installments_paid + 1;
        const done = paid >= ins.installment_count;
        await supabase
          .from("rider_installments")
          .update({
            installments_paid: paid,
            active: !done,
          })
          .eq("id", ins.id);
      }
      const { error: e2 } = await supabase
        .from("payroll_runs")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", activeRun.id);
      if (e2) return toast.error(e2.message);
      posthog.capture("payroll_published", {
        run_id: activeRun.id,
        slip_count: slips.length,
        period_from: activeRun.period_start,
        period_to: activeRun.period_end,
      });
      toast.success(`Publish ${slips.length} slip gaji`);
      loadRuns();
    } finally {
      setPublishing(false);
    }
  };

  // Bulk payment — file transfer bank buat Finance, format ngikutin persis
  // template yang udah dipakai (lihat src/lib/bulk-payment-export.ts).
  // Data bank rider (bank_name/bank_account/bank_account_holder) sengaja
  // di-fetch on-demand di sini, bukan ditaruh di query list utama, biar gak
  // nempel terus di state layar (data rekening termasuk sensitif).
  const exportBulkPayment = async (format: "csv" | "xls") => {
    if (!activeRun || details.length === 0)
      return toast.error("Belum ada detail payroll untuk run ini");
    setExportingBulk(true);
    try {
      const riderIds = [...new Set(details.map((d) => d.rider_id))];
      const { data: bankData, error } = await (supabase as any)
        .from("riders")
        .select("id, full_name, bank_name, bank_account, bank_account_holder")
        .in("id", riderIds);
      if (error) throw error;
      const bankOf = new Map((bankData ?? []).map((r: any) => [r.id, r]));

      // Gabung per rider (jaga-jaga kalau 1 rider punya >1 baris detail di run yang sama)
      const byRider = new Map<string, number>();
      for (const d of details)
        byRider.set(d.rider_id, (byRider.get(d.rider_id) ?? 0) + Number(d.net_pay || 0));

      const rows: BulkPaymentRow[] = [];
      const missingBank: string[] = [];
      for (const [riderId, amount] of byRider) {
        if (amount <= 0) continue; // gak perlu transfer kalau net pay 0/negatif
        const r = bankOf.get(riderId) as
          | {
              full_name?: string;
              bank_name?: string | null;
              bank_account?: string | null;
              bank_account_holder?: string | null;
            }
          | undefined;
        if (!r?.bank_name || !r?.bank_account) {
          missingBank.push(r?.full_name ?? riderId);
          continue;
        }
        rows.push({
          bankName: r.bank_name,
          accountNumber: r.bank_account,
          receiverName: r.bank_account_holder || r.full_name || "",
          amount,
        });
      }

      if (missingBank.length > 0) {
        toast.warning(
          `${missingBank.length} rider dilewati (belum ada data bank): ${missingBank.slice(0, 5).join(", ")}${missingBank.length > 5 ? ", ..." : ""}`,
        );
      }
      if (rows.length === 0)
        return toast.error("Tidak ada rider dengan data bank lengkap untuk di-export");

      const filename = `Bulk Payment - ${activeRun.name} - ${activeRun.period_end}`;
      if (format === "csv") downloadBulkPaymentCSV(filename, rows);
      else downloadBulkPaymentXLS(filename, rows);
      posthog.capture("bulk_payment_exported", {
        format,
        rider_count: rows.length,
        run_id: activeRun.id,
        period_to: activeRun.period_end,
      });
      toast.success(`Bulk payment ${rows.length} rider berhasil di-generate`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExportingBulk(false);
    }
  };

  // Compute stepper step: 1=select period, 2=cek data, 3=hitung, 4=review&commit
  const stepNum = !activeRun
    ? 1
    : activeRun.status === "published"
      ? 4
      : details.length > 0
        ? 4
        : 3;

  const STEPS = [
    { n: 1, label: "Pilih Periode" },
    { n: 2, label: "Cek Data" },
    { n: 3, label: "Hitung Fee" },
    { n: 4, label: "Review & Commit" },
  ];

  return (
    <AdminLayout title="Payroll Run" subtitle="Proses payroll rider step by step">
      {lastPeriod &&
        !runs.some((r) => r.period_start === lastPeriod.from && r.period_end === lastPeriod.to) && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
            <span>
              Kamu baru Hitung Fee &amp; commit <b>{lastPeriod.rowCount} baris</b> untuk{" "}
              <b>{lastPeriod.clientName}</b>, periode{" "}
              <b>
                {lastPeriod.from} → {lastPeriod.to}
              </b>
              .
            </span>
            <button
              onClick={() => {
                setPrefill({ start: lastPeriod.from, end: lastPeriod.to });
                setNewRunOpen(true);
              }}
              className="shrink-0 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm"
            >
              Buat Run periode ini
            </button>
          </div>
        )}

      <div className="flex gap-6">
        {/* Run list sidebar */}
        <aside className="w-56 shrink-0">
          <button
            onClick={() => setNewRunOpen(true)}
            disabled={creating}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm mb-3 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Buat Run Baru
          </button>
          <div className="space-y-1">
            {loading && !runs.length ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            ) : (
              runs.map((r) => {
                const statusColor =
                  r.status === "published"
                    ? "text-success"
                    : r.status === "finalized"
                      ? "text-warning"
                      : "text-muted-foreground";
                return (
                  <button
                    key={r.id}
                    onClick={() => setActiveRun(r)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${activeRun?.id === r.id ? "bg-primary-soft text-primary-soft-foreground font-medium" : "hover:bg-muted/60"}`}
                  >
                    <div className="truncate font-medium text-[13px]">{r.name}</div>
                    <div className={`text-[11px] mt-0.5 ${statusColor}`}>
                      {r.period_start} → {r.period_end} · {r.status}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Main area */}
        <section className="flex-1 min-w-0">
          {!activeRun ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center text-muted-foreground">
                <Plus className="w-5 h-5" />
              </div>
              <p className="text-sm text-muted-foreground">
                Pilih run dari daftar atau buat run baru untuk memulai payroll.
              </p>
              <button
                onClick={() => setNewRunOpen(true)}
                className="text-sm text-primary font-medium hover:underline"
              >
                Buat Payroll Run →
              </button>
            </div>
          ) : (
            <>
              {/* Stepper */}
              <div className="flex items-center mb-5 rounded-xl border border-border bg-card p-4 gap-1">
                {STEPS.map((s, i) => {
                  const done = s.n < stepNum || (s.n === 4 && activeRun.status === "published");
                  const active = s.n === stepNum && activeRun.status !== "published";
                  return (
                    <div key={s.n} className="flex items-center flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-full grid place-items-center flex-shrink-0 text-xs font-bold transition-colors
                          ${done ? "bg-success text-success-foreground" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                        >
                          {done ? <CheckCircle2 className="w-4 h-4" /> : s.n}
                        </div>
                        <span
                          className={`text-[12px] font-medium truncate hidden sm:block ${active ? "text-foreground" : done ? "text-success" : "text-muted-foreground"}`}
                        >
                          {s.label}
                        </span>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div
                          className={`flex-1 mx-2 h-px ${s.n < stepNum ? "bg-success/50" : "bg-border"}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Run info + step actions */}
              <div className="rounded-xl border border-border bg-card p-4 mb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-semibold">{activeRun.name}</div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">
                      {activeRun.period_start} → {activeRun.period_end}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/* Step 2: Cek Data link */}
                    <Link
                      to="/admin/data-check"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Cek Data
                    </Link>
                    {/* Step 3: Generate */}
                    <button
                      onClick={generate}
                      disabled={loading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] disabled:opacity-50 hover:bg-muted transition-colors"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      {details.length > 0 ? "Generate Ulang" : "Hitung Fee"}
                    </button>
                    {/* Step 4: Finalize */}
                    <button
                      onClick={finalize}
                      disabled={activeRun.status !== "draft" || finalizing || details.length === 0}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-warning text-warning-foreground px-3 py-1.5 text-[13px] disabled:opacity-40 transition-colors"
                    >
                      {finalizing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}{" "}
                      Finalize
                    </button>
                    {/* Step 4: Publish */}
                    <button
                      onClick={publish}
                      disabled={
                        activeRun.status === "published" || publishing || details.length === 0
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-[13px] disabled:opacity-40 transition-colors"
                    >
                      {publishing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}{" "}
                      Publish
                    </button>
                    {/* Export */}
                    <button
                      onClick={() => exportBulkPayment("csv")}
                      disabled={
                        activeRun.status === "draft" || exportingBulk || details.length === 0
                      }
                      title={activeRun.status === "draft" ? "Finalize dulu" : "Download CSV bank"}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] disabled:opacity-40 hover:bg-muted transition-colors"
                    >
                      {exportingBulk ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}{" "}
                      CSV
                    </button>
                    <button
                      onClick={() => exportBulkPayment("xls")}
                      disabled={
                        activeRun.status === "draft" || exportingBulk || details.length === 0
                      }
                      title={activeRun.status === "draft" ? "Finalize dulu" : "Download XLS bank"}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] disabled:opacity-40 hover:bg-muted transition-colors"
                    >
                      {exportingBulk ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}{" "}
                      XLS
                    </button>
                  </div>
                </div>
              </div>

              {/* Detail table */}
              {details.length > 0 && (
                <div className="flex justify-end mb-2">
                  <PageSizeSelect pageSize={detailPageSize} setPageSize={setDetailPageSize} />
                </div>
              )}
              <div className="rounded-xl border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left">
                    <tr>
                      <th className="px-3 py-2.5 font-medium text-[12px] text-muted-foreground">
                        Rider
                      </th>
                      <th className="px-2 py-2.5 font-medium text-[12px] text-muted-foreground">
                        Deliv
                      </th>
                      <th className="px-2 py-2.5 font-medium text-[12px] text-muted-foreground">
                        Fee Deliv
                      </th>
                      <th className="px-2 py-2.5 font-medium text-[12px] text-muted-foreground">
                        Fee Absensi
                      </th>
                      <th className="px-2 py-2.5 font-medium text-[12px] text-muted-foreground">
                        Insentif
                      </th>
                      <th className="px-2 py-2.5 font-medium text-[12px] text-muted-foreground">
                        Penalty
                      </th>
                      <th className="px-2 py-2.5 font-medium text-[12px] text-muted-foreground">
                        Gross
                      </th>
                      <th className="px-2 py-2.5 font-medium text-[12px] text-muted-foreground">
                        Potongan
                      </th>
                      <th className="px-2 py-2.5 font-medium text-[12px] text-muted-foreground">
                        Net Pay
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-muted-foreground text-sm">
                          Belum ada detail — klik "Hitung Fee" untuk generate
                        </td>
                      </tr>
                    ) : (
                      pagedDetails.map((d) => (
                        <tr
                          key={d.id}
                          className="border-t border-border hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-[13px]">{d.riders?.full_name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {d.riders?.employee_id}
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-[13px]">{d.delivery_count}</td>
                          <td className="px-2 py-2.5 text-[13px] tabular-nums">
                            Rp{Number(d.delivery_fee).toLocaleString("id-ID")}
                          </td>
                          <td className="px-2 py-2.5 text-[13px] tabular-nums">
                            Rp{Number(d.attendance_fee).toLocaleString("id-ID")}
                          </td>
                          <td className="px-2 py-2.5 text-[13px] tabular-nums">
                            Rp{Number(d.incentive).toLocaleString("id-ID")}
                          </td>
                          <td className="px-2 py-2.5 text-[13px] tabular-nums text-destructive">
                            Rp{Number(d.penalty).toLocaleString("id-ID")}
                          </td>
                          <td className="px-2 py-2.5 text-[13px] tabular-nums">
                            Rp{Number(d.gross_earning).toLocaleString("id-ID")}
                          </td>
                          <td className="px-2 py-2.5 text-[13px] tabular-nums text-destructive">
                            Rp{Number(d.total_deduction).toLocaleString("id-ID")}
                          </td>
                          <td className="px-2 py-2.5 text-[13px] tabular-nums font-semibold">
                            Rp{Number(d.net_pay).toLocaleString("id-ID")}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {details.length > 0 && (
                <PaginationBar
                  page={detailPage}
                  totalPages={detailTotalPages}
                  setPage={setDetailPage}
                  from={detailFrom}
                  to={detailTo}
                  total={detailTotal}
                />
              )}
            </>
          )}
        </section>
      </div>
      {newRunOpen && (
        <NewRunModal
          creating={creating}
          initialStart={prefill?.start}
          initialEnd={prefill?.end}
          onClose={() => {
            setNewRunOpen(false);
            setPrefill(null);
          }}
          onCreate={createRun}
        />
      )}
    </AdminLayout>
  );
}

function NewRunModal({
  creating,
  initialStart,
  initialEnd,
  onClose,
  onCreate,
}: {
  creating: boolean;
  initialStart?: string;
  initialEnd?: string;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    period_type: string;
    period_start: string;
    period_end: string;
  }) => void;
}) {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  const [name, setName] = useState(
    `Payroll ${today.toLocaleString("id-ID", { month: "long", year: "numeric" })}`,
  );
  const [periodType, setPeriodType] = useState("monthly");
  const [start, setStart] = useState(initialStart ?? firstOfMonth);
  const [end, setEnd] = useState(initialEnd ?? lastOfMonth);

  const submit = () => {
    if (!name.trim()) return toast.error("Nama run wajib diisi");
    if (!start || !end) return toast.error("Tanggal periode wajib diisi");
    if (start > end) return toast.error("Tanggal mulai tidak boleh setelah tanggal akhir");
    onCreate({ name: name.trim(), period_type: periodType, period_start: start, period_end: end });
  };

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Payroll Run Baru</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        {initialStart && (
          <p className="text-xs text-muted-foreground mb-3">
            Tanggal diisi otomatis dari periode Hitung Fee terakhir — bisa diubah kalau perlu.
          </p>
        )}
        <div className="space-y-3 text-sm">
          <div>
            <label className="font-medium">Nama Run</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </div>
          <div>
            <label className="font-medium">Tipe Periode</label>
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            >
              <option value="weekly">Mingguan</option>
              <option value="biweekly">Dua Mingguan</option>
              <option value="monthly">Bulanan</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium">Dari Tanggal</label>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </div>
            <div>
              <label className="font-medium">Sampai Tanggal</label>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-border">
            Batal
          </button>
          <button
            onClick={submit}
            disabled={creating}
            className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50"
          >
            {creating ? "Membuat…" : "Buat Run"}
          </button>
        </div>
      </div>
    </div>
  );
}
