import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/clients")({ component: ClientsPage });

type Client = {
  id: string; code: string; name: string;
  address: string | null; contact_person: string | null; phone: string | null; active: boolean;
};

function ClientsPage() {
  const [rows, setRows] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Client | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("clients").select("*").order("name");
    if (error) toast.error(error.message); else setRows(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    if (!confirm("Hapus client ini?")) return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Client dihapus"); load();
  };

  return (
    <AdminLayout title="Clients">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{rows.length} client</p>
        <button onClick={() => { setEdit(null); setOpen(true); }}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm">
          <Plus className="w-4 h-4" /> Tambah Client
        </button>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr><th className="p-3">Kode</th><th>Nama</th><th>Contact</th><th>Telepon</th><th>Status</th><th className="text-right pr-3">Aksi</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground"><Loader2 className="w-4 h-4 inline animate-spin" /> Memuat…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Belum ada client</td></tr>
            ) : rows.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="p-3 font-mono text-xs">{c.code}</td>
                <td>{c.name}</td>
                <td>{c.contact_person ?? "—"}</td>
                <td>{c.phone ?? "—"}</td>
                <td><span className={`px-2 py-0.5 rounded-full text-xs ${c.active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{c.active ? "Aktif" : "Nonaktif"}</span></td>
                <td className="text-right pr-3">
                  <button onClick={() => { setEdit(c); setOpen(true); }} className="p-1.5 hover:bg-muted rounded"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(c.id)} className="p-1.5 hover:bg-muted rounded text-red-600"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <ClientModal initial={edit} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
    </AdminLayout>
  );
}

function ClientModal({ initial, onClose, onSaved }: { initial: Client | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: initial?.code ?? "", name: initial?.name ?? "",
    address: initial?.address ?? "", contact_person: initial?.contact_person ?? "",
    phone: initial?.phone ?? "", active: initial?.active ?? true,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) return toast.error("Kode & nama wajib");
    setSaving(true);
    const payload = { ...form, address: form.address || null, contact_person: form.contact_person || null, phone: form.phone || null };
    const { error } = initial
      ? await supabase.from("clients").update(payload).eq("id", initial.id)
      : await supabase.from("clients").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Tersimpan"); onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit" : "Tambah"} Client</h2>
        <div className="space-y-3 text-sm">
          {(["code","name","address","contact_person","phone"] as const).map((f) => (
            <div key={f}>
              <label className="font-medium capitalize">{f.replace("_", " ")}</label>
              <input value={(form as any)[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
            </div>
          ))}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Aktif
          </label>
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
