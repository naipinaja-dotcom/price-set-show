import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { PageSizeSelect, PaginationBar } from "@/components/pagination-bar";
import { usePagination } from "@/lib/use-pagination";
import { toCSV, downloadCSV } from "@/lib/csv";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/reports")({ component: ReportsPage });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Run = { id: string; name: string; period_start: string; period_end: string; status: string };

function ReportsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [runId, setRunId] = useState("");
  const [mode, setMode] = useState<"client" | "rider">("rider");

  useEffect(() => {
    supabase.from("payroll_runs").select("id, name, period_start, period_end, status")
      .order("created_at", { ascending: false }).then(({ data }) => {
        setRuns(data ?? []); if (data?.length) setRunId(data[0].id);
      });
  }, []);

  const run = runs.find((r) => r.id === runId);

  return (
    <AdminLayout title="Reports">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="text-sm font-medium">Payroll Run</label>
          <select value={runId} onChange={(e) => setRunId(e.target.value)}
            className="mt-1 block min-w-[280px] rounded-md border border-border bg-background px-3 py-2 text-sm">
            {runs.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.period_start} → {r.period_end}) · {r.status}</option>)}
          </select>
        </div>
        <div className="flex gap-1 p-1 bg-muted rounded-md">
          {([["rider", "Per Rider (Finance)"], ["client", "Ringkasan per Client"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)}
              className={`px-3 py-1.5 text-sm rounded ${mode === k ? "bg-card shadow-sm font-medium" : "text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
      </div>
      {!runId ? <p className="text-sm text-muted-foreground">Belum ada payroll run. Buat & generate dulu di menu Payroll.</p>
        : mode === "rider" ? <RiderFinanceReport runId={runId} run={run} />
        : <ClientReport runId={runId} run={run} />}
    </AdminLayout>
  );
}

// ============ MODE 1: Per Rider (format finance) ============
type RiderRow = {
  rider_id: string; name: string; employeeId: string;
  orderCount: number; feeRider: number; activeDates: number;
  ded: Record<string, number>; // per jenis potongan
  total: number;
};

// ambil semua baris (paginasi — batas 1000/request)
async function fetchAllDeliv(start: string, end: string) {
  const pageSize = 1000; let from = 0;
  const rows: { rider_id: string | null; delivery_date: string }[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await sb.from("delivery_records")
      .select("rider_id, delivery_date").gte("delivery_date", start).lte("delivery_date", end)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function RiderFinanceReport({ runId, run }: { runId: string; run?: Run }) {
  const [rows, setRows] = useState<RiderRow[]>([]);
  const [dedTypes, setDedTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!run) return;
    (async () => {
      setLoading(true);
      try {
        const { data: details, error: e1 } = await sb.from("payroll_details")
          .select("id, rider_id, delivery_count, gross_earning, net_pay, riders(full_name, employee_id)")
          .eq("run_id", runId);
        if (e1) throw e1;

        const detailIds = (details ?? []).map((d: { id: string }) => d.id);
        const dedByDetail = new Map<string, Record<string, number>>();
        const typeSet = new Set<string>();
        for (let i = 0; i < detailIds.length; i += 200) {
          const chunk = detailIds.slice(i, i + 200);
          const { data: deds, error: e2 } = await sb.from("payroll_deductions")
            .select("detail_id, amount, deduction_types(name)").in("detail_id", chunk);
          if (e2) throw e2;
          for (const d of deds ?? []) {
            const name = d.deduction_types?.name ?? "Potongan";
            typeSet.add(name);
            const m = dedByDetail.get(d.detail_id) ?? {};
            m[name] = (m[name] ?? 0) + Number(d.amount || 0);
            dedByDetail.set(d.detail_id, m);
          }
        }

        // hari aktif = jumlah tanggal beda per rider di periode run
        const delivs = await fetchAllDeliv(run.period_start, run.period_end);
        const datesByRider = new Map<string, Set<string>>();
        for (const r of delivs) {
          if (!r.rider_id) continue;
          const s = datesByRider.get(r.rider_id) ?? new Set<string>();
          s.add(r.delivery_date); datesByRider.set(r.rider_id, s);
        }

        const built: RiderRow[] = (details ?? []).map((d: {
          id: string; rider_id: string; delivery_count: number; gross_earning: number; net_pay: number;
          riders?: { full_name?: string; employee_id?: string };
        }) => ({
          rider_id: d.rider_id,
          name: d.riders?.full_name ?? "(tanpa nama)",
          employeeId: d.riders?.employee_id ?? "",
          orderCount: d.delivery_count,
          feeRider: Number(d.gross_earning),
          activeDates: datesByRider.get(d.rider_id)?.size ?? 0,
          ded: dedByDetail.get(d.id) ?? {},
          total: Number(d.net_pay),
        })).sort((a: RiderRow, b: RiderRow) => b.total - a.total);

        setDedTypes([...typeSet].sort());
        setRows(built);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [runId, run]);

  const exportCSV = () => {
    const header = ["Driver Name", "Employee ID", "COUNTA of Order", "Fee Rider", "Active Date", ...dedTypes, "Total Fee Order", "Remarks"];
    const data = rows.map((r) => [
      r.name, r.employeeId, r.orderCount, r.feeRider, r.activeDates,
      ...dedTypes.map((t) => r.ded[t] ?? 0),
      r.total, "",
    ]);
    downloadCSV(`finance-${run?.name ?? runId}.csv`, toCSV([header, ...data]));
  };

  const t = rows.reduce((s, r) => ({
    order: s.order + r.orderCount, fee: s.fee + r.feeRider, total: s.total + r.total,
    ded: dedTypes.reduce((m, ty) => ({ ...m, [ty]: (m[ty] ?? 0) + (r.ded[ty] ?? 0) }), s.ded),
  }), { order: 0, fee: 0, total: 0, ded: {} as Record<string, number> });

  const { pageSize, setPageSize, page, setPage, totalPages, paged, from, to, total } = usePagination(rows, 20);

  if (loading) return <Loader2 className="w-4 h-4 animate-spin" />;

  return (
    <>
      <div className="flex justify-end items-center gap-3 mb-3">
        {rows.length > 0 && <PageSizeSelect pageSize={pageSize} setPageSize={setPageSize} />}
        <button onClick={exportCSV} disabled={!rows.length}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50">
          <Download className="w-4 h-4" /> Export CSV (Finance)
        </button>
      </div>
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-2 sticky left-0 bg-muted">Driver Name</th>
              <th className="text-right px-3">Order</th>
              <th className="text-right px-3">Fee Rider</th>
              <th className="text-right px-3">Active Date</th>
              {dedTypes.map((ty) => <th key={ty} className="text-right px-3">{ty}</th>)}
              <th className="text-right px-3">Total Fee Order</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={5 + dedTypes.length} className="p-6 text-center text-muted-foreground">Tidak ada data — pastikan payroll run ini sudah di-Generate.</td></tr> :
              paged.map((r) => (
                <tr key={r.rider_id} className="border-t border-border">
                  <td className="p-2 sticky left-0 bg-background">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.employeeId}</div>
                  </td>
                  <td className="text-right px-3 tabular-nums">{r.orderCount}</td>
                  <td className="text-right px-3 tabular-nums">Rp{r.feeRider.toLocaleString("id-ID")}</td>
                  <td className="text-right px-3 tabular-nums">{r.activeDates}</td>
                  {dedTypes.map((ty) => (
                    <td key={ty} className="text-right px-3 tabular-nums text-destructive">{r.ded[ty] ? `Rp${r.ded[ty].toLocaleString("id-ID")}` : "—"}</td>
                  ))}
                  <td className="text-right px-3 font-semibold tabular-nums">Rp{r.total.toLocaleString("id-ID")}</td>
                </tr>
              ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-muted font-semibold">
              <tr>
                <td className="p-2 sticky left-0 bg-muted">GRAND TOTAL</td>
                <td className="text-right px-3 tabular-nums">{t.order}</td>
                <td className="text-right px-3 tabular-nums">Rp{t.fee.toLocaleString("id-ID")}</td>
                <td className="text-right px-3">—</td>
                {dedTypes.map((ty) => <td key={ty} className="text-right px-3 tabular-nums">Rp{(t.ded[ty] ?? 0).toLocaleString("id-ID")}</td>)}
                <td className="text-right px-3 tabular-nums">Rp{t.total.toLocaleString("id-ID")}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {rows.length > 0 && <PaginationBar page={page} totalPages={totalPages} setPage={setPage} from={from} to={to} total={total} />}
      <p className="text-xs text-muted-foreground mt-2">
        Kolom potongan (Sewa Molis, Admin Fee, dll) muncul otomatis dari jenis potongan yang kepakai. "Remarks" kosong di sini — diisi manual di sheet finance setelah export. Total GRAND TOTAL di atas tetap menghitung SEMUA rider, bukan cuma yang tampil di halaman ini.
      </p>
    </>
  );
}

// ============ MODE 2: Ringkasan per Client (lama) ============
type ClientRow = {
  client_id: string | null; client_name: string;
  rider_count: number; delivery_count: number;
  delivery_fee: number; attendance_fee: number; incentive: number;
  penalty: number; gross: number; deduction: number; net: number;
};

function ClientReport({ runId, run }: { runId: string; run?: Run }) {
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!runId) return;
    (async () => {
      setLoading(true);
      const [{ data: details, error }, { data: clients }] = await Promise.all([
        supabase.from("payroll_details").select("*").eq("run_id", runId),
        supabase.from("clients").select("id, name"),
      ]);
      if (error) { toast.error(error.message); setLoading(false); return; }
      const byClient = new Map<string, ClientRow>();
      for (const d of details ?? []) {
        const cid = d.client_id ?? "_";
        const name = clients?.find((c) => c.id === d.client_id)?.name ?? "Tanpa Client";
        const acc = byClient.get(cid) ?? {
          client_id: d.client_id, client_name: name,
          rider_count: 0, delivery_count: 0, delivery_fee: 0, attendance_fee: 0,
          incentive: 0, penalty: 0, gross: 0, deduction: 0, net: 0,
        };
        acc.rider_count += 1;
        acc.delivery_count += d.delivery_count;
        acc.delivery_fee += Number(d.delivery_fee);
        acc.attendance_fee += Number(d.attendance_fee);
        acc.incentive += Number(d.incentive);
        acc.penalty += Number(d.penalty);
        acc.gross += Number(d.gross_earning);
        acc.deduction += Number(d.total_deduction);
        acc.net += Number(d.net_pay);
        byClient.set(cid, acc);
      }
      setRows([...byClient.values()].sort((a, b) => b.net - a.net));
      setLoading(false);
    })();
  }, [runId]);

  const exportCSV = () => {
    const header = ["Client", "Rider", "Delivery Count", "Delivery Fee", "Attendance Fee", "Incentive", "Penalty", "Gross", "Deduction", "Net"];
    const data = rows.map((r) => [r.client_name, r.rider_count, r.delivery_count, r.delivery_fee, r.attendance_fee, r.incentive, r.penalty, r.gross, r.deduction, r.net]);
    downloadCSV(`report-${run?.name ?? runId}.csv`, toCSV([header, ...data]));
  };

  const totals = rows.reduce((s, r) => ({
    rider: s.rider + r.rider_count, deliv: s.deliv + r.delivery_count,
    gross: s.gross + r.gross, ded: s.ded + r.deduction, net: s.net + r.net,
  }), { rider: 0, deliv: 0, gross: 0, ded: 0, net: 0 });

  const { pageSize, setPageSize, page, setPage, totalPages, paged, from, to, total } = usePagination(rows, 20);

  if (loading) return <Loader2 className="w-4 h-4 animate-spin" />;

  return (
    <>
      <div className="flex justify-end items-center gap-3 mb-3">
        {rows.length > 0 && <PageSizeSelect pageSize={pageSize} setPageSize={setPageSize} />}
        <button onClick={exportCSV} disabled={!rows.length}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr><th className="p-2">Client</th><th>Rider</th><th>Deliv</th><th>Fee Deliv</th><th>Fee Absensi</th><th>Insentif</th><th>Penalty</th><th>Gross</th><th>Deduction</th><th>Net</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Tidak ada data</td></tr> :
              paged.map((r) => (
                <tr key={r.client_id ?? "_"} className="border-t border-border">
                  <td className="p-2 font-medium">{r.client_name}</td>
                  <td>{r.rider_count}</td>
                  <td>{r.delivery_count}</td>
                  <td>Rp{r.delivery_fee.toLocaleString("id-ID")}</td>
                  <td>Rp{r.attendance_fee.toLocaleString("id-ID")}</td>
                  <td>Rp{r.incentive.toLocaleString("id-ID")}</td>
                  <td className="text-destructive">Rp{r.penalty.toLocaleString("id-ID")}</td>
                  <td>Rp{r.gross.toLocaleString("id-ID")}</td>
                  <td className="text-destructive">Rp{r.deduction.toLocaleString("id-ID")}</td>
                  <td className="font-semibold">Rp{r.net.toLocaleString("id-ID")}</td>
                </tr>
              ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-muted font-semibold">
              <tr><td className="p-2">TOTAL</td><td>{totals.rider}</td><td>{totals.deliv}</td><td colSpan={4}></td><td>Rp{totals.gross.toLocaleString("id-ID")}</td><td>Rp{totals.ded.toLocaleString("id-ID")}</td><td>Rp{totals.net.toLocaleString("id-ID")}</td></tr>
            </tfoot>
          )}
        </table>
      </div>
      {rows.length > 0 && <PaginationBar page={page} totalPages={totalPages} setPage={setPage} from={from} to={to} total={total} />}
    </>
  );
}
