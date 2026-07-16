import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { PageSizeSelect, PaginationBar } from "@/components/pagination-bar";
import { usePagination } from "@/lib/use-pagination";
import { fetchAllRows } from "@/lib/fetch-all";
import { Plus, Pencil, Trash2, Loader2, Search, Download } from "lucide-react";

export const Route = createFileRoute("/admin/clients")({ component: ClientsPage });

type Client = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  contact_person: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
};

// Map calc_type → label
const SCHEME_LABEL: Record<string, string> = {
  flat_unit: "Flat per Unit",
  tier: "Tier Jarak",
  tier_daily: "Tier Harian",
  daily_attendance: "Daily / Attendance",
  threshold_multiple: "Threshold Kelipatan",
  hybrid: "Hybrid",
};

function schemeLabel(type: string | undefined) {
  if (!type) return null;
  return SCHEME_LABEL[type] ?? type;
}

function downloadCSV(rows: Client[], schemeOf: Map<string, string>) {
  const header = ["No", "Kode", "Client", "Skema Revenue", "Dibuat"];
  const lines = rows.map((c, i) =>
    [
      i + 1,
      c.code,
      c.name,
      schemeOf.get(c.id) ?? "—",
      c.created_at ? new Date(c.created_at).toLocaleDateString("id-ID") : "—",
    ]
      .map(String)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "clients.csv";
  a.click();
}

function ClientsPage() {
  const [rows, setRows] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Client | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"assisted" | "self-service">("assisted");
  // client_id → calc_type of their revenue (client) pricing scheme
  const [schemeOf, setSchemeOf] = useState<Map<string, string>>(new Map());

  const load = async () => {
    setLoading(true);
    try {
      const [clientData, schemes] = await Promise.all([
        fetchAllRows<Client>((c, from, to) =>
          c
            .from("clients")
            .select("id, code, name, address, contact_person, phone, active, created_at")
            .order("name")
            .range(from, to),
        ),
        fetchAllRows<{ client_id: string | null; calc_type: string }>((c, from, to) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (c as any)
            .from("pricing_schemes")
            .select("client_id, calc_type")
            .eq("scheme_for", "client")
            .range(from, to),
        ),
      ]);
      setRows(clientData);
      const map = new Map<string, string>();
      for (const s of schemes) if (s.client_id) map.set(s.client_id, s.calc_type);
      setSchemeOf(map);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memuat data client");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const remove = async (id: string) => {
    if (
      !(await confirmDialog({
        title: "Hapus client ini?",
        description: "Client akan dihapus permanen.",
        confirmText: "Hapus",
      }))
    )
      return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Client dihapus");
    load();
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [rows, search]);

  const { pageSize, setPageSize, page, setPage, totalPages, paged, from, to, total } =
    usePagination(filtered, 10);

  return (
    <AdminLayout title="Client" subtitle={`${rows.length} client terdaftar`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari client…"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex-1" />
        <PageSizeSelect pageSize={pageSize} setPageSize={setPageSize} />
        <button
          onClick={() => downloadCSV(filtered, schemeOf)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> Download
        </button>
        <button
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" /> Tambah
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary text-primary-foreground text-[11px] font-semibold uppercase tracking-wide text-left">
              <th className="px-3 py-2.5 w-10">No</th>
              <th className="px-3 py-2.5 w-28">Kode Client</th>
              <th className="px-3 py-2.5">Client</th>
              <th className="px-3 py-2.5">Skema Revenue</th>
              <th className="px-3 py-2.5">Tanggal Dibuat</th>
              <th className="px-3 py-2.5 text-right w-20">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  <Loader2 className="w-4 h-4 inline animate-spin mr-1" />
                  Memuat…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  Belum ada client
                </td>
              </tr>
            ) : (
              paged.map((c, i) => {
                const scheme = schemeLabel(schemeOf.get(c.id));
                return (
                  <tr
                    key={c.id}
                    className={`border-t border-border hover:bg-muted/30 transition-colors ${i % 2 === 1 ? "bg-muted/10" : "bg-card"}`}
                  >
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums text-[12px]">
                      {from + i}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12px] font-semibold">{c.code}</td>
                    <td className="px-3 py-2.5 font-medium">{c.name}</td>
                    <td className="px-3 py-2.5">
                      {scheme ? (
                        <span className="text-[11px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          {scheme}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                      {c.created_at
                        ? new Date(c.created_at).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => {
                          setEdit(c);
                          setOpen(true);
                        }}
                        className="p-1.5 hover:bg-muted rounded-md transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => remove(c.id)}
                        className="p-1.5 hover:bg-muted rounded-md text-destructive transition-colors"
                        title="Hapus"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
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

      {open && (
        <ClientModal
          initial={edit}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            load();
          }}
        />
      )}
    </AdminLayout>
  );
}

function ClientModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Client | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    code: initial?.code ?? "",
    name: initial?.name ?? "",
    address: initial?.address ?? "",
    contact_person: initial?.contact_person ?? "",
    phone: initial?.phone ?? "",
    active: initial?.active ?? true,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) return toast.error("Kode & nama wajib");
    setSaving(true);
    const payload = {
      ...form,
      address: form.address || null,
      contact_person: form.contact_person || null,
      phone: form.phone || null,
    };
    const { error } = initial
      ? await supabase.from("clients").update(payload).eq("id", initial.id)
      : await supabase.from("clients").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Tersimpan");
    onSaved();
  };

  const FIELDS = [
    { key: "code", label: "Kode Client" },
    { key: "name", label: "Nama Client" },
    { key: "address", label: "Alamat" },
    { key: "contact_person", label: "Contact Person" },
    { key: "No. Telepon", label: "Telepon" },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-4">{initial ? "Edit" : "Tambah"} Client</h2>
        <div className="space-y-3 text-sm">
          {(["code", "name", "address", "contact_person", "phone"] as const).map((f) => (
            <div key={f}>
              <label className="text-xs text-muted-foreground font-medium capitalize">
                {f.replace(/_/g, " ")}
              </label>
              <input
                value={(form as any)[f]}
                onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />{" "}
            Aktif
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
          >
            Batal
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
