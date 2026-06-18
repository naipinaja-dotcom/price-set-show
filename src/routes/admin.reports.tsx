import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { toCSV, downloadCSV } from "@/lib/csv";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/reports")({ component: ReportsPage });

type Run = { id: string; name: string; period_start: string; period_end: string; status: string };
type Row = {
  client_id: string | null; client_name: string;
  rider_count: number; delivery_count: number;
  delivery_fee: number; attendance_fee: number; incentive: number;
  penalty: number; gross: number; deduction: number; net: number;
};

function ReportsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [runId, setRunId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("payroll_runs").select("id, name, period_start, period_end, status")
      .order("created_at", { ascending: false }).then(({ data }) => {
        setRuns(data ?? []); if (data?.length) setRunId(data[0].id);
      });
  }, []);

  useEffect(() => {
    if (!runId) return;
    (async () => {
      setLoading(true);
      const [{ data: details, error }, { data: clients }] = await Promise.all([
        supabase.from("payroll_details").select("*").eq("run_id", runId),
        supabase.from("clients").select("id, name"),
      ]);
      if (error) { toast.error(error.message); setLoading(false); return; }
      const byClient = new Map<string, Row>();
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
    const run = runs.find((r) => r.id === runId);
    const header = ["Client", "Rider", "Delivery Count", "Delivery Fee", "Attendance Fee", "Incentive", "Penalty", "Gross", "Deduction", "Net"];
    const data = rows.map((r) => [r.client_name, r.rider_count, r.delivery_count, r.delivery_fee, r.attendance_fee, r.incentive, r.penalty, r.gross, r.deduction, r.net]);
    downloadCSV(`report-${run?.name ?? runId}.csv`, toCSV([header, ...data]));
  };

  const totals = rows.reduce((s, r) => ({
    rider: s.rider + r.rider_count, deliv: s.deliv + r.delivery_count,
    gross: s.gross + r.gross, ded: s.ded + r.deduction, net: s.net + r.net,
  }), { rider: 0, deliv: 0, gross: 0, ded: 0, net: 0 });

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
        <button onClick={exportCSV} disabled={!rows.length}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> :
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr><th className="p-2">Client</th><th>Rider</th><th>Deliv</th><th>Fee Deliv</th><th>Fee Absensi</th><th>Insentif</th><th>Penalty</th><th>Gross</th><th>Deduction</th><th>Net</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Tidak ada data</td></tr> :
                rows.map((r) => (
                  <tr key={r.client_id ?? "_"} className="border-t border-border">
                    <td className="p-2 font-medium">{r.client_name}</td>
                    <td>{r.rider_count}</td>
                    <td>{r.delivery_count}</td>
                    <td>Rp{r.delivery_fee.toLocaleString("id-ID")}</td>
                    <td>Rp{r.attendance_fee.toLocaleString("id-ID")}</td>
                    <td>Rp{r.incentive.toLocaleString("id-ID")}</td>
                    <td className="text-red-600">Rp{r.penalty.toLocaleString("id-ID")}</td>
                    <td>Rp{r.gross.toLocaleString("id-ID")}</td>
                    <td className="text-red-600">Rp{r.deduction.toLocaleString("id-ID")}</td>
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
        </div>}
    </AdminLayout>
  );
}
