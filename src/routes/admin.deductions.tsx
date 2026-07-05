import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { parseRupiah } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, X } from "lucide-react";

export const Route = createFileRoute("/admin/deductions")({ component: DeductionsPage });

type DType = { id: string; code: string; name: string; description: string | null; installmentable: boolean; active: boolean };
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
  const [nf, setNf] = useState({ code: "", name: "", description: "", installmentable: false });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("deduction_types").select("*").order("name");
    if (error) toast.error(error.message); else setRows(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!nf.code.trim() || !nf.name.trim()) return toast.error("Kode & nama wajib diisi");
    setSaving(true);
    const { error } = await supabase.from("deduction_types").insert({
      code: nf.code.trim().toUpperCase(),
      name: nf.name.trim(),
      description: nf.description.trim() || null,
      installmentable: nf.installmentable,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Jenis potongan ditambahkan");
    setNf({ code: "", name: "", description: "", installmentable: false });
    setAdding(false);
    load();
  };
  const remove = async (id: string) => {
    if (!confirm("Hapus jenis potongan?")) return;
    const { error } = await supabase.from("deduction_types").delete().eq("id", id);
    if (error) return toast.error(error.message); load();
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
            <input type="checkbox" checked={nf.installmentable} onChange={(e) => setNf({ ...nf, installmentable: e.target.checked })} /> Bisa dicicil
          </label>
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
          <thead className="bg-muted text-left"><tr><th className="p-3">Kode</th><th>Nama</th><th>Bisa Dicicil</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
            : rows.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Belum ada jenis potongan</td></tr>
            : rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 font-mono text-xs">{r.code}</td>
                <td>{r.name}</td>
                <td>{r.installmentable ? "Ya" : "Tidak"}</td>
                <td>{r.active ? "Aktif" : "Nonaktif"}</td>
                <td className="text-right pr-3"><button onClick={() => remove(r.id)} className="p-1.5 hover:bg-muted rounded text-red-600"><Trash2 className="w-4 h-4" /></button></td>
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
    rider_id: "", deduction_type_id: "", total_amount: 0,
    start_date: new Date().toISOString().slice(0,10),
    installment: false, installment_count: 1, notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("riders").select("id, employee_id, full_name").order("full_name").then(({ data }) => setRiders(data ?? []));
    supabase.from("deduction_types").select("*").eq("active", true).then(({ data }) => setTypes(data ?? []));
  }, []);

  const save = async () => {
    if (!f.rider_id || !f.deduction_type_id || !f.total_amount) return toast.error("Lengkapi data");
    setSaving(true);
    const count = f.installment ? Math.max(1, f.installment_count) : 1;
    const per = +(f.total_amount / count).toFixed(2);
    const { error } = await supabase.from("rider_installments").insert({
      rider_id: f.rider_id, deduction_type_id: f.deduction_type_id,
      total_amount: f.total_amount, installment_count: count, per_period_amount: per,
      start_date: f.start_date, next_deduction_date: f.start_date,
      notes: f.notes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Potongan ditambahkan");
    setF({ ...f, total_amount: 0, notes: "" });
  };

  return (
    <div className="max-w-lg space-y-3 text-sm">
      <div>
        <label className="font-medium">Rider</label>
        <select value={f.rider_id} onChange={(e) => setF({ ...f, rider_id: e.target.value })}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2">
          <option value="">— pilih rider —</option>
          {riders.map((r) => <option key={r.id} value={r.id}>{r.employee_id} — {r.full_name}</option>)}
        </select>
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

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("rider_installments")
      .select("*, riders(id, employee_id, full_name), deduction_types(id, code, name, description, installmentable, active)")
      .eq("active", true).order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data ?? []).map((r: any) => ({ ...r, rider: r.riders, type: r.deduction_types })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const remove = async (r: Inst & { rider?: Rider; type?: DType }) => {
    const paid = (r.installments_paid ?? 0) > 0;
    const msg = paid
      ? `Hapus cicilan "${r.type?.name}" milik ${r.rider?.full_name}?\n\nSudah terpotong ${r.installments_paid}× di payroll sebelumnya — potongan yang SUDAH tercatat tidak berubah, cicilan ini cuma berhenti & hilang dari daftar.`
      : `Hapus cicilan "${r.type?.name}" milik ${r.rider?.full_name}?\n\nBelum pernah kepotong, jadi aman dihapus.`;
    if (!confirm(msg)) return;
    setDeletingId(r.id);
    const { error } = await supabase.from("rider_installments").delete().eq("id", r.id);
    setDeletingId(null);
    if (error) return toast.error(error.message);
    toast.success("Cicilan dihapus");
    load();
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left">
          <tr><th className="p-3">Rider</th><th>Jenis</th><th>Total</th><th>Per Periode</th><th>Progress</th><th>Potong Berikutnya</th><th></th></tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={7} className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
          : rows.length === 0 ? <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Tidak ada cicilan aktif</td></tr>
          : rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="p-3"><div className="font-medium">{r.rider?.full_name}</div><div className="text-xs text-muted-foreground">{r.rider?.employee_id}</div></td>
              <td>{r.type?.name}</td>
              <td>Rp{Number(r.total_amount).toLocaleString("id-ID")}</td>
              <td>Rp{Number(r.per_period_amount).toLocaleString("id-ID")}</td>
              <td>{r.installments_paid}/{r.installment_count}</td>
              <td>{r.next_deduction_date ?? "—"}</td>
              <td className="text-right pr-3">
                <button onClick={() => remove(r)} disabled={deletingId === r.id}
                  className="p-1.5 hover:bg-muted rounded text-red-600 disabled:opacity-50" title="Hapus cicilan">
                  {deletingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
