import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin-layout";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { useEffect, useState } from "react";
import { listPricingSchemes, deletePricingScheme, listClients, type MockClient } from "@/lib/pricing-store";
import type { PricingScheme } from "@/lib/pricing-types";
import { PRICING_TYPES } from "@/lib/pricing-types";
import { formatTanggal } from "@/lib/format";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/pricing/")({
  component: PricingListPage,
});

function PricingListPage() {
  const navigate = useNavigate();
  const [schemes, setSchemes] = useState<PricingScheme[]>([]);
  const [clients, setClients] = useState<MockClient[]>([]);
  const [filterClient, setFilterClient] = useState<string>("all");
  const [toDelete, setToDelete] = useState<PricingScheme | null>(null);

  const refresh = () => {
    setSchemes(listPricingSchemes());
    listClients().then(setClients);
  };
  useEffect(refresh, []);

  const filtered = schemes.filter((s) => filterClient === "all" || (s.client_id ?? "all-clients") === filterClient);

  const typeMeta = (k: string) => PRICING_TYPES.find((t) => t.key === k);

  return (
    <AdminLayout title="Pricing Schemes" subtitle="Skema kalkulasi pendapatan rider per client">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Filter Client</label>
          <select
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
            className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
          >
            <option value="all">Semua Client</option>
            <option value="all-clients">Berlaku Semua Client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Link
          to="/admin/pricing/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Tambah Skema
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-primary-soft text-primary grid place-items-center mx-auto mb-3">
              <Tag className="w-5 h-5" />
            </div>
            <div className="text-sm font-medium">Belum ada skema pricing</div>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Buat skema baru untuk menentukan cara kalkulasi pendapatan rider.
            </p>
            <button
              onClick={() => navigate({ to: "/admin/pricing/new" })}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Tambah Skema
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Nama Skema</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">Untuk</th>
                <th className="px-4 py-2.5 font-medium">Tipe</th>
                <th className="px-4 py-2.5 font-medium">Berlaku</th>
                <th className="px-4 py-2.5 font-medium w-24" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const tm = typeMeta(s.calc_type);
                return (
                  <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.client_name ?? "Semua Client"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium " +
                          (s.scheme_for === "client"
                            ? "bg-violet-500/15 text-violet-600 dark:text-violet-300"
                            : "bg-sky-500/15 text-sky-600 dark:text-sky-300")
                        }
                      >
                        {s.scheme_for === "client" ? "Client" : "Rider"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-md bg-primary-soft text-primary-soft-foreground px-2 py-0.5 text-[11px] font-medium">
                        {tm?.name ?? s.calc_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatTanggal(s.effective_from)}
                      {s.effective_to ? ` – ${formatTanggal(s.effective_to)}` : " – tidak terbatas"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Link
                          to="/admin/pricing/$id"
                          params={{ id: s.id }}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => setToDelete(s)}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus skema?</AlertDialogTitle>
            <AlertDialogDescription>
              Skema <strong>{toDelete?.name}</strong> akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toDelete) {
                  deletePricingScheme(toDelete.id);
                  toast.success("Skema dihapus");
                  refresh();
                  setToDelete(null);
                }
              }}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
