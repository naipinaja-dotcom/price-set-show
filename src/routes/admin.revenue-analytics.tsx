import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { fetchAllRows } from "@/lib/fetch-all";
import { listPricingSchemes } from "@/lib/pricing-store";
import type { PricingScheme } from "@/lib/pricing-types";
import type { DeliveryRow } from "@/lib/pricing-calc";
import { computePnl, buildTrend, type ClientPnl, type ClientLite, type TrendGranularity } from "@/lib/pnl-engine";
import { formatRupiah } from "@/lib/format";
import { toast } from "sonner";
import { Loader2, Play, Banknote } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/admin/revenue-analytics")({ component: RevenueAnalyticsPage });

const firstOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);
const jt = (n: number) => "Rp " + (n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt";

function RevenueAnalyticsPage() {
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [schemes, setSchemes] = useState<PricingScheme[]>([]);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [granularity, setGranularity] = useState<TrendGranularity>("daily");
  const [running, setRunning] = useState(false);
  const [perClient, setPerClient] = useState<ClientPnl[] | null>(null);

  useEffect(() => {
    supabase.from("clients").select("id, name").order("name").then(({ data }) => setClients(data ?? []));
    listPricingSchemes().then(setSchemes);
  }, []);

  const run = async () => {
    if (from > to) return toast.error("Tanggal 'dari' tidak boleh setelah 'sampai'");
    setRunning(true);
    setPerClient(null);
    try {
      const data = await fetchAllRows<DeliveryRow & { client_id: string | null }>((c, f, t) =>
        c.from("delivery_records")
          .select("client_id, rider_id, driver_code, delivery_date, district, distance_km, weight_kg, destination_address, service_type, status, delivery_type")
          .gte("delivery_date", from).lte("delivery_date", to).range(f, t)
      );
      const { perClient: pc } = computePnl(data, schemes, clients);
      setPerClient(pc);
      if (pc.length === 0) toast.message("Tidak ada data pengiriman di rentang ini.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const withRevenue = (perClient ?? []).filter((r) => r.revenue !== null);
  const withoutRevenue = (perClient ?? []).filter((r) => r.revenue === null);
  const totRevenue = withRevenue.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const avgRevenue = withRevenue.length > 0 ? totRevenue / withRevenue.length : 0;
  const topClient = withRevenue.slice().sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))[0];
  const trend = perClient ? buildTrend(perClient, granularity) : [];
  const ranked = withRevenue.slice().sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
  const maxRevenue = Math.max(1, ...ranked.map((r) => r.revenue ?? 0));

  return (
    <AdminLayout title="Revenue Analytics" subtitle="Tagihan ke client (sisi revenue) dari skema pricing client, dihitung langsung dari data pengiriman.">
      <div className="rounded-lg border border-border bg-card p-5 mb-4 flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-muted-foreground">Dari Tanggal</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-muted-foreground">Sampai Tanggal</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-muted-foreground">Granularitas Tren</label>
          <div className="flex rounded-md border border-border overflow-hidden">
            {(["daily", "weekly", "monthly"] as TrendGranularity[]).map((g) => (
              <button key={g} onClick={() => setGranularity(g)}
                className={"px-3 py-2 text-sm " + (granularity === g ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                {g === "daily" ? "Harian" : g === "weekly" ? "Mingguan" : "Bulanan"}
              </button>
            ))}
          </div>
        </div>
        <button onClick={run} disabled={running}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 font-medium disabled:opacity-50">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? "Menghitung…" : "Hitung"}
        </button>
      </div>

      {perClient && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Kpi label="Total Revenue" value={jt(totRevenue)} accent="success" />
            <Kpi label="Rata-rata / Client" value={jt(avgRevenue)} />
            <Kpi label="Top Client" value={topClient ? topClient.client : "—"} />
            <Kpi label="Client Tanpa Skema Revenue" value={String(withoutRevenue.length)} />
          </div>

          <div className="rounded-lg border border-border bg-card p-5 mb-4">
            <h3 className="text-sm font-semibold mb-3">Tren Revenue</h3>
            {trend.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Tidak ada data untuk digambar trennya.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => jt(v)} width={70} />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number) => formatRupiah(value)}
                  />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr><th className="p-3">Client</th><th className="p-3 text-right">Revenue</th><th className="p-3 w-[200px]">Share</th></tr>
                </thead>
                <tbody>
                  {ranked.length === 0 ? (
                    <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">Belum ada client dengan skema revenue.</td></tr>
                  ) : ranked.map((r) => (
                    <tr key={r.clientId} className="border-t border-border">
                      <td className="p-3 font-medium">{r.client}</td>
                      <td className="p-3 text-right">{formatRupiah(r.revenue ?? 0)}</td>
                      <td className="p-3">
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: Math.max(2, ((r.revenue ?? 0) / maxRevenue) * 100) + "%" }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!perClient && !running && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          <Banknote className="w-8 h-8 mx-auto mb-2 opacity-50" />
          Pilih periode lalu klik <b className="mx-1">Hitung</b> untuk lihat analitik revenue.
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
