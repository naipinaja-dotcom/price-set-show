import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { fetchAllRows } from "@/lib/fetch-all";
import { listPricingSchemes } from "@/lib/pricing-store";
import type { PricingScheme } from "@/lib/pricing-types";
import type { DeliveryRow } from "@/lib/pricing-calc";
import { computePnl, buildTrend, type ClientPnl, type ClientLite } from "@/lib/pnl-engine";
import { useIntelligenceDate } from "@/lib/use-intelligence-date";
import { toast } from "sonner";
import { Percent, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";

export const Route = createFileRoute("/admin/bcr-analytics")({ component: BcrAnalyticsPage });

// Kategori sama seperti Margin Analytics (admin.pnl.tsx) & Executive Dashboard —
// biar konsisten: rugi <0%, tipis 0-15%, sehat >=15%.
function bucketOf(marginPct: number | null): "rugi" | "tipis" | "sehat" | "no_rev" {
  if (marginPct === null) return "no_rev";
  if (marginPct < 0) return "rugi";
  if (marginPct < 15) return "tipis";
  return "sehat";
}

function BcrAnalyticsPage() {
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [schemes, setSchemes] = useState<PricingScheme[]>([]);
  const { from, to } = useIntelligenceDate();
  const [running, setRunning] = useState(false);
  const [perClient, setPerClient] = useState<ClientPnl[] | null>(null);

  // Ga ada filter sendiri di sini — tanggal acuan diatur dari Executive
  // Dashboard, halaman ini otomatis hitung begitu client/skema selesai dimuat.
  useEffect(() => {
    (async () => {
      const [{ data: clientsData }, schemesData] = await Promise.all([
        supabase.from("clients").select("id, name").order("name"),
        listPricingSchemes(),
      ]);
      setClients(clientsData ?? []);
      setSchemes(schemesData);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (clients.length > 0) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, schemes]);

  const run = async () => {
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
  const rugi = withRevenue.filter((r) => bucketOf(r.marginPct) === "rugi");
  const tipis = withRevenue.filter((r) => bucketOf(r.marginPct) === "tipis");
  const sehat = withRevenue.filter((r) => bucketOf(r.marginPct) === "sehat");
  const avgBcr = withRevenue.length > 0 ? withRevenue.reduce((s, r) => s + (r.marginPct ?? 0), 0) / withRevenue.length : 0;
  const trend = perClient ? buildTrend(perClient, "daily") : [];
  // urut dari yang paling parah — biar yang butuh perhatian keliatan duluan
  const ranked = withRevenue.slice().sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0));

  return (
    <AdminLayout title="BCR Analytics" subtitle={`Bill-Cost-Ratio (margin %) per client. Periode ${from} → ${to} (atur di Executive Dashboard).`}>
      {perClient && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Kpi label="Rata-rata BCR" value={avgBcr.toFixed(1) + "%"} accent={avgBcr < 0 ? "destructive" : avgBcr < 15 ? "warning" : "success"} />
            <Kpi label="Client Rugi" value={String(rugi.length)} accent="destructive" />
            <Kpi label="Client Margin Tipis" value={String(tipis.length)} accent="warning" />
            <Kpi label="Client Sehat" value={String(sehat.length)} accent="success" />
          </div>

          <div className="rounded-lg border border-border bg-card p-5 mb-4">
            <h3 className="text-sm font-semibold mb-3">Tren BCR (Margin %)</h3>
            {trend.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Tidak ada data untuk digambar trennya.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => v + "%"} width={45} />
                  <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="3 3" />
                  <ReferenceLine y={15} stroke="var(--warning)" strokeDasharray="3 3" />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number) => value.toFixed(1) + "%"}
                  />
                  <Line type="monotone" dataKey="marginPct" name="BCR" stroke="var(--success)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
            <p className="text-[11px] text-muted-foreground mt-2">Garis putus-putus merah = 0% (batas rugi), kuning = 15% (batas margin tipis).</p>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr><th className="p-3">Client</th><th className="p-3 text-right">Margin</th><th className="p-3 w-[160px]">BCR (Margin %)</th></tr>
                </thead>
                <tbody>
                  {ranked.length === 0 ? (
                    <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">Belum ada client dengan skema revenue.</td></tr>
                  ) : ranked.map((r) => {
                    const b = bucketOf(r.marginPct);
                    const color = b === "rugi" ? "text-destructive" : b === "tipis" ? "text-warning" : "text-success";
                    const bar = b === "rugi" ? "bg-destructive" : b === "tipis" ? "bg-warning" : "bg-success";
                    return (
                      <tr key={r.clientId} className={"border-t border-border " + (b === "rugi" ? "bg-destructive/5" : b === "tipis" ? "bg-warning/5" : "")}>
                        <td className="p-3 font-medium">{r.client}{b === "rugi" ? " 🔴" : b === "tipis" ? " ⚠️" : ""}</td>
                        <td className={"p-3 text-right font-medium " + color}>{(r.margin ?? 0).toLocaleString("id-ID")}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div className={"h-full " + bar} style={{ width: Math.max(2, Math.min(100, Math.abs(r.marginPct ?? 0))) + "%" }} />
                            </div>
                            <span className={"text-xs " + color}>{(r.marginPct ?? 0).toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex items-start gap-2 mt-3 text-xs text-muted-foreground">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-warning" />
            <span>Diurutkan dari BCR paling rendah — client yang perlu perhatian ada di atas.</span>
          </div>
        </>
      )}

      {!perClient && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          <Percent className="w-8 h-8 mx-auto mb-2 opacity-50" />
          {running ? "Menghitung analitik BCR…" : "Memuat…"}
        </div>
      )}
    </AdminLayout>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: "success" | "warning" | "destructive" }) {
  const cls = accent === "success" ? "border-success/30 bg-success/5 text-success"
    : accent === "warning" ? "border-warning/30 bg-warning/5 text-warning"
    : accent === "destructive" ? "border-destructive/30 bg-destructive/5 text-destructive"
    : "border-border bg-card";
  return (
    <div className={"rounded-xl border p-4 " + cls}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
