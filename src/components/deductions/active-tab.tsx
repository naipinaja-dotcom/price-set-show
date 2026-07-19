import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageSizeSelect, PaginationBar } from "@/components/pagination-bar";
import { usePagination } from "@/lib/use-pagination";
import { parseRupiah } from "@/lib/format";
import { confirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { Loader2, Trash2, Pencil } from "lucide-react";
import type { DType, Inst, Rider } from "./types";

export function ActiveTab() {
  const [rows, setRows] = useState<(Inst & { rider?: Rider; type?: DType })[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [types, setTypes] = useState<DType[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ef, setEf] = useState({
    deduction_type_id: "",
    total_amount: 0,
    installment_count: 1,
    daily_rate: 0,
    next_deduction_date: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rider_installments")
      .select(
        "*, riders(id, employee_id, full_name), deduction_types(id, code, name, description, installmentable, active)",
      )
      .eq("active", true)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else
      setRows((data ?? []).map((r: any) => ({ ...r, rider: r.riders, type: r.deduction_types })));
    setLoading(false);
  };
  useEffect(() => {
    load();
    // Filter sama persis dengan AddTab.save(): jenis apapun yang non-auto-recurring
    // bisa dipakai di sini (installmentable cuma ngatur boleh-tidaknya dicicil,
    // bukan syarat buat muncul di Cicilan Aktif — one-shot pun disimpan di tabel ini).
    (supabase as any)
      .from("deduction_types")
      .select("*")
      .eq("active", true)
      .eq("auto_recurring", false)
      .then(({ data }: any) => setTypes(data ?? []));
  }, []);

  const startEdit = (r: Inst & { rider?: Rider; type?: DType }) => {
    setEditingId(r.id);
    setEf({
      deduction_type_id: r.deduction_type_id,
      total_amount: r.total_amount ?? 0,
      installment_count: r.installment_count ?? 1,
      daily_rate: r.daily_rate ?? 0,
      next_deduction_date: r.next_deduction_date ?? "",
      notes: r.notes ?? "",
    });
  };

  // Koreksi jadwal cicilan yang salah input. mode='fixed': per_period_amount
  // dihitung ulang dari total_amount/installment_count (rumus sama persis
  // dengan waktu bikin cicilan baru, AddTab.save). mode='daily': cuma
  // daily_rate yang relevan. TIDAK menyentuh riwayat payroll_deductions yang
  // sudah tercatat — cuma proyeksi ke depan (potongan otomatis di run berikutnya).
  const saveEdit = async (r: Inst) => {
    if (!ef.deduction_type_id) return toast.error("Lengkapi jenis potongan");
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: any = { deduction_type_id: ef.deduction_type_id, next_deduction_date: ef.next_deduction_date || null, notes: ef.notes || null };
    if (r.mode === "daily") {
      update.daily_rate = ef.daily_rate;
    } else {
      if (ef.installment_count < r.installments_paid) {
        setSaving(false);
        return toast.error(
          `Jumlah cicilan gak boleh kurang dari yang sudah terbayar (${r.installments_paid}).`,
        );
      }
      update.total_amount = ef.total_amount;
      update.installment_count = ef.installment_count;
      update.per_period_amount = +(ef.total_amount / ef.installment_count).toFixed(2);
    }
    const { error } = await supabase.from("rider_installments").update(update).eq("id", r.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(
      "Cicilan diperbarui — perubahan ini cuma berlaku ke potongan berikutnya, riwayat yang sudah tercatat tidak berubah.",
    );
    setEditingId(null);
    load();
  };

  const remove = async (r: Inst & { rider?: Rider; type?: DType }) => {
    const paid = (r.installments_paid ?? 0) > 0;
    const desc = paid
      ? `Milik ${r.rider?.full_name}.\n\nSudah terpotong ${r.installments_paid}× di payroll sebelumnya — potongan yang SUDAH tercatat tidak berubah, cicilan ini cuma berhenti & hilang dari daftar.`
      : `Milik ${r.rider?.full_name}.\n\nBelum pernah kepotong, jadi aman dihapus.`;
    if (
      !(await confirmDialog({
        title: `Hapus cicilan ${r.type?.name}?`,
        description: desc,
        confirmText: "Hapus",
      }))
    )
      return;
    setDeletingId(r.id);
    const { error } = await supabase.from("rider_installments").delete().eq("id", r.id);
    setDeletingId(null);
    if (error) return toast.error(error.message);
    toast.success("Cicilan dihapus");
    load();
  };

  const { pageSize, setPageSize, page, setPage, totalPages, paged, from, to, total } =
    usePagination(rows, 10);

  return (
    <div>
      {!loading && rows.length > 0 && (
        <div className="flex justify-end mb-2">
          <PageSizeSelect pageSize={pageSize} setPageSize={setPageSize} />
        </div>
      )}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider p-3">
                Rider
              </th>
              <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider p-3">
                Jenis
              </th>
              <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider p-3">
                Mode / Tarif
              </th>
              <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider p-3">
                Progress
              </th>
              <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider p-3">
                Mulai
              </th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center">
                  <Loader2 className="w-4 h-4 animate-spin inline text-primary" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground text-[11px]">
                  Tidak ada cicilan aktif
                </td>
              </tr>
            ) : (
              paged.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary-soft grid place-items-center text-[11px] font-semibold text-primary flex-shrink-0">
                          {(r.rider?.full_name ?? "R")
                            .split(" ")
                            .map((w) => w[0])
                            .filter(Boolean)
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{r.rider?.full_name}</div>
                          <div
                            className="text-[10px] text-muted-foreground"
                            style={{ fontFamily: "'JetBrains Mono', monospace" }}
                          >
                            {r.rider?.employee_id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{r.type?.name}</td>
                    <td className="p-3 text-muted-foreground">
                      {r.mode === "daily" ? (
                        <span>Rp{Number(r.daily_rate ?? 0).toLocaleString("id-ID")}/hari</span>
                      ) : (
                        <span>Rp{Number(r.per_period_amount ?? 0).toLocaleString("id-ID")}/periode</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {r.mode === "daily" ? (
                        <span className="text-[10px] uppercase tracking-wide">Ongoing</span>
                      ) : (
                        `${r.installments_paid}/${r.installment_count}`
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{r.start_date}</td>
                    <td className="text-right pr-3 space-x-1">
                      <button
                        onClick={() => startEdit(r)}
                        className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-primary transition-colors"
                        title="Edit cicilan"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => remove(r)}
                        disabled={deletingId === r.id}
                        className="p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-md disabled:opacity-50 transition-colors"
                        title="Hapus cicilan"
                      >
                        {deletingId === r.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                  {editingId === r.id && (
                    <tr className="border-b border-border/60 bg-muted/20">
                      <td colSpan={6} className="p-3">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 items-end text-sm">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">
                              Jenis
                            </label>
                            <select
                              value={ef.deduction_type_id}
                              onChange={(e) => setEf({ ...ef, deduction_type_id: e.target.value })}
                              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                            >
                              {/* Jenis yang lagi kepake tapi udah nonaktif/gak-bisa-dicicil tetep
                                ditampilin (biar select-nya gak diam-diam kosong), taruh di atas. */}
                              {r.type && !types.some((t) => t.id === r.deduction_type_id) && (
                                <option value={r.type.id}>{r.type.name} (nonaktif)</option>
                              )}
                              {types.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          {r.mode === "daily" ? (
                            <div>
                              <label className="text-xs font-medium text-muted-foreground">
                                Tarif per Hari (Rp)
                              </label>
                              <input
                                inputMode="numeric"
                                value={ef.daily_rate ? ef.daily_rate.toLocaleString("id-ID") : ""}
                                onChange={(e) => setEf({ ...ef, daily_rate: parseRupiah(e.target.value) })}
                                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                              />
                            </div>
                          ) : (
                            <>
                              <div>
                                <label className="text-xs font-medium text-muted-foreground">
                                  Total (Rp)
                                </label>
                                <input
                                  inputMode="numeric"
                                  value={ef.total_amount ? ef.total_amount.toLocaleString("id-ID") : ""}
                                  onChange={(e) =>
                                    setEf({ ...ef, total_amount: parseRupiah(e.target.value) })
                                  }
                                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-muted-foreground">
                                  Jumlah Cicilan
                                </label>
                                <input
                                  type="number"
                                  min={r.installments_paid || 1}
                                  value={ef.installment_count}
                                  onChange={(e) => setEf({ ...ef, installment_count: +e.target.value })}
                                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                                />
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  Per periode: Rp
                                  {(ef.total_amount / Math.max(1, ef.installment_count)).toLocaleString(
                                    "id-ID",
                                  )}
                                </p>
                              </div>
                            </>
                          )}
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">
                              Potong Berikutnya
                            </label>
                            <input
                              type="date"
                              value={ef.next_deduction_date}
                              onChange={(e) =>
                                setEf({ ...ef, next_deduction_date: e.target.value })
                              }
                              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">
                              Catatan
                            </label>
                            <input
                              value={ef.notes}
                              onChange={(e) => setEf({ ...ef, notes: e.target.value })}
                              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-2.5">
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
                          >
                            Batal
                          </button>
                          <button
                            onClick={() => saveEdit(r)}
                            disabled={saving}
                            className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-50"
                          >
                            {saving ? "Menyimpan…" : "Simpan"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!loading && (
        <PaginationBar
          page={page}
          totalPages={totalPages}
          setPage={setPage}
          from={from}
          to={to}
          total={total}
        />
      )}
    </div>
  );
}
