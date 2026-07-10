import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageSizeSelect, PaginationBar } from "@/components/pagination-bar";
import { usePagination } from "@/lib/use-pagination";
import { toCSV, downloadCSV } from "@/lib/csv";
import { fetchAllRows } from "@/lib/fetch-all";
import { listPricingSchemes } from "@/lib/pricing-store";
import { describeScheme, type RateCard } from "@/lib/rate-card";
import { downloadXLS, rateCardsToRows, type Cell } from "@/lib/finance-export";
import { toast } from "sonner";
import { Download, Loader2, ChevronRight, FileSpreadsheet } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type Run = { id: string; name: string; period_start: string; period_end: string; status: string };

type DelivDetail = { date: string; km: number | null; kg: number | null; type: string | null; fee: number };
type AttDetail = { date: string; clockIn: string | null; clockOut: string | null; dur: number | null; late: boolean; absent: boolean; fee: number };

type RiderRow = {
  detailId: string;
  rider_id: string;
  name: string;
  employeeId: string;
  orderCount: number;
  feeRider: number;
  activeDates: number;
  ded: Record<string, number>;
  total: number;
  remarks: string;
  deliv: DelivDetail[];
  att: AttDetail[];
};

const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");
const otpLabel = (a: AttDetail) => (a.absent ? "ABSEN" : a.late ? "LATE" : "ONTIME");
const durLabel = (m: number | null) => (m == null ? "—" : `${Math.floor(m / 60)}j ${m % 60}m`);

