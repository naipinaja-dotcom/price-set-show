import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { usePostHog } from "@posthog/react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { PageSizeSelect, PaginationBar } from "@/components/pagination-bar";
import { usePagination } from "@/lib/use-pagination";
import { toCSV, downloadCSV } from "@/lib/csv";
import { confirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { Download, Loader2, Trash2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/admin/invoices")({ component: InvoicesPage });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Invoice = {
  id: string;
  client_id: string;
  invoice_date: string;
  period_start: string | null;
  period_end: string | null;
  calculation_type: string | null;
  scheme_name: string | null;
  base_amount: number;
  surcharge_amount: number;
  total_amount: number;
  status: string;
  created_at: string;
};
type Client = { id: string; name: string };

function InvoicesPage() {
  const posthog = usePostHog();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientFilter, setClientFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: inv, error }, { data: cl }] = await Promise.all([
      sb.from("invoice_details").select("*").order("created_at", { ascending: false }),
      supabase.from("clients").select("id, name").order("name"),
    ]);
    if (error) toast.error(error.message);
    setInvoices(inv ?? []);
    setClients(cl ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const clientName = (id: string) =>
    clients.find((c) => c.id === id)?.name ?? "(client tak dikenal)";

  const filtered = invoices.filter((i) => !clientFilter || i.client_id === clientFilter);
  const { pageSize, setPageSize, page, setPage, totalPages, paged, from, to, total } =
    usePagination(filtered, 20);

  const finalize = async (i: Invoice) => {
    setBusyId(i.id);
    const { error } = await sb
      .from("invoice_details")
      .update({ status: "finalized" })
      .eq("id", i.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    posthog.capture("invoice_finalized", {
      calculation_type: i.calculation_type,
      total_amount: i.total_amount,
      period_start: i.period_start,
      period_end: i.period_end,
    });
    toast.success("Invoice dikunci sebagai final");
    load();
  };

  const remove = async (i: Invoice) => {
    if (
      !(await confirmDialog({
        title: "Hapus invoice?",
        description: `Invoice ${clientName(i.client_id)} periode ${i.period_start ?? "?"} → ${i.period_end ?? "?"} akan dihapus permanen.`,
        confirmText: "Hapus",
        danger: true,
      }))
    )
      return;
    setBusyId(i.id);
    const { error } = await sb.from("invoice_details").delete().eq("id", i.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("Invoice dihapus");
    load();
  };

  const exportCSV = () => {
    const header = [
      "Client",
      "Periode Dari",
      "Periode Sampai",
      "Tipe Skema",
      "Subtotal",
      "Tambahan",
      "Total",
      "Status",
      "Tanggal Invoice",
    ];
    const data = filtered.map((i) => [
      clientName(i.client_id),
      i.period_start ?? "",
      i.period_end ?? "",
      i.scheme_name ?? i.calculation_type ?? "",
      i.base_amount,
      i.surcharge_amount,
      i.total_amount,
      i.status,
      i.invoice_date,
    ]);
    downloadCSV("invoices.csv", toCSV([header, ...data]));
  };

  const grandTotal = filtered.reduce((s, i) => s + Number(i.total_amount), 0);

  return (
    <AdminLayout
      title="Invoices"
      subtitle="Invoice client yang sudah di-commit dari Hitung Fee (sisi revenue)"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm min-w-[220px]"
        >
          <option value="">— semua client —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && <PageSizeSelect pageSize={pageSize} setPageSize={setPageSize} />}
          <button
            onClick={exportCSV}
            disabled={!filtered.length}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-3">Client</th>
              <th className="px-3">Periode</th>
              <th className="px-3">Tipe Skema</th>
              <th className="px-3 text-right">Subtotal</th>
              <th className="px-3 text-right">Tambahan</th>
              <th className="px-3 text-right">Total</th>
              <th className="px-3">Status</th>
              <th className="px-3 text-right pr-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="p-6 text-center">
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  Belum ada invoice — commit dari halaman Hitung Fee dengan skema Client.
                </td>
              </tr>
            ) : (
              paged.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="p-3 font-medium">{clientName(i.client_id)}</td>
                  <td className="px-3 tabular-nums">
                    {i.period_start ?? "—"} → {i.period_end ?? "—"}
                  </td>
                  <td className="px-3">{i.scheme_name ?? i.calculation_type ?? "—"}</td>
                  <td className="px-3 text-right tabular-nums">
                    Rp{Number(i.base_amount).toLocaleString("id-ID")}
                  </td>
                  <td className="px-3 text-right tabular-nums">
                    Rp{Number(i.surcharge_amount).toLocaleString("id-ID")}
                  </td>
                  <td className="px-3 text-right font-semibold tabular-nums">
                    Rp{Number(i.total_amount).toLocaleString("id-ID")}
                  </td>
                  <td className="px-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${i.status === "finalized" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
                    >
                      {i.status === "finalized" ? "Final" : "Draft"}
                    </span>
                  </td>
                  <td className="px-3 text-right pr-3">
                    {i.status !== "finalized" && (
                      <button
                        onClick={() => finalize(i)}
                        disabled={busyId === i.id}
                        title="Kunci sebagai final"
                        className="p-1.5 hover:bg-success/10 text-success rounded disabled:opacity-50 mr-1"
                      >
                        {busyId === i.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => remove(i)}
                      disabled={busyId === i.id}
                      title="Hapus"
                      className="p-1.5 hover:bg-destructive/10 text-destructive rounded disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="bg-muted font-semibold">
              <tr>
                <td className="p-3" colSpan={5}>
                  GRAND TOTAL
                </td>
                <td className="px-3 text-right tabular-nums">
                  Rp{grandTotal.toLocaleString("id-ID")}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {filtered.length > 0 && (
        <PaginationBar
          page={page}
          totalPages={totalPages}
          setPage={setPage}
          from={from}
          to={to}
          total={total}
        />
      )}
      <p className="text-xs text-muted-foreground mt-2">
        Draft masih bisa dihapus/diubah dari Hitung Fee (commit ulang). "Final" cuma penanda status
        — belum ada proteksi hapus, dipakai sebagai pengingat manual buat finance.
      </p>
    </AdminLayout>
  );
}
