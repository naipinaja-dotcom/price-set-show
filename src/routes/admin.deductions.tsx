import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { PageSizeSelect, PaginationBar } from "@/components/pagination-bar";
import { usePagination } from "@/lib/use-pagination";
import { parseRupiah } from "@/lib/format";
import { confirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, X, Pencil } from "lucide-react";

export const Route = createFileRoute("/admin/deductions")({ component: DeductionsPage });

type DType = { id: string; code: string; name: string; description: string | null; installmentable: boolean; active: boolean; auto_recurring: boolean; recurring_amount: number };
type Rider = { id: string; employee_id: string; full_name: string };
type Inst = {
  id: string; rider_id: string; deduction_type_id: string;
  total_amount: number; installment_count: number; installments_paid: number;
  per_period_amount: number; start_date: string; next_deduction_date: string | null;
  active: boolean; notes: string | null;
};

function DeductionsPage() {
  const [tab, setTab] = useState<"types" | "add" | "active">("types");
  return (
    <AdminLayout title="Potongan">
      <div className="flex gap-1 p-1 bg-muted rounded-md w-fit mb-5">
        {([["types","Jenis Potongan"],["add","Tambah Potongan"],["active","Cicilan Aktif"]] as const).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-1.5 text-sm rounded ${tab === k ? "bg-card shadow-sm font-medium" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>
      {tab === "types" && <DTypesTab />}
      {tab === "add" && <AddTab />}
      {tab === "active" && <ActiveTab />}
    </AdminLayout>
  );
}

function DTypesTab() {
  const [rows, setRows] = useState<DType[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState({ code: "", name: "", description: "", installmentable: false, auto_recurring: false, recurring_amount: 0 });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from("deduction_types").select("*").order("name");
    if (error) toast.error(error.message); else setRows(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!nf.code.trim() || !nf.name.trim()) return toast.error("Kode & nama wajib diisi");
    if (nf.auto_recurring && nf.recurring_amount <= 0) return toast.error("Nominal potong otomatis wajib diisi");
    setSaving(true);
    const { error } = await (supabase as any).from("deduction_types").insert({
      code: nf.code.trim().toUpperCase(),
      name: nf.name.trim(),
      description: nf.description.trim() || null,
      installmentable: nf.installmentable,
      auto_recurring: nf.auto_recurring,
      recurring_amount: nf.auto_recurring ? nf.recurring_amount : 0,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Jenis potongan ditambahkan");
    setNf({ code: "", name: "", description: "", installmentable: false, auto_recurring: false, recurring_amount: 0 });
    setAdding(false);
    load();
  };
  const remove = async (r: DType) => {
    if (!(await confirmDialog({ title: "Hapus jenis potongan?", description: `"${r.name}" akan dihapus permanen.`, confirmText: "Hapus" }))) return;
    const { error } = await (supabase as any).from("deduction_types").delete().eq("id", r.id);
    if (!error) { toast.success("Jenis potongan dihapus"); return load(); }
    // Kalau masih dipakai cicilan/potongan tercatat → FK error. Tawarin nonaktifin.
    const inUse = (error as any).code === "23503" || /foreign key/i.test(error.message);
    if (inUse) {
      if (await confirmDialog({
        title: "Tidak bisa dihapus",
        description: `"${r.name}" masih dipakai potongan/cicilan yang sudah tercatat.\n\nNonaktifkan saja? Jenis ini tidak muncul lagi saat bikin potongan baru, tapi data lama tetap aman.`,
        confirmText: "Nonaktifkan", danger: false,
      })) {
        const { error: e2 } = await (supabase as any).from("deduction_types").update({ active: false }).eq("id", r.id);
        if (e2) return toast.error(e2.message);
        toast.success("Jenis potongan dinonaktifkan");
        load();
      }
      return;
    }
    toast.error(error.message);
  };

  const toggleActive = async (r: DType) => {
    const { error } = await (supabase as any).from("deduction_types").update({ active: !r.active }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(r.active ? "Dinonaktifkan" : "Diaktifkan");
    load();
  };

  const inputCls = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm">
          <Plus className="w-4 h-4" /> Tambah Jenis
        </button>
      </div>

      {adding && (
        <div className="rounded-lg border border-border bg-card p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Jenis Potongan Baru</h3>
            <button onClick={() => setAdding(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Kode</label>
              <input value={nf.code} onChange={(e) => setNf({ ...nf, code: e.target.value })} placeholder="mis. SIM, BBM" className={inputCls} />
            </div>
            <div>
              <label className="text-sm font-medium">Nama</label>
              <input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="mis. Cicilan SIM" className={inputCls} />
            </div>
          </div>
          <div className="mt-3">
            <label className="text-sm font-medium">Keterangan <span className="font-normal text-muted-foreground">(opsional)</span></label>
            <input value={nf.description} onChange={(e) => setNf({ ...nf, description: e.target.value })} className={inputCls} />
          </div>
          <label className="flex items-center gap-2 mt-3 text-sm">
            <input type="checkbox" checked={nf.installmentable}
              onChange={(e) => setNf({ ...nf, installmentable: e.target.checked, auto_recurring: e.target.checked ? false : nf.auto_recurring })} /> Bisa dicicil
          </label>
          <label className="flex items-center gap-2 mt-2 text-sm">
            <input type="checkbox" checked={nf.auto_recurring}
              onChange={(e) => setNf({ ...nf, auto_recurring: e.target.checked, installmentable: e.target.checked ? false : nf.installmentable })} />
            Potong otomatis tiap periode <span className="text-muted-foreground text-xs">(semua rider yg ada penghasilan)</span>
          </label>
          {nf.auto_recurring && (
            <div className="mt-3">
              <label className="text-sm font-medium">Nominal Potong per Periode (Rp)</label>
              <input inputMode="numeric" placeholder="mis. 2.500"
                value={nf.recurring_amount ? nf.recurring_amount.toLocaleString("id-ID") : ""}
                onChange={(e) => setNf({ ...nf, recurring_amount: parseRupiah(e.target.value) })}
                className={inputCls} />
              <p className="text-xs text-muted-foreground mt-1">Angka ini otomatis dipotong ke tiap rider tiap kali payroll digenerate.</p>
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setAdding(false)} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted">Batal</button>
            <button onClick={save} disabled={saving} className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-50">
              {saving ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left"><tr><th className="p-3">Kode</th><th>Nama</th><th>Bisa Dicicil</th><th>Otomatis</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
            : rows.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Belum ada jenis potongan</td></tr>
            : rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 font-mono text-xs">{r.code}</td>
                <td>{r.name}</td>
                <td>{r.installmentable ? "Ya" : "Tidak"}</td>
                <td>{r.auto_recurring ? <span className="text-primary font-medium">Ya · Rp{Number(r.recurring_amount).toLocaleString("id-ID")}</span> : "Tidak"}</td>
                <td>
                  <button onClick={() => toggleActive(r)} title="Klik untuk aktif/nonaktif"
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${r.active ? "border-success/40 text-success bg-success/10 hover:bg-success/20" : "border-border text-muted-foreground bg-muted hover:bg-muted/70"}`}>
                    {r.active ? "Aktif" : "Nonaktif"}
                  </button>
                </td>
                <td className="text-right pr-3"><button onClick={() => remove(r)} className="p-1.5 hover:bg-muted rounded text-destructive" title="Hapus"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddTab() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [types, setTypes] = useState<DType[]>([]);
  const [f, setF] = useState({
    rider_ids: [] as string[], deduction_type_id: "", total_amount: 0,
    start_date: new Date().toISOString().slice(0,10),
    installment: false, installment_count: 1, notes: "",
  });
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = riders.filter((r) => {
    const q = search.trim().toLowerCase();
    return !q || r.full_name.toLowerCase().includes(q) || r.employee_id.toLowerCase().includes(q);
  });
  const toggleRider = (id: string) =>
    setF((p) => ({ ...p, rider_ids: p.rider_ids.includes(id) ? p.rider_ids.filter((x) => x !== id) : [...p.rider_ids, id] }));

  useEffect(() => {
    supabase.from("riders").select("id, employee_id, full_name").order("full_name").then(({ data }) => setRiders(data ?? []));
    // jenis "otomatis" ga muncul di sini — dia kepotong sendiri tiap payroll, ga perlu didaftarin manual
    (supabase as any).from("deduction_types").select("*").eq("active", true).eq("auto_recurring", false).then(({ data }: any) => setTypes(data ?? []));
  }, []);

  const save = async () => {
    if (f.rider_ids.length === 0) return toast.error("Pilih minimal 1 rider");
    if (!f.deduction_type_id || !f.total_amount) return toast.error("Lengkapi jenis & nominal potongan");
    setSaving(true);
    const count = f.installment ? Math.max(1, f.installment_count) : 1;
    const per = +(f.total_amount / count).toFixed(2);
    const rows = f.rider_ids.map((rid) => ({
      rider_id: rid, deduction_type_id: f.deduction_type_id,
      total_amount: f.total_amount, installment_count: count, per_period_amount: per,
      start_date: f.start_date, next_deduction_date: f.start_date,
      notes: f.notes || null,
    }));
    const { error } = await supabase.from("rider_installments").insert(rows);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Potongan ditambahkan ke ${f.rider_ids.length} rider`);
    setF({ ...f, rider_ids: [], total_amount: 0, notes: "" });
    setSearch("");
  };

  return (
    <div className="max-w-lg space-y-3 text-sm">
      <div>
        <label className="font-medium">Rider <span className="font-normal text-muted-foreground">({f.rider_ids.length} dipilih)</span></label>
        <input placeholder="Cari nama / kode rider…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
        <div className="mt-1.5 flex items-center gap-3 text-xs">
          <button type="button" onClick={() => setF((p) => ({ ...p, rider_ids: Array.from(new Set([...p.rider_ids, ...filtered.map((r) => r.id)])) }))}
            className="text-primary hover:underline">Pilih semua{search ? ` (${filtered.length})` : ""}</button>
          <button type="button" onClick={() => setF((p) => ({ ...p, rider_ids: [] }))}
            className="text-muted-foreground hover:text-foreground">Hapus pilihan</button>
        </div>
        <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {filtered.length === 0 ? <div className="px-3 py-2 text-muted-foreground text-xs">Ga ada rider cocok</div> :
            filtered.map((r) => (
              <label key={r.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted cursor-pointer">
                <input type="checkbox" checked={f.rider_ids.includes(r.id)} onChange={() => toggleRider(r.id)} />
                <span className="font-mono text-xs text-muted-foreground">{r.employee_id}</span>
                <span>{r.full_name}</span>
              </label>
            ))}
        </div>
      </div>
      <div>
        <label className="font-medium">Jenis Potongan</label>
        <select value={f.deduction_type_id} onChange={(e) => {
            const id = e.target.value;
            const t = types.find((x) => x.id === id);
            // reset "Dicicil" kalau jenis yang dipilih tidak boleh dicicil
            setF({ ...f, deduction_type_id: id, installment: t?.installmentable ? f.installment : false });
          }}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2">
          <option value="">— pilih jenis —</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div>
        <label className="font-medium">Nominal Total (Rp)</label>
        <input inputMode="numeric" placeholder="0"
          value={f.total_amount ? f.total_amount.toLocaleString("id-ID") : ""}
          onChange={(e) => setF({ ...f, total_amount: parseRupiah(e.target.value) })}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
      </div>
      <div>
        <label className="font-medium">Tanggal Mulai</label>
        <input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
      </div>
      {(() => {
        const canInstallment = !!types.find((t) => t.id === f.deduction_type_id)?.installmentable;
        return (
          <>
            <label className={`flex items-center gap-2 ${canInstallment ? "" : "opacity-50 cursor-not-allowed"}`}>
              <input type="checkbox" disabled={!canInstallment} checked={f.installment && canInstallment}
                onChange={(e) => setF({ ...f, installment: e.target.checked })} /> Dicicil
            </label>
            {f.deduction_type_id && !canInstallment && (
              <p className="text-xs text-muted-foreground">Jenis potongan ini tidak bisa dicicil.</p>
            )}
          </>
        );
      })()}
      {f.installment && (
        <div>
          <label className="font-medium">Jumlah Cicilan</label>
          <input type="number" min={1} value={f.installment_count} onChange={(e) => setF({ ...f, installment_count: +e.target.value })}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
          <p className="text-xs text-muted-foreground mt-1">Per periode: Rp{(f.total_amount / Math.max(1, f.installment_count)).toLocaleString("id-ID")}</p>
        </div>
      )}
      <div>
        <label className="font-medium">Catatan</label>
        <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
      </div>
      <button onClick={save} disabled={saving} className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50">
        {saving ? "Menyimpan…" : "Simpan Potongan"}
      </button>
    </div>
  );
}

function ActiveTab() {
  const [rows, setRows] = useState<(Inst & { rider?: Rider; type?: DType })[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [types, setTypes] = useState<DType[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ef, setEf] = useState({ deduction_type_id: "", total_amount: 0, installment_count: 1, next_deduction_date: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("rider_installments")
      .select("*, riders(id, employee_id, full_name), deduction_types(id, code, name, description, installmentable, active)")
      .eq("active", true).order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data ?? []).map((r: any) => ({ ...r, rider: r.riders, type: r.deduction_types })));
    setLoading(false);
  };
  useEffect(() => {
    load();
    // Filter sama persis dengan AddTab.save(): jenis apapun yang non-auto-recurring
    // bisa dipakai di sini (installmentable cuma ngatur boleh-tidaknya dicicil,
    // bukan syarat buat muncul di Cicilan Aktif — one-shot pun disimpan di tabel ini).
    (supabase as any).from("deduction_types").select("*").eq("active", true).eq("auto_recurring", false).then(({ data }: any) => setTypes(data ?? []));
  }, []);

  const startEdit = (r: Inst & { rider?: Rider; type?: DType }) => {
    setEditingId(r.id);
    setEf({
      deduction_type_id: r.deduction_type_id, total_amount: r.total_amount,
      installment_count: r.installment_count, next_deduction_date: r.next_deduction_date ?? "",
      notes: r.notes ?? "",
    });
  };

  // Koreksi jadwal cicilan yang salah input (nominal/jumlah cicilan/jenis/
  // tanggal potong berikutnya). per_period_amount dihitung ulang dari
  // total_amount/installment_count — rumus sama persis dengan waktu bikin
  // cicilan baru (AddTab.save), biar konsisten. TIDAK menyentuh riwayat
  // payroll_deductions yang sudah tercatat dari periode sebelumnya — cuma
  // mengubah proyeksi ke depan (potongan otomatis di run berikutnya).
  const saveEdit = async (r: Inst) => {
    if (!ef.deduction_type_id || !ef.total_amount) return toast.error("Lengkapi jenis & nominal potongan");
    if (ef.installment_count < r.installments_paid) {
      return toast.error(`Jumlah cicilan gak boleh kurang dari yang sudah terbayar (${r.installments_paid}).`);
    }
    setSaving(true);
    const per = +(ef.total_amount / ef.installment_count).toFixed(2);
    const { error } = await supabase.from("rider_installments").update({
      deduction_type_id: ef.deduction_type_id, total_amount: ef.total_amount,
      installment_count: ef.installment_count, per_period_amount: per,
      next_deduction_date: ef.next_deduction_date || null, notes: ef.notes || null,
    }).eq("id", r.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Cicilan diperbarui — perubahan ini cuma berlaku ke potongan berikutnya, riwayat yang sudah tercatat tidak berubah.");
    setEditingId(null);
    load();
  };

  const remove = async (r: Inst & { rider?: Rider; type?: DType }) => {
    const paid = (r.installments_paid ?? 0) > 0;
    const desc = paid
      ? `Milik ${r.rider?.full_name}.\n\nSudah terpotong ${r.installments_paid}× di payroll sebelumnya — potongan yang SUDAH tercatat tidak berubah, cicilan ini cuma berhenti & hilang dari daftar.`
      : `Milik ${r.rider?.full_name}.\n\nBelum pernah kepotong, jadi aman dihapus.`;
    if (!(await confirmDialog({ title: `Hapus cicilan ${r.type?.name}?`, description: desc, confirmText: "Hapus" }))) return;
    setDeletingId(r.id);
    const { error } = await supabase.from("rider_installments").delete().eq("id", r.id);
    setDeletingId(null);
    if (error) return toast.error(error.message);
    toast.success("Cicilan dihapus");
    load();
  };

  const { pageSize, setPageSize, page, setPage, totalPages, paged, from, to, total } = usePagination(rows, 10);

  return (
    <div>
      {!loading && rows.length > 0 && (
        <div className="flex justify-end mb-2"><PageSizeSelect pageSize={pageSize} setPageSize={setPageSize} /></div>
      )}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr><th className="p-3">Rider</th><th>Jenis</th><th>Total</th><th>Per Periode</th><th>Progress</th><th>Potong Berikutnya</th><th></th></tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Tidak ada cicilan aktif</td></tr>
            : paged.map((r) => (
              <Fragment key={r.id}>
                <tr className="border-t border-border">
                  <td className="p-3"><div className="font-medium">{r.rider?.full_name}</div><div className="text-xs text-muted-foreground">{r.rider?.employee_id}</div></td>
                  <td>{r.type?.name}</td>
                  <td>Rp{Number(r.total_amount).toLocaleString("id-ID")}</td>
                  <td>Rp{Number(r.per_period_amount).toLocaleString("id-ID")}</td>
                  <td>{r.installments_paid}/{r.installment_count}</td>
                  <td>{r.next_deduction_date ?? "—"}</td>
                  <td className="text-right pr-3 space-x-1">
                    <button onClick={() => startEdit(r)} className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-primary" title="Edit cicilan">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => remove(r)} disabled={deletingId === r.id}
                      className="p-1.5 hover:bg-muted rounded text-destructive disabled:opacity-50" title="Hapus cicilan">
                      {deletingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </td>
                </tr>
                {editingId === r.id && (
                  <tr className="border-t border-border/60 bg-muted/20">
                    <td colSpan={7} className="p-3">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 items-end text-sm">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Jenis</label>
                          <select value={ef.deduction_type_id} onChange={(e) => setEf({ ...ef, deduction_type_id: e.target.value })}
                            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                            {/* Jenis yang lagi kepake tapi udah nonaktif/gak-bisa-dicicil tetep
                                ditampilin (biar select-nya gak diam-diam kosong), taruh di atas. */}
                            {r.type && !types.some((t) => t.id === r.deduction_type_id) && (
                              <option value={r.type.id}>{r.type.name} (nonaktif)</option>
                            )}
                            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Total (Rp)</label>
                          <input inputMode="numeric" value={ef.total_amount ? ef.total_amount.toLocaleString("id-ID") : ""}
                            onChange={(e) => setEf({ ...ef, total_amount: parseRupiah(e.target.value) })}
                            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Jumlah Cicilan</label>
                          <input type="number" min={r.installments_paid || 1} value={ef.installment_count}
                            onChange={(e) => setEf({ ...ef, installment_count: +e.target.value })}
                            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                          <p className="text-[11px] text-muted-foreground mt-0.5">Per periode: Rp{(ef.total_amount / Math.max(1, ef.installment_count)).toLocaleString("id-ID")}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Potong Berikutnya</label>
                          <input type="date" value={ef.next_deduction_date} onChange={(e) => setEf({ ...ef, next_deduction_date: e.target.value })}
                            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Catatan</label>
                          <input value={ef.notes} onChange={(e) => setEf({ ...ef, notes: e.target.value })}
                            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 mt-2.5">
                        <button onClick={() => setEditingId(null)} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted">Batal</button>
                        <button onClick={() => saveEdit(r)} disabled={saving} className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-50">
                          {saving ? "Menyimpan…" : "Simpan"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && <PaginationBar page={page} totalPages={totalPages} setPage={setPage} from={from} to={to} total={total} />}
    </div>
  );
}
