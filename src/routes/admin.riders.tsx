import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { PageSizeSelect, PaginationBar } from "@/components/pagination-bar";
import { usePagination } from "@/lib/use-pagination";
import { parseCSV, toCSV, downloadCSV } from "@/lib/csv";
import { toast } from "sonner";
import { Plus, Pencil, Loader2, AlertCircle, Upload, Download, X, Search } from "lucide-react";

export const Route = createFileRoute("/admin/riders")({ component: RidersPage });

type RiderStatus = "ready_to_work" | "active" | "resign" | "blacklisted" | "withdrawn" | "suspended";
const STATUS_LABEL: Record<RiderStatus, string> = {
  ready_to_work: "Ready to Work", active: "Active", resign: "Resign",
  blacklisted: "Blacklisted", withdrawn: "Withdrawn", suspended: "Suspend",
};
const STATUS_ORDER: RiderStatus[] = ["ready_to_work", "active", "resign", "blacklisted", "withdrawn", "suspended"];
type Rider = {
  id: string; employee_id: string; full_name: string; phone: string | null; email: string | null;
  client_id: string | null; status: string; join_date: string | null;
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
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");

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

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const toggleStatus = async (r: Rider) => {
    const next: RiderStatus = r.status === "active" ? "withdrawn" : "active";
    setTogglingId(r.id);
    const { error } = await supabase.from("riders").update({ status: next }).eq("id", r.id);
    setTogglingId(null);
    if (error) return toast.error(error.message);
    toast.success(`${r.full_name} → ${STATUS_LABEL[next]}`);
    load();
  };

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) =>
    (filter === "all" || r.status === filter) &&
    (!q || r.full_name.toLowerCase().includes(q) || r.employee_id.toLowerCase().includes(q))
  );
  const { pageSize, setPageSize, page, setPage, totalPages, paged, from, to, total } = usePagination(filtered, 10);
  const statusBadge = (s: string) => {
    const map: Record<RiderStatus, string> = {
      ready_to_work: "bg-primary/10 text-primary",
      active: "bg-success/10 text-success",
      resign: "bg-muted text-muted-foreground",
      withdrawn: "bg-warning/10 text-warning",
      blacklisted: "bg-destructive/10 text-destructive",
      suspended: "bg-destructive/10 text-destructive",
    };
    const cls = map[s as RiderStatus] ?? "bg-muted text-muted-foreground";
    const label = STATUS_LABEL[s as RiderStatus] ?? s.replace(/_/g, " ");
    return <span className={`px-2 py-0.5 rounded-full text-xs inline-flex items-center gap-1 ${cls}`}>
      {(s === "blacklisted" || s === "suspended") && <AlertCircle className="w-3 h-3" />}{label}
    </span>;
  };

  return (
    <AdminLayout title="Riders">
      <div className="relative mb-3 max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama atau kode MTR…"
          className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          {(["all", ...STATUS_ORDER] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1 text-xs rounded-full border ${filter === s ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>
              {s === "all" ? "Semua" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <PageSizeSelect pageSize={pageSize} setPageSize={setPageSize} />
          <button onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
            <Upload className="w-4 h-4" /> Import CSV
          </button>
          <button onClick={() => { setEdit(null); setOpen(true); }}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm">
            <Plus className="w-4 h-4" /> Tambah Rider
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr><th className="p-3">Employee ID</th><th>Nama</th><th>Client</th><th>Telepon</th><th>Status</th><th className="text-right pr-3">Aksi</th></tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
            : filtered.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Tidak ada rider</td></tr>
            : paged.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 font-mono text-xs">{r.employee_id}</td>
                <td>{r.full_name}</td>
                <td>{clients.find((c) => c.id === r.client_id)?.name ?? "—"}</td>
                <td>{r.phone ?? "—"}</td>
                <td>{statusBadge(r.status)}</td>
                <td className="text-right pr-3">
                  <button onClick={() => toggleStatus(r)} disabled={togglingId === r.id} title={r.status === "active" ? "Nonaktifkan rider" : "Aktifkan rider"}
                    className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted disabled:opacity-50 mr-1">
                    {togglingId === r.id ? "…" : r.status === "active" ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                  <button onClick={() => { setEdit(r); setOpen(true); }} className="p-1.5 hover:bg-muted rounded" title="Edit"><Pencil className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && <PaginationBar page={page} totalPages={totalPages} setPage={setPage} from={from} to={to} total={total} />}
      {open && <RiderModal initial={edit} clients={clients} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
      {importOpen && <RiderImportModal clients={clients} onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); load(); }} />}
    </AdminLayout>
  );
}

function RiderImportModal({ clients, onClose, onDone }:
  { clients: Client[]; onClose: () => void; onDone: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; warnings: string[] } | null>(null);

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const FIELD_ALIASES: Record<string, string[]> = {
    employee_id: ["employeeid", "employee", "idkaryawan", "kodekaryawan", "kodemitra", "kodemtr", "mtrcode"],
    full_name: ["fullname", "name", "nama", "namalengkap"],
    phone: ["phone", "telepon", "telp", "hp", "nohp", "notelp", "nomorwhatsapp", "whatsapp"],
    email: ["email"],
    client: ["client", "klien", "clientpitstop"],
    status: ["status"],
    bank_name: ["bankname", "bank", "namabank"],
    bank_account: ["bankaccount", "norekening", "nomorrekening", "rekening", "norek", "account"],
    notes: ["notes", "catatan", "note"],
  };

  const onFile = async (file: File) => {
    setResult(null);
    const text = await file.text();
    const parsed = parseCSV(text);
    if (parsed.length < 2) return toast.error("CSV kosong atau cuma ada header");
    const headers = parsed[0];
    const colMap: Record<number, string> = {};
    headers.forEach((h, i) => {
      const nh = norm(h);
      for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
        if (nh === norm(field) || aliases.includes(nh)) { colMap[i] = field; break; }
      }
    });
    const objs = parsed.slice(1)
      .filter((r) => r.some((c) => c.trim()))
      .map((r) => {
        const o: Record<string, string> = {};
        r.forEach((val, i) => { if (colMap[i]) o[colMap[i]] = val.trim(); });
        return o;
      });
    setRows(objs);
    setFileName(file.name);
  };

  const template = () => {
    downloadCSV("template-rider.csv", toCSV([
      ["employee_id", "full_name", "phone", "email", "client", "status", "bank_name", "bank_account", "notes"],
      ["RD001", "Budi Santoso", "08123456789", "budi@mail.com", "Alfagift", "active", "BCA", "1234567890", ""],
    ]));
  };

  const doImport = async () => {
    if (rows.length === 0) return toast.error("Upload CSV dulu");
    setImporting(true);
    const warnings: string[] = [];
    const clientByName = new Map(clients.map((c) => [c.name.trim().toLowerCase(), c.id]));
    const validStatus: string[] = STATUS_ORDER;
    const STATUS_ALIASES: Record<string, RiderStatus> = {
      ready_to_work: "ready_to_work", ready: "ready_to_work",
      active: "active",
      resign: "resign", resigned: "resign", mengundurkandiri: "resign",
      blacklisted: "blacklisted", blacklist: "blacklisted", banned: "blacklisted",
      withdrawn: "withdrawn",
      suspended: "suspended", suspend: "suspended",
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any[] = [];
    rows.forEach((o, idx) => {
      const line = idx + 2;
      if (!o.employee_id || !o.full_name) { warnings.push(`Baris ${line}: employee_id / nama kosong — dilewat`); return; }
      let client_id: string | null = null;
      if (o.client) {
        const hit = clientByName.get(o.client.trim().toLowerCase());
        if (hit) client_id = hit;
        else warnings.push(`Baris ${line}: client "${o.client}" tidak ditemukan — dikosongkan`);
      }
      const rawStatus = (o.status || "active").toLowerCase().replace(/\s+/g, "_");
      let status: string = STATUS_ALIASES[rawStatus] ?? rawStatus;
      if (!validStatus.includes(status)) { warnings.push(`Baris ${line}: status "${o.status}" tidak dikenal — pakai "active"`); status = "active"; }
      payload.push({
        employee_id: o.employee_id, full_name: o.full_name,
        phone: o.phone || null, email: o.email || null, client_id, status,
        bank_name: o.bank_name || null, bank_account: o.bank_account || null, notes: o.notes || null,
      });
    });
    if (payload.length === 0) { setImporting(false); return toast.error("Tidak ada baris valid untuk diimpor"); }
    let ok = 0;
    for (let i = 0; i < payload.length; i += 200) {
      const chunk = payload.slice(i, i + 200);
      const { error } = await supabase.from("riders").upsert(chunk, { onConflict: "employee_id" });
      if (error) { setImporting(false); return toast.error(`Gagal simpan: ${error.message}`); }
      ok += chunk.length;
    }
    setImporting(false);
    setResult({ ok, warnings });
    toast.success(`${ok} rider tersimpan`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg w-full max-w-lg p-5 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">Import Rider dari CSV</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Upload file CSV berisi daftar rider. Wajib ada kolom <b>employee_id</b> (kode MTR) & <b>full_name</b>. Kolom lain — termasuk <b>client</b> — opsional.
          Employee ID yang sama akan di-update (bukan dobel).
        </p>
        <p className="text-xs text-muted-foreground mb-4 -mt-2">
          Catatan: rider TIDAK terikat 1 client — dia bisa jalan untuk banyak client. Client-nya nempel di tiap data pengiriman/absensi, bukan di rider. Import ini cuma buat lengkapi data profil (nama, bank, dll); rider baru juga otomatis kebuat sendiri saat kamu upload data pengiriman/absensi pakai kode MTR yang belum terdaftar.
        </p>

        <button onClick={template} className="inline-flex items-center gap-2 text-xs text-primary mb-3 hover:underline">
          <Download className="w-3.5 h-3.5" /> Download template CSV
        </button>

        <label className="block border border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:bg-muted/40">
          <input type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
          <div className="text-sm">{fileName ? <b>{fileName}</b> : "Klik untuk pilih file CSV"}</div>
          {rows.length > 0 && <div className="text-xs text-muted-foreground mt-1">{rows.length} baris terbaca</div>}
        </label>

        {result && (
          <div className="mt-4 text-sm">
            <div className="text-success font-medium">✓ {result.ok} rider berhasil disimpan</div>
            {result.warnings.length > 0 && (
              <div className="mt-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning max-h-40 overflow-auto">
                <div className="font-medium mb-1">{result.warnings.length} peringatan:</div>
                {result.warnings.map((w, i) => <div key={i}>• {w}</div>)}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-border">
            {result ? "Tutup" : "Batal"}
          </button>
          {!result && (
            <button onClick={doImport} disabled={importing || rows.length === 0}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importing ? "Mengimpor…" : `Import ${rows.length || ""} Rider`}
            </button>
          )}
          {result && (
            <button onClick={onDone} className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground">Selesai</button>
          )}
        </div>
      </div>
    </div>
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
              {!STATUS_ORDER.includes(f.status) && (
                <option value={f.status}>{f.status} (status lama, pilih yang baru)</option>
              )}
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
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
