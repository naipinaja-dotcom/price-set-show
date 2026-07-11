import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { listPricingSchemes } from "@/lib/pricing-store";
import type { PricingScheme } from "@/lib/pricing-types";
import type { DeliveryRow } from "@/lib/pricing-calc";
import { computePnl, type ClientPnl } from "@/lib/pnl-engine";
import { formatRupiah } from "@/lib/format";
import { toast } from "sonner";
import { Loader2, Play, TrendingUp, AlertTriangle, LayoutDashboard } from "lucide-react";

export const Route = createFileRoute("/admin/pnl")({ component: PnlPage });

type ClientLite = { id: string; name: string };
type PnlRow = ClientPnl;

const firstOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);
const jt = (n: number) => "Rp " + (n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt";

function PnlPage() {
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [schemes, setSchemes] = useState<PricingScheme[]>([]);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<PnlRow[] | null>(null);

  useEffect(() => {
    supabase.from("clients").select("id, name").order("name").then(({ data }) => setClients(data ?? []));
    listPricingSchemes().then(setSchemes);
  }, []);

  const run = async () => {
    if (from > to) return toast.error("Tanggal 'dari' tidak boleh setelah 'sampai'");
    setRunning(true);
    setRows(null);
    try {
      const { data, error } = await supabase
        .from("delivery_records")
        .select("client_id, rider_id, driver_code, delivery_date, district, distance_km, weight_kg, destination_address, service_type, status, delivery_type")
        .gte("delivery_date", from).lte("delivery_date", to);
      if (error) throw error;

      const all = (data ?? []) as unknown as (DeliveryRow & { client_id: string | null })[];
      const { perClient } = computePnl(all, schemes, clients);
      setRows(perClient);
      if (perClient.length === 0) toast.message("Tidak ada data pengiriman di rentang ini.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const totRevenue = (rows ?? []).reduce((s, r) => s + (r.revenue ?? 0), 0);
  const totCost = (rows ?? []).reduce((s, r) => s + r.cost, 0);
  const totMargin = totRevenue - totCost;
  const totPct = totRevenue > 0 ? (totMargin / totRevenue) * 100 : 0;
  const maxMargin = Math.max(1, ...(rows ?? []).map((r) => Math.abs(r.margin ?? 0)));

  return (
    <AdminLayout title="Margin Analytics" subtitle="Revenue (tagihan client) − Cost (bayar rider) = Margin, per client. Dihitung langsung dari data pengiriman.">
      <Link to="/admin/pnl-dashboard" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-4">
        <LayoutDashboard className="w-4 h-4" /> Lihat Executive Dashboard (ringkasan + tren)
      </Link>
      {/* Kontrol */}
      <div className="rounded-lg border border-border bg-card p-5 mb-4 flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-muted-foreground">Dari Tanggal</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-muted-foreground">Sampai Tanggal</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2" />
        </div>
        <button onClick={run} disabled={running}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 font-medium disabled:opacity-50">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? "Menghitung…" : "Hitung PnL"}
        </button>
      </div>

      {rows && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Kpi label="Revenue" value={jt(totRevenue)} />
            <Kpi label="Cost" value={jt(totCost)} />
            <Kpi label="Gross Margin" value={jt(totMargin)} accent="success" />
            <Kpi label="Margin %" value={totPct.toFixed(1) + "%"} accent="success" />
          </div>

          {/* Tabel per client */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3">Client</th>
                    <th className="p-3 text-right">Revenue</th>
                    <th className="p-3 text-right">Cost</th>
                    <th className="p-3 text-right">Margin</th>
                    <th className="p-3 w-[180px]">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Tidak ada data.</td></tr>
                  ) : rows.map((r) => {
                    const loss = r.marginPct !== null && r.marginPct < 0;
                    const thin = r.marginPct !== null && r.marginPct >= 0 && r.marginPct < 15;
                    const noRev = r.revenue === null;
                    const color = loss ? "text-destructive" : thin ? "text-warning" : "text-success";
                    return (
                      <tr key={r.clientId} className={"border-t border-border " + (noRev ? "" : loss ? "bg-destructive/5" : thin ? "bg-warning/5" : "")}>
                        <td className="p-3 font-medium">{r.client}{!noRev && loss ? " 🔴 RUGI" : !noRev && thin ? " ⚠️" : ""}</td>
                        <td className="p-3 text-right">{noRev ? <span className="text-muted-foreground">— belum ada skema client</span> : formatRupiah(r.revenue!)}</td>
                        <td className="p-3 text-right text-muted-foreground">{formatRupiah(r.cost)}</td>
                        <td className={"p-3 text-right font-medium " + (noRev ? "" : color)}>
                          {noRev ? "—" : formatRupiah(r.margin!)}
                        </td>
                        <td className="p-3">
                          {noRev ? "—" : (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                <div className={"h-full " + (loss ? "bg-destructive" : thin ? "bg-warning" : "bg-success")}
                                  style={{ width: Math.max(3, Math.min(100, (Math.abs(r.margin ?? 0) / maxMargin) * 100)) + "%" }} />
                              </div>
                              <span className={"text-xs " + color}>{r.marginPct!.toFixed(1)}%</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted font-medium">
                      <td className="p-3">TOTAL</td>
                      <td className="p-3 text-right">{formatRupiah(totRevenue)}</td>
                      <td className="p-3 text-right">{formatRupiah(totCost)}</td>
                      <td className="p-3 text-right text-success">{formatRupiah(totMargin)}</td>
                      <td className="p-3">{totPct.toFixed(1)}%</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="flex items-start gap-2 mt-3 text-xs text-muted-foreground">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-warning" />
            <span>Baris kuning = margin tipis (0–15%). Baris merah = 🔴 RUGI (cost lebih besar dari revenue). "Belum ada skema client" = revenue-nya belum bisa dihitung karena client itu belum punya skema pricing sisi client. Angka Revenue/Cost dihitung live dari skema + data pengiriman (belum termasuk PPN).</span>
          </div>
        </>
      )}

      {!rows && !running && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
          Pilih periode lalu klik <b className="mx-1">Hitung PnL</b> untuk lihat margin per client.
        </div>
      )}
    </AdminLayout>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: "success" }) {
  return (
    <div className={"rounded-xl border p-4 " + (accent === "success" ? "border-success/30 bg-success/5" : "border-border bg-card")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"text-lg font-semibold mt-1 " + (accent === "success" ? "text-success" : "")}>{value}</div>
    </div>
  );
}
