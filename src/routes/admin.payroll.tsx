import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { toast } from "sonner";
import { Plus, Loader2, CheckCircle2, Send, X } from "lucide-react";

export const Route = createFileRoute("/admin/payroll")({ component: PayrollPage });

type Run = { id: string; name: string; period_type: string; period_start: string; period_end: string; status: string };
type Detail = {
  id: string; rider_id: string; client_id: string | null;
  delivery_count: number; delivery_fee: number; attendance_fee: number;
  incentive: number; penalty: number; gross_earning: number; total_deduction: number; net_pay: number;
  riders?: { full_name: string; employee_id: string };
};

function PayrollPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [details, setDetails] = useState<Detail[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newRunOpen, setNewRunOpen] = useState(false);

  const loadRuns = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("payroll_runs").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message); else setRuns(data ?? []);
    setLoading(false);
  };
  useEffect(() => { loadRuns(); }, []);

  const loadDetails = async (runId: string) => {
    const { data, error } = await supabase.from("payroll_details")
      .select("*, riders(full_name, employee_id)").eq("run_id", runId).order("net_pay", { ascending: false });
    if (error) toast.error(error.message); else setDetails((data ?? []) as any);
  };

  useEffect(() => { if (activeRun) loadDetails(activeRun.id); }, [activeRun]);

  const createRun = async (input: { name: string; period_type: string; period_start: string; period_end: string }) => {
    setCreating(true);
    const { data, error } = await supabase.from("payroll_runs")
      .insert({ name: input.name, period_type: input.period_type as any, period_start: input.period_start, period_end: input.period_end })
      .select().single();
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Run dibuat"); setRuns([data, ...runs]); setActiveRun(data); setNewRunOpen(false);
  };

  const generate = async () => {
    if (!activeRun) return;
    if (!confirm("Generate ulang detail payroll? Detail lama akan dihapus.")) return;
    setLoading(true);
    // delete existing details for this run
    await supabase.from("payroll_details").delete().eq("run_id", activeRun.id);

    // fetch riders + their deliveries + attendance in period.
    // Attendance fee sekarang dipungut dari attendance_logs.fee — udah
    // dihitung & di-Commit lewat Hitung Fee (skema Type E), sama persis
    // pola delivery_records.fee. Jalur lama (attendance_rules/attendance_incentives,
    // hitung ulang di sini) DIBUANG biar cuma ada SATU sumber kebenaran.
    const [{ data: riders }, { data: deliveries }, { data: attendance }, { data: installments }, { data: autoTypes }] = await Promise.all([
      supabase.from("riders").select("id, client_id, employee_id, full_name").eq("status", "active"),
      supabase.from("delivery_records").select("rider_id, client_id, fee")
        .gte("delivery_date", activeRun.period_start).lte("delivery_date", activeRun.period_end),
      (supabase as any).from("attendance_logs").select("rider_id, fee")
        .gte("log_date", activeRun.period_start).lte("log_date", activeRun.period_end),
      supabase.from("rider_installments").select("*").eq("active", true)
        .lte("next_deduction_date", activeRun.period_end),
      // potongan otomatis (flat, tiap periode) — mis. Biaya Admin
      (supabase as any).from("deduction_types").select("id, name, recurring_amount")
        .eq("active", true).eq("auto_recurring", true),
    ]);

    const detailsToInsert: any[] = [];
    const deductionsToInsert: any[] = [];

    for (const rider of riders ?? []) {
      const rDelivs = (deliveries ?? []).filter((d) => d.rider_id === rider.id);
      const rAttend = (attendance ?? []).filter((a: any) => a.rider_id === rider.id);

      const deliveryFee = rDelivs.reduce((s, d) => s + Number(d.fee || 0), 0);
      const deliveryCount = rDelivs.length;
      const attendanceFee = rAttend.reduce((s: number, a: any) => s + Number(a.fee || 0), 0);
      // Insentif & penalty udah dianyam ke dalam attendance_fee sama Type E
      // engine (bukan line-item terpisah lagi kayak jalur lama).
      const incentiveTotal = 0;
      const penalty = 0;
      const gross = deliveryFee + attendanceFee + incentiveTotal - penalty;

      const rInstall = (installments ?? []).filter((i: any) => i.rider_id === rider.id);
      const installTotal = rInstall.reduce((s: number, i: any) => s + Number(i.per_period_amount), 0);

      // potongan otomatis flat — cuma buat rider yg punya penghasilan periode ini
      const autoTotal = gross > 0
        ? (autoTypes ?? []).reduce((s: number, t: any) => s + (Number(t.recurring_amount) || 0), 0)
        : 0;

      const totalDed = installTotal + autoTotal;
      const net = Math.max(0, gross - totalDed);
      const detailId = crypto.randomUUID();
      detailsToInsert.push({
        id: detailId, run_id: activeRun.id, rider_id: rider.id, client_id: rider.client_id,
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
      const { error: e1 } = await supabase.from("payroll_details").insert(detailsToInsert);
      if (e1) { setLoading(false); return toast.error(e1.message); }
    }
    if (deductionsToInsert.length) {
      const { error: e2 } = await supabase.from("payroll_deductions").insert(deductionsToInsert);
      if (e2) { setLoading(false); return toast.error(e2.message); }
    }
    toast.success(`Generate ${detailsToInsert.length} detail`);
    loadDetails(activeRun.id);
    setLoading(false);
  };

  const finalize = async () => {
    if (!activeRun) return;
    const { error } = await supabase.from("payroll_runs").update({ status: "finalized", finalized_at: new Date().toISOString() }).eq("id", activeRun.id);
    if (error) return toast.error(error.message);
    toast.success("Payroll difinalisasi");
    loadRuns();
  };

  const publish = async () => {
    if (!activeRun) return;
    // create payslips
    const { data: dets } = await supabase.from("payroll_details").select("*").eq("run_id", activeRun.id);
    if (!dets?.length) return toast.error("Belum ada detail");
    const slips = dets.map((d: any) => ({
      detail_id: d.id, run_id: activeRun.id, rider_id: d.rider_id, data: d,
    }));
    const { error: e1 } = await supabase.from("payslips").upsert(slips, { onConflict: "detail_id" });
    if (e1) return toast.error(e1.message);
    // advance installments
    const { data: pdeds } = await supabase.from("payroll_deductions").select("installment_id").eq("description", "x");
    void pdeds;
    const { data: deds } = await supabase.from("payroll_deductions")
      .select("installment_id, amount, payroll_details!inner(run_id)").eq("payroll_details.run_id", activeRun.id);
    for (const d of (deds ?? [])) {
      if (!d.installment_id) continue;
      const { data: ins } = await supabase.from("rider_installments").select("*").eq("id", d.installment_id).single();
      if (!ins) continue;
      const paid = ins.installments_paid + 1;
      const done = paid >= ins.installment_count;
      await supabase.from("rider_installments").update({
        installments_paid: paid, active: !done,
      }).eq("id", ins.id);
    }
    const { error: e2 } = await supabase.from("payroll_runs").update({ status: "published", published_at: new Date().toISOString() }).eq("id", activeRun.id);
    if (e2) return toast.error(e2.message);
    toast.success(`Publish ${slips.length} slip gaji`);
    loadRuns();
  };

  return (
    <AdminLayout title="Payroll">
      <div className="flex gap-6">
        <aside className="w-64 shrink-0">
          <button onClick={() => setNewRunOpen(true)} disabled={creating}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm mb-3 disabled:opacity-50">
            <Plus className="w-4 h-4" /> Buat Run Baru
          </button>
          <div className="space-y-1">
            {loading && !runs.length ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> :
              runs.map((r) => (
                <button key={r.id} onClick={() => setActiveRun(r)}
                  className={`w-full text-left p-2 rounded text-sm ${activeRun?.id === r.id ? "bg-muted font-medium" : "hover:bg-muted/50"}`}>
                  <div className="truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.period_start} → {r.period_end} · {r.status}</div>
                </button>
              ))}
          </div>
        </aside>
        <section className="flex-1 min-w-0">
          {!activeRun ? <p className="text-sm text-muted-foreground">Pilih atau buat payroll run.</p> : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="font-semibold">{activeRun.name}</h3>
                  <p className="text-xs text-muted-foreground">{activeRun.period_start} → {activeRun.period_end} · status: <b>{activeRun.status}</b></p>
                </div>
                <div className="flex gap-2">
                  <button onClick={generate} className="rounded-md border border-border px-3 py-1.5 text-sm">Generate Detail</button>
                  <button onClick={finalize} disabled={activeRun.status !== "draft"} className="rounded-md bg-amber-500 text-white px-3 py-1.5 text-sm disabled:opacity-50 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Finalize
                  </button>
                  <button onClick={publish} disabled={activeRun.status === "published"} className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-50 inline-flex items-center gap-1">
                    <Send className="w-4 h-4" /> Publish
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left">
                    <tr><th className="p-2">Rider</th><th>Delivery</th><th>Fee Deliv</th><th>Fee Absensi</th><th>Insentif</th><th>Penalty</th><th>Gross</th><th>Potongan</th><th>Net Pay</th></tr>
                  </thead>
                  <tbody>
                    {details.length === 0 ? <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Belum ada detail — klik Generate Detail</td></tr> :
                      details.map((d) => (
                        <tr key={d.id} className="border-t border-border">
                          <td className="p-2"><div className="font-medium">{d.riders?.full_name}</div><div className="text-xs text-muted-foreground">{d.riders?.employee_id}</div></td>
                          <td>{d.delivery_count}</td>
                          <td>Rp{Number(d.delivery_fee).toLocaleString("id-ID")}</td>
                          <td>Rp{Number(d.attendance_fee).toLocaleString("id-ID")}</td>
                          <td>Rp{Number(d.incentive).toLocaleString("id-ID")}</td>
                          <td className="text-red-600">Rp{Number(d.penalty).toLocaleString("id-ID")}</td>
                          <td>Rp{Number(d.gross_earning).toLocaleString("id-ID")}</td>
                          <td className="text-red-600">Rp{Number(d.total_deduction).toLocaleString("id-ID")}</td>
                          <td className="font-semibold">Rp{Number(d.net_pay).toLocaleString("id-ID")}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
      {newRunOpen && <NewRunModal creating={creating} onClose={() => setNewRunOpen(false)} onCreate={createRun} />}
    </AdminLayout>
  );
}

function NewRunModal({ creating, onClose, onCreate }: {
  creating: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; period_type: string; period_start: string; period_end: string }) => void;
}) {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [name, setName] = useState(`Payroll ${today.toLocaleString("id-ID", { month: "long", year: "numeric" })}`);
  const [periodType, setPeriodType] = useState("monthly");
  const [start, setStart] = useState(firstOfMonth);
  const [end, setEnd] = useState(lastOfMonth);

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
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <label className="font-medium">Nama Run</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
          </div>
          <div>
            <label className="font-medium">Tipe Periode</label>
            <select value={periodType} onChange={(e) => setPeriodType(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2">
              <option value="weekly">Mingguan</option>
              <option value="biweekly">Dua Mingguan</option>
              <option value="monthly">Bulanan</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium">Dari Tanggal</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
            </div>
            <div>
              <label className="font-medium">Sampai Tanggal</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-border">Batal</button>
          <button onClick={submit} disabled={creating}
            className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50">
            {creating ? "Membuat…" : "Buat Run"}
          </button>
        </div>
      </div>
    </div>
  );
}