export function FinanceWorksheet({ runId, run }: { runId: string; run?: Run }) {
  const [rows, setRows] = useState<RiderRow[]>([]);
  const [dedTypes, setDedTypes] = useState<string[]>([]);
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showRates, setShowRates] = useState(true);

  useEffect(() => {
    if (!run) return;
    (async () => {
      setLoading(true);
      try {
        const { data: details, error: e1 } = await sb.from("payroll_details")
          .select("id, rider_id, client_id, delivery_count, gross_earning, net_pay, remarks, riders(full_name, employee_id)")
          .eq("run_id", runId);
        if (e1) throw e1;

        // potongan per detail → kolom dinamis
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

        // detail mentah periode ini (buat drill-down + active dates)
        const [delivs, atts] = await Promise.all([
          fetchAllRows<{ rider_id: string | null; delivery_date: string; distance_km: number | null; weight_kg: number | null; delivery_type: string | null; fee: number }>(
            (c, from, to) => c.from("delivery_records" as any)
              .select("rider_id, delivery_date, distance_km, weight_kg, delivery_type, fee")
              .gte("delivery_date", run.period_start).lte("delivery_date", run.period_end).range(from, to)),
          fetchAllRows<{ rider_id: string | null; log_date: string; clock_in: string | null; clock_out: string | null; duration_minutes: number | null; is_late: boolean; is_absent: boolean; fee: number }>(
            (c, from, to) => (c as any).from("attendance_logs")
              .select("rider_id, log_date, clock_in, clock_out, duration_minutes, is_late, is_absent, fee")
              .gte("log_date", run.period_start).lte("log_date", run.period_end).range(from, to)),
        ]);

        const delivByRider = new Map<string, DelivDetail[]>();
        const datesByRider = new Map<string, Set<string>>();
        for (const r of delivs) {
          if (!r.rider_id) continue;
          (delivByRider.get(r.rider_id) ?? delivByRider.set(r.rider_id, []).get(r.rider_id)!)
            .push({ date: r.delivery_date, km: r.distance_km, kg: r.weight_kg, type: r.delivery_type, fee: Number(r.fee) || 0 });
          const s = datesByRider.get(r.rider_id) ?? new Set<string>();
          s.add(r.delivery_date); datesByRider.set(r.rider_id, s);
        }
        const attByRider = new Map<string, AttDetail[]>();
        for (const a of atts) {
          if (!a.rider_id) continue;
          (attByRider.get(a.rider_id) ?? attByRider.set(a.rider_id, []).get(a.rider_id)!)
            .push({ date: a.log_date, clockIn: a.clock_in, clockOut: a.clock_out, dur: a.duration_minutes, late: !!a.is_late, absent: !!a.is_absent, fee: Number(a.fee) || 0 });
        }

        const built: RiderRow[] = (details ?? []).map((d: {
          id: string; rider_id: string; delivery_count: number; gross_earning: number; net_pay: number; remarks: string | null;
          riders?: { full_name?: string; employee_id?: string };
        }) => ({
          detailId: d.id,
          rider_id: d.rider_id,
          name: d.riders?.full_name ?? "(tanpa nama)",
          employeeId: d.riders?.employee_id ?? "",
          orderCount: d.delivery_count,
          feeRider: Number(d.gross_earning),
          activeDates: datesByRider.get(d.rider_id)?.size ?? 0,
          ded: dedByDetail.get(d.id) ?? {},
          total: Number(d.net_pay),
          remarks: d.remarks ?? "",
          deliv: (delivByRider.get(d.rider_id) ?? []).sort((a, b) => a.date.localeCompare(b.date)),
          att: (attByRider.get(d.rider_id) ?? []).sort((a, b) => a.date.localeCompare(b.date)),
        })).sort((a: RiderRow, b: RiderRow) => b.total - a.total);

        setDedTypes([...typeSet].sort());
        setRows(built);

        // rate card: skema rider untuk client yg ada di run ini (atau global/null)
        const clientIds = new Set<string>((details ?? []).map((d: { client_id: string | null }) => d.client_id).filter(Boolean) as string[]);
        const schemes = await listPricingSchemes();
        const relevant = schemes.filter((s) => s.scheme_for === "rider" && (s.client_id === null || clientIds.has(s.client_id)));
        setRateCards(relevant.map(describeScheme));
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [runId, run]);

  const saveRemark = async (detailId: string, val: string) => {
    setRows((prev) => prev.map((r) => (r.detailId === detailId ? { ...r, remarks: val } : r)));
    const { error } = await sb.from("payroll_details").update({ remarks: val || null }).eq("id", detailId);
    if (error) toast.error("Gagal simpan remarks: " + error.message);
  };

  const t = useMemo(() => rows.reduce((s, r) => ({
    order: s.order + r.orderCount, fee: s.fee + r.feeRider, total: s.total + r.total,
    ded: dedTypes.reduce((m, ty) => ({ ...m, [ty]: (m[ty] ?? 0) + (r.ded[ty] ?? 0) }), s.ded),
  }), { order: 0, fee: 0, total: 0, ded: {} as Record<string, number> }), [rows, dedTypes]);

  // ---- baris sheet ----
  const summaryRows = (): Cell[][] => {
    const header: Cell[] = ["Driver Name", "Employee ID", "COUNTA of Order", "Fee Rider", "Active Date", ...dedTypes, "Total Fee Order", "Remarks"];
    const body: Cell[][] = rows.map((r) => [r.name, r.employeeId, r.orderCount, r.feeRider, r.activeDates, ...dedTypes.map((ty) => r.ded[ty] ?? 0), r.total, r.remarks]);
    const grand: Cell[] = ["GRAND TOTAL", "", t.order, t.fee, "", ...dedTypes.map((ty) => t.ded[ty] ?? 0), t.total, ""];
    return [header, ...body, grand];
  };
  const detailRows = (): Cell[][] => {
    const header: Cell[] = ["Driver Name", "Kode Mitra", "Tanggal", "Jenis", "Jarak (km)", "Berat (kg)", "OTP / Status", "Fee"];
    const out: Cell[][] = [header];
    for (const r of rows) {
      for (const d of r.deliv) out.push([r.name, r.employeeId, d.date, "Kiriman", d.km ?? "", d.kg ?? "", d.type ?? "", d.fee]);
      for (const a of r.att) out.push([r.name, r.employeeId, a.date, "Absensi", "", "", otpLabel(a), a.fee]);
      const sub = r.deliv.reduce((s, d) => s + d.fee, 0) + r.att.reduce((s, a) => s + a.fee, 0);
      out.push(["", "", "", "", "", "", `Subtotal ${r.name}`, sub]);
    }
    return out;
  };

  const exportExcel = () => {
    const sheets = [
      { name: "Rate Card (PKS)", rows: rateCards.length ? rateCardsToRows(rateCards) : [["(tidak ada skema rider untuk client di run ini)"]] },
      { name: "Detail", rows: detailRows() },
      { name: "Ringkasan", rows: summaryRows() },
    ];
    downloadXLS(`worksheet-${run?.name ?? runId}`, sheets);
  };
  const exportSummaryCSV = () => downloadCSV(`ringkasan-${run?.name ?? runId}.csv`, toCSV(summaryRows()));
  const exportDetailCSV = () => downloadCSV(`detail-${run?.name ?? runId}.csv`, toCSV(detailRows()));

  const { pageSize, setPageSize, page, setPage, totalPages, paged, from, to, total } = usePagination(rows, 20);

  if (loading) return <Loader2 className="w-4 h-4 animate-spin" />;

  return (
    <>
      {/* Rate card / PKS */}
      <div className="rounded-xl border border-border bg-card mb-4 overflow-hidden">
        <button onClick={() => setShowRates((v) => !v)} className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/40">
          <FileSpreadsheet className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Rate / PKS — dasar perhitungan ({rateCards.length} skema)</span>
          <ChevronRight className={`w-4 h-4 ml-auto transition-transform ${showRates ? "rotate-90" : ""}`} />
        </button>
        {showRates && (
          <div className="px-4 pb-4 pt-1 grid gap-3 md:grid-cols-2">
            {rateCards.length === 0 ? (
              <p className="text-xs text-muted-foreground">Belum ada skema rider untuk client di run ini.</p>
            ) : rateCards.map((c, i) => (
              <div key={i} className="rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-2 bg-muted flex items-center gap-2">
                  <span className="text-[13px] font-semibold truncate">{c.schemeName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-soft text-primary-soft-foreground ml-auto flex-shrink-0">{c.calcLabel}</span>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {c.sections.map((sec, si) => (
                      <Fragment key={si}>
                        {sec.title && <tr><td colSpan={4} className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/30">{sec.title}</td></tr>}
                        {sec.rows.map((r, ri) => (
                          <tr key={`${si}-${ri}`} className="border-t border-border">
                            <td className="px-3 py-1.5">{r.variable}</td>
                            <td className="px-2 py-1.5 text-right font-medium tabular-nums whitespace-nowrap">{r.rate}</td>
                            <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{r.unit}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{r.remarks}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Export */}
      <div className="flex flex-wrap justify-end items-center gap-2 mb-3">
        {rows.length > 0 && <PageSizeSelect pageSize={pageSize} setPageSize={setPageSize} />}
        <button onClick={exportExcel} disabled={!rows.length}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50">
          <FileSpreadsheet className="w-4 h-4" /> Excel (3 sheet)
        </button>
        <button onClick={exportSummaryCSV} disabled={!rows.length}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50">
          <Download className="w-4 h-4" /> CSV Ringkasan
        </button>
        <button onClick={exportDetailCSV} disabled={!rows.length}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50">
          <Download className="w-4 h-4" /> CSV Detail
        </button>
      </div>

      {/* Ringkasan + drill-down */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-2 sticky left-0 bg-muted">Driver Name</th>
              <th className="text-right px-3">Order</th>
              <th className="text-right px-3">Fee Rider</th>
              <th className="text-right px-3">Active</th>
              {dedTypes.map((ty) => <th key={ty} className="text-right px-3">{ty}</th>)}
              <th className="text-right px-3">Total Fee</th>
              <th className="px-3 min-w-[180px]">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={6 + dedTypes.length} className="p-6 text-center text-muted-foreground">Tidak ada data — pastikan payroll run ini sudah di-Generate.</td></tr> :
              paged.map((r) => (
                <Fragment key={r.detailId}>
                  <tr className="border-t border-border">
                    <td className="p-2 sticky left-0 bg-background">
                      <button onClick={() => setExpanded(expanded === r.detailId ? null : r.detailId)} className="flex items-center gap-1.5 text-left hover:text-primary">
                        <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${expanded === r.detailId ? "rotate-90" : ""}`} />
                        <span>
                          <span className="font-medium block">{r.name}</span>
                          <span className="text-xs text-muted-foreground">{r.employeeId}</span>
                        </span>
                      </button>
                    </td>
                    <td className="text-right px-3 tabular-nums">{r.orderCount}</td>
                    <td className="text-right px-3 tabular-nums">{rp(r.feeRider)}</td>
                    <td className="text-right px-3 tabular-nums">{r.activeDates}</td>
                    {dedTypes.map((ty) => (
                      <td key={ty} className="text-right px-3 tabular-nums text-destructive">{r.ded[ty] ? rp(r.ded[ty]) : "—"}</td>
                    ))}
                    <td className="text-right px-3 font-semibold tabular-nums">{rp(r.total)}</td>
                    <td className="px-2">
                      <input defaultValue={r.remarks} onBlur={(e) => { if (e.target.value !== r.remarks) saveRemark(r.detailId, e.target.value); }}
                        placeholder="catatan…" className="w-full min-w-[160px] rounded border border-border bg-background px-2 py-1 text-xs" />
                    </td>
                  </tr>
                  {expanded === r.detailId && (
                    <tr className="bg-muted/30">
                      <td colSpan={6 + dedTypes.length} className="px-4 py-3">
                        <RiderDetail r={r} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-muted font-semibold">
              <tr>
                <td className="p-2 sticky left-0 bg-muted">GRAND TOTAL</td>
                <td className="text-right px-3 tabular-nums">{t.order}</td>
                <td className="text-right px-3 tabular-nums">{rp(t.fee)}</td>
                <td className="text-right px-3">—</td>
                {dedTypes.map((ty) => <td key={ty} className="text-right px-3 tabular-nums">{rp(t.ded[ty] ?? 0)}</td>)}
                <td className="text-right px-3 tabular-nums">{rp(t.total)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {rows.length > 0 && <PaginationBar page={page} totalPages={totalPages} setPage={setPage} from={from} to={to} total={total} />}
      <p className="text-xs text-muted-foreground mt-2">
        Klik nama rider buat lihat rincian per order/hari (bukti angkanya). Remarks ke-simpan otomatis pas pindah kolom. Excel isi 3 sheet: Rate Card, Detail, Ringkasan. GRAND TOTAL menghitung SEMUA rider, bukan cuma yang tampil di halaman ini.
      </p>
    </>
  );
}

function RiderDetail({ r }: { r: RiderRow }) {
  const delivSum = r.deliv.reduce((s, d) => s + d.fee, 0);
  const attSum = r.att.reduce((s, a) => s + a.fee, 0);
  return (
    <div className="space-y-3">
      {r.deliv.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Kiriman ({r.deliv.length})</div>
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-xs whitespace-nowrap bg-card">
              <thead className="bg-muted text-left"><tr><th className="px-3 py-1.5">Tanggal</th><th className="text-right px-3">Jarak (km)</th><th className="text-right px-3">Berat (kg)</th><th className="px-3">Tipe</th><th className="text-right px-3">Fee</th></tr></thead>
              <tbody>
                {r.deliv.map((d, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-1.5">{d.date}</td>
                    <td className="text-right px-3 tabular-nums">{d.km ?? "—"}</td>
                    <td className="text-right px-3 tabular-nums">{d.kg ?? "—"}</td>
                    <td className="px-3">{d.type ?? "—"}</td>
                    <td className="text-right px-3 tabular-nums">{rp(d.fee)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border-strong font-medium"><td className="px-3 py-1.5" colSpan={4}>Subtotal kiriman</td><td className="text-right px-3 tabular-nums">{rp(delivSum)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      {r.att.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Absensi ({r.att.length})</div>
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-xs whitespace-nowrap bg-card">
              <thead className="bg-muted text-left"><tr><th className="px-3 py-1.5">Tanggal</th><th className="px-3">Masuk</th><th className="px-3">Keluar</th><th className="px-3">Durasi</th><th className="px-3">OTP</th><th className="text-right px-3">Fee</th></tr></thead>
              <tbody>
                {r.att.map((a, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-1.5">{a.date}</td>
                    <td className="px-3">{a.clockIn ?? "—"}</td>
                    <td className="px-3">{a.clockOut ?? "—"}</td>
                    <td className="px-3">{durLabel(a.dur)}</td>
                    <td className="px-3">{otpLabel(a)}</td>
                    <td className="text-right px-3 tabular-nums">{rp(a.fee)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border-strong font-medium"><td className="px-3 py-1.5" colSpan={5}>Subtotal absensi</td><td className="text-right px-3 tabular-nums">{rp(attSum)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Σ kiriman {rp(delivSum)} + absensi {rp(attSum)} = Fee Rider {rp(r.feeRider)} → dikurangi potongan → Total {rp(r.total)}.
      </p>
    </div>
  );
}
