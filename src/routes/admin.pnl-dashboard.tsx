import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { listPricingSchemes } from "@/lib/pricing-store";
import type { PricingScheme } from "@/lib/pricing-types";
import type { DeliveryRow } from "@/lib/pricing-calc";
import { computePnl, buildTrend, type ClientPnl, type TrendGranularity } from "@/lib/pnl-engine";
import { formatRupiah } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { triggerWeeklyPnlPushManual } from "@/lib/api/pnl-push.functions";
import { toast } from "sonner";
import { Loader2, Play, TrendingUp, ArrowRight, AlertTriangle, Send, CheckCircle2, XCircle } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Line, ComposedChart } from "recharts";

export const Route = createFileRoute("/admin/pnl-dashboard")({ component: ExecutiveDashboard });

type ClientLite = { id: string; name: string };

const firstOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);
const jt = (n: number) => "Rp " + (n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt";

type PnlSnapshot = {
  id: string;
  week_start: string;
  week_end: string;
  total_revenue: number;
  total_cost: number;
  total_margin: number;
  total_margin_pct: number;
  push_status: { slack?: { ok: boolean; error?: string }; email?: { ok: boolean; error?: string } };
  triggered_by: string;
  created_at: string;
};

function ExecutiveDashboard() {
  const { session } = useAuth();
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [schemes, setSchemes] = useState<PricingScheme[]>([]);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [granularity, setGranularity] = useState<TrendGranularity>("daily");
  const [running, setRunning] = useState(false);
  const [perClient, setPerClient] = useState<ClientPnl[] | null>(null);
  const [snapshots, setSnapshots] = useState<PnlSnapshot[]>([]);
  const [pushing, setPushing] = useState(false);

  const loadSnapshots = () => {
    (supabase as any)
      .from("pnl_weekly_snapshots")
      .select("id, week_start, week_end, total_revenue, total_cost, total_margin, total_margin_pct, push_status, triggered_by, created_at")
      .order("week_start", { ascending: false })
      .limit(10)
      .then(({ data }: { data: PnlSnapshot[] | null }) => setSnapshots(data ?? []));
  };

  useEffect(() => {
    supabase.from("clients").select("id, name").order("name").then(({ data }) => setClients(data ?? []));
    listPricingSchemes().then(setSchemes);
    loadSnapshots();
  }, []);

  const testWeeklyPush = async () => {
    if (!session?.access_token) return toast.error("Sesi admin habis — login ulang");
    setPushing(true);
    try {
      const result = await triggerWeeklyPnlPushManual({ data: { adminToken: session.access_token } });
      const slackOk = result.pushStatus.slack.ok;
      const emailOk = result.pushStatus.email.ok;
      if (slackOk && emailOk) toast.success("Weekly PNL berhasil dikirim ke Slack & Email");
      else toast.warning(`Slack: ${slackOk ? "OK" : "gagal — " + result.pushStatus.slack.error}. Email: ${emailOk ? "OK" : "gagal — " + result.pushStatus.email.error}`);
      loadSnapshots();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPushing(false);
    }
  };

  const run = async () => {
    if (from > to) return toast.error("Tanggal 'dari' tidak boleh setelah 'sampai'");
    setRunning(true);
    setPerClient(null);
    try {
      const { data, error } = await supabase
        .from("delivery_records")
        .select("client_id, rider_id, driver_code, delivery_date, district, distance_km, weight_kg, destination_address, service_type, status, delivery_type")
        .gte("delivery_date", from).lte("delivery_date", to);
      if (error) throw error;

      const all = (data ?? []) as unknown as (DeliveryRow & { client_id: string | null })[];
      const { perClient: pc } = computePnl(all, schemes, clients);
      setPerClient(pc);
      if (pc.length === 0) toast.message("Tidak ada data pengiriman di rentang ini.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const totRevenue = (perClient ?? []).reduce((s, r) => s + (r.revenue ?? 0), 0);
  const totCost = (perClient ?? []).reduce((s, r) => s + r.cost, 0);
  const totMargin = totRevenue - totCost;
  const totPct = totRevenue > 0 ? (totMargin / totRevenue) * 100 : 0;
  const clientsWithRevenue = (perClient ?? []).filter((r) => r.revenue !== null);
  const rugiCount = clientsWithRevenue.filter((r) => (r.marginPct ?? 0) < 0).length;
  const thinCount = clientsWithRevenue.filter((r) => (r.marginPct ?? 100) >= 0 && (r.marginPct ?? 100) < 15).length;
  const trend = perClient ? buildTrend(perClient, granularity) : [];
  const topByMargin = clientsWithRevenue.slice().sort((a, b) => (b.margin ?? 0) - (a.margin ?? 0)).slice(0, 5);
  const missingRevenue = (perClient ?? []).filter((r) => r.revenue === null);
  const maxTopMargin = Math.max(1, ...topByMargin.map((r) => Math.abs(r.margin ?? 0)));

  return (
    <AdminLayout title="Executive Dashboard" subtitle="Ringkasan bisnis: Revenue, Cost, Margin, dan tren BCR lintas periode.">
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

      {/* Weekly PNL Push — histori & tombol tes manual. Cron mingguan yang
          beneran jalan lewat /api/pnl-weekly-push, lihat migration pg_cron. */}
      <div className="rounded-lg border border-border bg-card p-5 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold">Weekly PNL Push</h3>
            <p className="text-xs text-muted-foreground">Dikirim otomatis tiap minggu ke Slack &amp; Email (butuh cron aktif — lihat setup di Supabase).</p>
          </div>
          <button onClick={testWeeklyPush} disabled={pushing}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50">
            {pushing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {pushing ? "Mengirim…" : "Test Kirim Sekarang"}
          </button>
        </div>
        {snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada histori push.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-2">Periode</th>
                  <th className="p-2 text-right">Margin</th>
                  <th className="p-2">Slack</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Trigger</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="p-2">{s.week_start} → {s.week_end}</td>
                    <td className="p-2 text-right">{formatRupiah(s.total_margin)} ({s.total_margin_pct.toFixed(1)}%)</td>
                    <td className="p-2">
                      {s.push_status?.slack?.ok
                        ? <CheckCircle2 className="w-4 h-4 text-success" />
                        : <span title={s.push_status?.slack?.error}><XCircle className="w-4 h-4 text-destructive" /></span>}
                    </td>
                    <td className="p-2">
                      {s.push_status?.email?.ok
                        ? <CheckCircle2 className="w-4 h-4 text-success" />
                        : <span title={s.push_status?.email?.error}><XCircle className="w-4 h-4 text-destructive" /></span>}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground capitalize">{s.triggered_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {perClient && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Kpi label="Revenue" value={jt(totRevenue)} />
            <Kpi label="Cost" value={jt(totCost)} />
            <Kpi label="Gross Margin" value={jt(totMargin)} accent="success" />
            <Kpi label="Margin %" value={totPct.toFixed(1) + "%"} accent="success" />
          </div>

          {(rugiCount > 0 || thinCount > 0) && (
            <div className="flex items-start gap-2 mb-4 text-sm rounded-lg border border-warning/30 bg-warning/5 p-3 text-warning">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                {rugiCount > 0 && <b>{rugiCount} client RUGI</b>}{rugiCount > 0 && thinCount > 0 && ", "}
                {thinCount > 0 && <b>{thinCount} client margin tipis (&lt;15%)</b>}. Lihat rincian di{" "}
                <Link to="/admin/pnl" className="underline">Margin Analytics</Link>.
              </span>
            </div>
          )}

          {/* Tren BCR */}
          <div className="rounded-lg border border-border bg-card p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Tren Revenue vs Cost & BCR (Margin %)</h3>
            </div>
            {trend.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Tidak ada data untuk digambar trennya.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis yAxisId="rp" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickFormatter={(v) => jt(v)} width={70} />
                  <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickFormatter={(v) => v + "%"} width={45} />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number, name: string) => name === "BCR (Margin %)" ? [value.toFixed(1) + "%", name] : [formatRupiah(value), name]}
                  />
                  <Area yAxisId="rp" type="monotone" dataKey="revenue" name="Revenue" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.12} strokeWidth={2} />
                  <Area yAxisId="rp" type="monotone" dataKey="cost" name="Cost" stroke="var(--muted-foreground)" fill="var(--muted-foreground)" fillOpacity={0.08} strokeWidth={2} />
                  <Line yAxisId="pct" type="monotone" dataKey="marginPct" name="BCR (Margin %)" stroke="var(--success)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Top clients by margin */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-3">Top 5 Client berdasarkan Margin</h3>
              {topByMargin.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada client dengan skema revenue.</p>
              ) : (
                <div className="space-y-2.5">
                  {topByMargin.map((r) => {
                    const loss = (r.marginPct ?? 0) < 0;
                    return (
                      <div key={r.clientId} className="text-sm">
                        <div className="flex justify-between mb-1">
                          <span className="font-medium truncate">{r.client}</span>
                          <span className={loss ? "text-destructive" : "text-success"}>{formatRupiah(r.margin ?? 0)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={"h-full " + (loss ? "bg-destructive" : "bg-success")}
                            style={{ width: Math.max(3, Math.min(100, (Math.abs(r.margin ?? 0) / maxTopMargin) * 100)) + "%" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Belum ada skema revenue */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-3">Client Tanpa Skema Revenue</h3>
              {missingRevenue.length === 0 ? (
                <p className="text-sm text-muted-foreground">Semua client sudah punya skema revenue (client-side). ✅</p>
              ) : (
                <ul className="text-sm space-y-1.5">
                  {missingRevenue.map((r) => (
                    <li key={r.clientId} className="flex justify-between text-muted-foreground">
                      <span>{r.client}</span>
                      <span>Cost: {formatRupiah(r.cost)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <Link to="/admin/pnl" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-4">
            Lihat rincian per client di Margin Analytics <ArrowRight className="w-4 h-4" />
          </Link>
        </>
      )}

      {!perClient && !running && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
          Pilih periode lalu klik <b className="mx-1">Hitung</b> untuk lihat ringkasan bisnis.
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
