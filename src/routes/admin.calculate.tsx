import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { listPricingSchemes } from "@/lib/pricing-store";
import type { PricingScheme } from "@/lib/pricing-types";
import { PRICING_TYPES } from "@/lib/pricing-types";
import { calcScheme, type DeliveryRow, type CalcResult, calcAttendanceScheme, type AttendanceLogRow, type AttendanceCalcResult } from "@/lib/pricing-calc";
import { formatRupiah } from "@/lib/format";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { Loader2, Play, AlertTriangle, Info, Save } from "lucide-react";

export const Route = createFileRoute("/admin/calculate")({ component: CalculatePage });

type ClientLite = { id: string; name: string };

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

function CalculatePage() {
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [schemes, setSchemes] = useState<PricingScheme[]>([]);
  const [clientId, setClientId] = useState("");
  const [schemeId, setSchemeId] = useState("");
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [running, setRunning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [attResult, setAttResult] = useState<AttendanceCalcResult | null>(null);
  const [riderNames, setRiderNames] = useState<Record<string, string>>({});
  const [ranScheme, setRanScheme] = useState<PricingScheme | null>(null);

  useEffect(() => {
    supabase.from("clients").select("id, name").order("name").then(({ data }) => setClients(data ?? []));
    listPricingSchemes().then(setSchemes);
  }, []);

  // skema yang cocok untuk client terpilih (khusus client itu + yang "semua client")
  const matchingSchemes = useMemo(
    () => schemes.filter((s) => !clientId || s.client_id === clientId || s.client_id === null),
    [schemes, clientId],
  );
  const typeLabel = (t: string) => PRICING_TYPES.find((x) => x.key === t)?.name ?? t;

  const run = async () => {
    const scheme = schemes.find((s) => s.id === schemeId);
    if (!scheme) return toast.error("Pilih skema dulu");
    if (!scheme.params || scheme.params.version !== 1) {
      return toast.error("Skema ini versi lama — buka & simpan ulang di halaman Pricing dulu.");
    }
    if (from > to) return toast.error("Tanggal 'dari' tidak boleh setelah 'sampai'");

    setRunning(true);
    setResult(null);
    setAttResult(null);
    try {
      if (scheme.calc_type === "attendance") {
        let q = (supabase as any)
          .from("attendance_logs")
          .select("id, rider_id, driver_code, log_date, duration_minutes, is_late, is_absent, riders(full_name, employee_id)")
          .gte("log_date", from)
          .lte("log_date", to);
        if (clientId) q = q.eq("client_id", clientId);
        const { data, error } = await q;
        if (error) throw error;

        const rows = (data ?? []) as (AttendanceLogRow & { riders?: { full_name?: string; employee_id?: string } })[];
        if (rows.length === 0) toast.message("Tidak ada data absensi di rentang & client ini.");

        const names: Record<string, string> = {};
        for (const r of rows) {
          const key = r.rider_id || r.driver_code || "(tanpa rider)";
          if (!names[key]) names[key] = r.riders?.full_name || r.driver_code || key;
        }
        setRiderNames(names);

        const res = calcAttendanceScheme(scheme.params, rows);
        setAttResult(res);
        setRanScheme(scheme);
      } else {
        let q = supabase
          .from("delivery_records")
          .select("id, rider_id, driver_code, delivery_date, awb, district, distance_km, weight_kg, destination_address, service_type, status, delivery_type, riders(full_name, employee_id)")
          .gte("delivery_date", from)
          .lte("delivery_date", to);
        if (clientId) q = q.eq("client_id", clientId);
        const { data, error } = await q;
        if (error) throw error;

        const rows = (data ?? []) as unknown as (DeliveryRow & { riders?: { full_name?: string; employee_id?: string } })[];
        if (rows.length === 0) {
          toast.message("Tidak ada data pengiriman di rentang & client ini.");
        }

        // map nama rider untuk tampilan
        const names: Record<string, string> = {};
        for (const r of rows) {
          const key = r.rider_id || r.driver_code || "(tanpa rider)";
          if (!names[key]) names[key] = r.riders?.full_name || r.driver_code || key;
        }
        setRiderNames(names);

        const res = calcScheme(scheme.params, rows);
        setResult(res);
        setRanScheme(scheme);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const commit = async () => {
    if (!ranScheme || ranScheme.scheme_for !== "rider") return;
    const isAttendance = ranScheme.calc_type === "attendance";
    const rows = isAttendance ? (attResult?.perRow.filter((r) => r.id) ?? []) : (result?.perRow.filter((r) => r.id) ?? []);
    if (rows.length === 0) return toast.error("Tidak ada baris untuk disimpan.");
    const table = isAttendance ? "attendance_logs" : "delivery_records";
    if (!(await confirmDialog({ title: "Simpan hasil fee?", description: `Fee akan disimpan ke ${rows.length} baris ${isAttendance ? "absensi" : "pengiriman"}. Angka ini yang akan dipakai Payroll Run.`, confirmText: "Simpan", danger: false }))) return;
    setCommitting(true);
    try {
      const chunkSize = 100;
      let done = 0;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const res = await Promise.all(chunk.map((r) => (supabase as any).from(table).update({ fee: r.fee }).eq("id", r.id as string)));
        const err = res.find((x: any) => x.error)?.error;
        if (err) throw err;
        done += chunk.length;
      }
      toast.success(`Fee tersimpan ke ${done} baris. Siap dipakai Payroll Run.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <AdminLayout title="Hitung Fee" subtitle="Hitung fee dari data pengiriman pakai skema pricing (preview sebelum simpan)">
      {/* Kontrol */}
      <div className="rounded-lg border border-border bg-card p-5 mb-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-muted-foreground">Client</label>
          <select value={clientId} onChange={(e) => { setClientId(e.target.value); setSchemeId(""); }}
            className="w-full rounded-md border border-border bg-background px-3 py-2">
            <option value="">— pilih client —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-muted-foreground">Skema</label>
          <select value={schemeId} onChange={(e) => setSchemeId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2">
            <option value="">— pilih skema —</option>
            {matchingSchemes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.scheme_for === "client" ? "Client" : "Rider"} · {typeLabel(s.calc_type)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-muted-foreground">Dari Tanggal</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-muted-foreground">Sampai Tanggal</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2" />
        </div>
        <div className="md:col-span-2">
          <button onClick={run} disabled={running || !schemeId}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? "Menghitung…" : "Hitung"}
          </button>
        </div>
      </div>

      {result && ranScheme && (
        <>
          {/* Ringkasan */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <SummaryCard label="Baris dihitung" value={String(result.completedRows)} />
            <SummaryCard label="Baris di-skip" value={String(result.skippedRows)} />
            <SummaryCard label="Subtotal" value={formatRupiah(result.subtotal)} />
            <SummaryCard
              label={ranScheme.scheme_for === "client" ? "Total Tagihan" : "Total Fee Rider"}
              value={formatRupiah(result.grandTotal)}
              highlight
            />
          </div>

          {/* Warning */}
          {result.warnings.length > 0 && (
            <div className="rounded-md border border-warning/30 bg-warning/10 px-3.5 py-2.5 mb-4 flex items-start gap-2.5 text-xs text-warning">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>{result.warnings.map((w, i) => <div key={i}>{w}</div>)}</div>
            </div>
          )}

          {/* Anomali */}
          {result.anomalies.length > 0 && (
            <div className="rounded-md border border-warning/30 bg-warning/10 px-3.5 py-2.5 mb-4 text-xs text-warning">
              <div className="flex items-center gap-2 font-medium mb-1.5">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {result.anomalies.length} baris anomali terdeteksi — cek manual, tidak otomatis di-skip
              </div>
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {result.anomalies.slice(0, 50).map((a, i) => (
                  <div key={i} className="font-mono">
                    {riderNames[a.rider] ?? a.rider} · {a.date}{a.awb ? ` · ${a.awb}` : ""} — {a.detail}
                  </div>
                ))}
                {result.anomalies.length > 50 && <div>+{result.anomalies.length - 50} lainnya</div>}
              </div>
            </div>
          )}

          {/* Rincian per rider */}
          <div className="rounded-lg border border-border overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Rider</th>
                  <th className="p-3 text-right">Unit</th>
                  <th className="p-3 text-right">Base</th>
                  <th className="p-3 text-right">Add-KG</th>
                  <th className="p-3 text-right">Multi-drop</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {result.perRider.length === 0 ? (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Tidak ada hasil.</td></tr>
                ) : (
                  result.perRider.map((l) => (
                    <tr key={l.rider} className="border-t border-border">
                      <td className="p-3 font-medium">{riderNames[l.rider] ?? l.rider}</td>
                      <td className="p-3 text-right text-muted-foreground">{l.units}</td>
                      <td className="p-3 text-right">{formatRupiah(l.base)}</td>
                      <td className="p-3 text-right">{l.add_kg ? formatRupiah(l.add_kg) : "—"}</td>
                      <td className="p-3 text-right">{l.multi_drop ? formatRupiah(l.multi_drop) : "—"}</td>
                      <td className="p-3 text-right font-semibold">{formatRupiah(l.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Billing breakdown (client) */}
          {result.billing && (
            <div className="rounded-lg border border-border bg-card p-4 mb-4 text-sm max-w-sm">
              <p className="font-medium mb-2">Rincian Tagihan Client</p>
              <Line label="Subtotal" value={formatRupiah(result.subtotal)} />
              {result.billing.floored && <Line label="→ dinaikkan ke Min Charge" value="" muted />}
              <Line label="+ Admin Fee" value={formatRupiah(result.billing.admin_fee)} />
              <Line label="+ PPN" value={formatRupiah(result.billing.ppn)} />
              <div className="border-t border-border mt-2 pt-2">
                <Line label="Total Tagihan" value={formatRupiah(result.billing.final)} bold />
              </div>
            </div>
          )}

          {/* Commit */}
          {ranScheme.scheme_for === "rider" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Cek dulu angkanya di atas. Kalau udah bener, <strong>Commit</strong> untuk simpan fee ke data pengiriman — angka ini yang dipungut <strong>Payroll Run</strong>.</span>
              </div>
              <button onClick={commit} disabled={committing}
                className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50">
                {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {committing ? "Menyimpan…" : "Commit ke Payroll"}
              </button>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted/40 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-muted-foreground">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Skema ini <strong>Client (revenue)</strong> — angkanya buat tagihan/invoice, bukan payroll. Commit ke invoice menyusul (belum tersedia). Sekarang preview aja dulu.</span>
            </div>
          )}
        </>
      )}

      {attResult && ranScheme && (
        <>
          {/* Ringkasan Attendance */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <SummaryCard label="Baris absensi" value={String(attResult.totalRows)} />
            <SummaryCard label="Baris absen (fee 0)" value={String(attResult.absentRows)} />
            <SummaryCard label="Subtotal" value={formatRupiah(attResult.subtotal)} />
            <SummaryCard label="Total Fee Attendance" value={formatRupiah(attResult.subtotal)} highlight />
          </div>

          {attResult.warnings.length > 0 && (
            <div className="rounded-md border border-warning/30 bg-warning/10 px-3.5 py-2.5 mb-4 flex items-start gap-2.5 text-xs text-warning">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>{attResult.warnings.map((w, i) => <div key={i}>{w}</div>)}</div>
            </div>
          )}

          {/* Rincian per rider */}
          <div className="rounded-lg border border-border overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Rider</th>
                  <th className="p-3 text-right">Hari Kerja</th>
                  <th className="p-3 text-right">Base</th>
                  <th className="p-3 text-right">Lembur</th>
                  <th className="p-3 text-right">Insentif</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {attResult.perRider.length === 0 ? (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Tidak ada hasil.</td></tr>
                ) : (
                  attResult.perRider.map((l) => (
                    <tr key={l.rider} className="border-t border-border">
                      <td className="p-3 font-medium">{riderNames[l.rider] ?? l.rider}</td>
                      <td className="p-3 text-right text-muted-foreground">{l.daysWorked}</td>
                      <td className="p-3 text-right">{formatRupiah(l.base)}</td>
                      <td className="p-3 text-right">{l.overtime ? formatRupiah(l.overtime) : "—"}</td>
                      <td className="p-3 text-right">{l.incentive ? formatRupiah(l.incentive) : "—"}</td>
                      <td className="p-3 text-right font-semibold">{formatRupiah(l.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Commit */}
          {ranScheme.scheme_for === "rider" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Cek dulu angkanya di atas. Kalau udah bener, <strong>Commit</strong> untuk simpan fee ke data absensi — angka ini yang dipungut <strong>Payroll Run</strong>.</span>
              </div>
              <button onClick={commit} disabled={committing}
                className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50">
                {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {committing ? "Menyimpan…" : "Commit ke Payroll"}
              </button>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted/40 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-muted-foreground">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Skema ini <strong>Client (revenue)</strong> — belum ada sisi invoice buat attendance. Sekarang preview aja dulu.</span>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "border-primary bg-primary-soft" : "border-border bg-card"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${highlight ? "text-primary-soft-foreground" : ""}`}>{value}</div>
    </div>
  );
}

function Line({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""} ${muted ? "text-muted-foreground text-xs" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
