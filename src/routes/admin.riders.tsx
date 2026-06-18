import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { toast } from "sonner";
import { Plus, Pencil, Loader2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/admin/riders")({ component: RidersPage });

type RiderStatus = "active" | "inactive" | "pending_review" | "suspended";
type Rider = {
  id: string; employee_id: string; full_name: string; phone: string | null; email: string | null;
  client_id: string | null; status: RiderStatus; join_date: string | null;
  bank_name: string | null; bank_account: string | null; notes: string | null;
};
type Client = { id: string; name: string };

function RidersPage() {
  const [rows, setRows] = useState<Rider[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [filter, setFilter] = useState<"all" | RiderStatus>("all");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Rider | null>(null);

  const load = async () => {
    setLoading(true);
    const [r, c] = await Promise.all([
      supabase.from("riders").select("*").order("full_name"),
      supabase.from("clients").select("id, name").order("name"),
    ]);
    if (r.error) toast.error(r.error.message); else setRows(r.data ?? []);
    if (!c.error) setClients(c.data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const statusBadge = (s: RiderStatus) => {
    const map: Record<RiderStatus, string> = {
      active: "bg-green-100 text-green-700",
      inactive: "bg-muted text-muted-foreground",
      pending_review: "bg-amber-100 text-amber-700",
      suspended: "bg-red-100 text-red-700",
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs inline-flex items-center gap-1 ${map[s]}`}>
      {s === "pending_review" && <AlertCircle className="w-3 h-3" />}{s.replace("_", " ")}
    </span>;
  };

  return (
    <AdminLayout title="Riders">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-2">
          {(["all","active","pending_review","inactive","suspended"] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1 text-xs rounded-full border ${filter === s ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>
              {s === "all" ? "Semua" : s.replace("_", " ")}
            </button>
          ))}
        </div>
        <button onClick={() => { setEdit(null); setOpen(true); }}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm">
          <Plus className="w-4 h-4" /> Tambah Rider
        </button>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr><th className="p-3">Employee ID</th><th>Nama</th><th>Client</th><th>Telepon</th><th>Status</th><th className="text-right pr-3">Aksi</th></tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
            : filtered.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Tidak ada rider</td></tr>
            : filtered.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 font-mono text-xs">{r.employee_id}</td>
                <td>{r.full_name}</td>
                <td>{clients.find((c) => c.id === r.client_id)?.name ?? "—"}</td>
                <td>{r.phone ?? "—"}</td>
                <td>{statusBadge(r.status)}</td>
                <td className="text-right pr-3">
                  <button onClick={() => { setEdit(r); setOpen(true); }} className="p-1.5 hover:bg-muted rounded"><Pencil className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <RiderModal initial={edit} clients={clients} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
    </AdminLayout>
  );
}

function RiderModal({ initial, clients, onClose, onSaved }:
  { initial: Rider | null; clients: Client[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    employee_id: initial?.employee_id ?? "",
    full_name: initial?.full_name ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    client_id: initial?.client_id ?? "",
    status: (initial?.status ?? "active") as RiderStatus,
    bank_name: initial?.bank_name ?? "",
    bank_account: initial?.bank_account ?? "",
    notes: initial?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!f.employee_id || !f.full_name) return toast.error("Employee ID & nama wajib");
    setSaving(true);
    const payload: any = { ...f, client_id: f.client_id || null };
    ["phone","email","bank_name","bank_account","notes"].forEach((k) => { if (!payload[k]) payload[k] = null; });
    const { error } = initial
      ? await supabase.from("riders").update(payload).eq("id", initial.id)
      : await supabase.from("riders").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Tersimpan"); onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg w-full max-w-lg p-5 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit" : "Tambah"} Rider</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Employee ID" value={f.employee_id} onChange={(v) => setF({ ...f, employee_id: v })} />
          <Field label="Nama Lengkap" value={f.full_name} onChange={(v) => setF({ ...f, full_name: v })} />
          <Field label="Telepon" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
          <Field label="Email" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
          <div>
            <label className="font-medium">Client</label>
            <select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2">
              <option value="">—</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="font-medium">Status</label>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as RiderStatus })}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2">
              {["active","pending_review","inactive","suspended"].map((s) => <option key={s} value={s}>{s.replace("_"," ")}</option>)}
            </select>
          </div>
          <Field label="Bank" value={f.bank_name} onChange={(v) => setF({ ...f, bank_name: v })} />
          <Field label="No. Rekening" value={f.bank_account} onChange={(v) => setF({ ...f, bank_account: v })} />
          <div className="col-span-2">
            <label className="font-medium">Catatan</label>
            <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })}
              rows={2} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-border">Batal</button>
          <button onClick={save} disabled={saving} className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50">
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="font-medium">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
    </div>
  );
}
