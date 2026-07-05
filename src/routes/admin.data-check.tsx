import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/admin/data-check")({ component: DataCheckPage });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Client = { id: string; name: string };
type Row = {
  driver_code: string | null; delivery_date: string; status: string | null;
  delivery_type: string | null; client_id: string | null; dash_delivery_id: string | null;
  provider_order_id: string | null; distance_km: number | null; weight_kg: number | null;
  riders?: { full_name: string | null } | null;
};

function DataCheckPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [q, setQ] = useState(""); // cari kode/nama rider
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  useEffect(() => {
    supabase.from("clients").select("id, name").order("name").then(({ data }) => setClients(data ?? []));
  }, []);

  const run = async () => {
    setLoading(true); setRan(true);
    try {
      // paginasi (batas 1000/req)
      const pageSize = 1000; let start = 0; const all: Row[] = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let query = sb.from("delivery_records")
          .select("driver_code, delivery_date, status, delivery_type, client_id, dash_delivery_id, provider_order_id, distance_km, weight_kg, riders(full_name)")
          .order("delivery_date", { ascending: true })
          .range(start, start + pageSize - 1);
        if (clientId) query = query.eq("client_id", clientId);
        if (from) query = query.gte("delivery_date", from);
        if (to) query = query.lte("delivery_date", to);
        if (q.trim()) query = query.ilike("driver_code", `%${q.trim()}%`);
        const { data, error } = await query;
        if (error) throw error;
        all.push(...((data ?? []) as Row[]));
        if (!data || data.length < pageSize) break;
        start += pageSize;
      }
      setRows(all);
      if (all.length === 0) toast.message("Tidak ada baris cocok di database untuk filter ini.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const clientName = (id: string | null) => (id ? clients.find((c) => c.id === id)?.name ?? "(client tak dikenal)" : "(client KOSONG)");
  const completed = rows.filter((r) => String(r.status ?? "").trim().toLowerCase() === "completed").length;

  return (
    <AdminLayout title="Cek Data" subtitle="Lihat data pengiriman yang BENERAN tersimpan di database (mentah, apa adanya).">
      <div className="rounded-lg border border-border bg-card p-5 mb-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-muted-foreground">Client <span className="font-normal">(opsional)</span></label>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2">
            <option value="">— semua client —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-muted-foreground">Kode Rider <span className="font-normal">(opsional, mis. MTR0006460)</span></label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ketik sebagian kode rider…"
            className="w-full rounded-md border border-border bg-background px-3 py-2" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-muted-foreground">Dari Tanggal <span className="font-normal">(opsional)</span></label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-muted-foreground">Sampai Tanggal <span className="font-normal">(opsional)</span></label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2" />
        </div>
        <div className="md:col-span-2">
          <button onClick={run} disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} {loading ? "Mencari…" : "Cari di Database"}
          </button>
        </div>
      </div>

      {ran && !loading && (
        <p className="text-sm text-muted-foreground mb-3">
          Ketemu <b className="text-foreground">{rows.length}</b> baris tersimpan · <b className="text-foreground">{completed}</b> COMPLETED.
          {rows.length === 0 && " → berarti data ini MEMANG belum ada di database (bukan salah hitung)."}
        </p>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-muted text-left">
              <tr>
                <th className="p-2">Kode Rider</th><th className="px-3">Nama</th><th className="px-3">Tgl Delivery</th>
                <th className="px-3">Status</th><th className="px-3">Delivery Type</th><th className="px-3">Client</th>
                <th className="px-3">Dash ID</th><th className="px-3 text-right">Jarak</th><th className="px-3 text-right">Berat</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 500).map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-2 font-mono text-xs">{r.driver_code ?? "—"}</td>
                  <td className="px-3">{r.riders?.full_name ?? "—"}</td>
                  <td className="px-3 tabular-nums">{r.delivery_date}</td>
                  <td className="px-3">{r.status ?? "—"}</td>
                  <td className="px-3">{r.delivery_type ?? "—"}</td>
                  <td className={"px-3 " + (r.client_id ? "" : "text-destructive font-medium")}>{clientName(r.client_id)}</td>
                  <td className="px-3 font-mono text-xs">{r.dash_delivery_id ?? "—"}</td>
                  <td className="px-3 text-right tabular-nums">{r.distance_km ?? "—"}</td>
                  <td className="px-3 text-right tabular-nums">{r.weight_kg ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 500 && <p className="text-xs text-muted-foreground p-2">Nampilin 500 baris pertama dari {rows.length}.</p>}
        </div>
      )}
    </AdminLayout>
  );
}
