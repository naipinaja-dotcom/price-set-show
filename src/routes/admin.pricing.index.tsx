import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin-layout";
import { Plus, Pencil, Trash2, Tag, Truck, Banknote } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { listPricingSchemes, deletePricingScheme, listClients, type MockClient } from "@/lib/pricing-store";
import type { PricingScheme } from "@/lib/pricing-types";
import { pricingLabel } from "@/lib/pricing-types";
import { describeScheme } from "@/lib/rate-card";
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
    listPricingSchemes().then(setSchemes);
    listClients().then(setClients);
  };
  useEffect(refresh, []);

  const filtered = schemes.filter((s) => filterClient === "all" || (s.client_id ?? "all-clients") === filterClient);

  // Ringkasan gabungan Rider Pricing (cost) + Revenue Pricing — cuma muncul
  // kalau 1 client spesifik dipilih di filter (bukan "Semua Client" atau
  // "Berlaku Semua Client"), biar begitu klik client A langsung keliatan
  // dua-duanya bareng, gak perlu cross-reference baris tabel di bawah manual.
  const isSingleClient = filterClient !== "all" && filterClient !== "all-clients";
  const selectedClientName = isSingleClient ? clients.find((c) => c.id === filterClient)?.name ?? "Client" : "";
  const riderSchemesForClient = filtered.filter((s) => s.scheme_for === "rider");
  const revenueSchemesForClient = filtered.filter((s) => s.scheme_for === "client");

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

      {isSingleClient && (
        <div className="mb-5">
          <h2 className="text-sm font-semibold mb-2">Ringkasan Pricing — {selectedClientName}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {/* Rider Pricing (cost) */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-3 py-2 bg-sky-500/10 flex items-center gap-2">
                <Truck className="w-4 h-4 text-sky-600 dark:text-sky-300" />
                <span className="text-[13px] font-semibold">Rider Pricing (Cost)</span>
              </div>
              {riderSchemesForClient.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">Belum ada skema pembayaran rider untuk client ini.</p>
              ) : riderSchemesForClient.map((s) => {
                const rc = describeScheme(s);
                return (
                  <div key={s.id} className="border-t border-border first:border-t-0">
                    <div className="px-3 py-2 flex items-center gap-2 bg-muted/40">
                      <span className="text-[12px] font-medium truncate">{rc.schemeName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-soft text-primary-soft-foreground flex-shrink-0">{rc.calcLabel}</span>
                      <Link to="/admin/pricing/$id" params={{ id: s.id }} className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex-shrink-0" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                    <table className="w-full text-xs">
                      <tbody>
                        {rc.sections.map((sec, si) => (
                          <Fragment key={si}>
                            {sec.title && <tr><td colSpan={4} className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/20">{sec.title}</td></tr>}
                            {sec.rows.map((r, ri) => (
                              <tr key={`${si}-${ri}`} className="border-t border-border/60">
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
                );
              })}
            </div>

            {/* Revenue Pricing (billing ke client) */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-3 py-2 bg-violet-500/10 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-violet-600 dark:text-violet-300" />
                <span className="text-[13px] font-semibold">Revenue Pricing (Billing Client)</span>
              </div>
              {revenueSchemesForClient.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">Belum ada skema tagihan ke client ini.</p>
              ) : revenueSchemesForClient.map((s) => {
                const rc = describeScheme(s);
                return (
                  <div key={s.id} className="border-t border-border first:border-t-0">
                    <div className="px-3 py-2 flex items-center gap-2 bg-muted/40">
                      <span className="text-[12px] font-medium truncate">{rc.schemeName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-soft text-primary-soft-foreground flex-shrink-0">{rc.calcLabel}</span>
                      <Link to="/admin/pricing/$id" params={{ id: s.id }} className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex-shrink-0" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                    <table className="w-full text-xs">
                      <tbody>
                        {rc.sections.map((sec, si) => (
                          <Fragment key={si}>
                            {sec.title && <tr><td colSpan={4} className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/20">{sec.title}</td></tr>}
                            {sec.rows.map((r, ri) => (
                              <tr key={`${si}-${ri}`} className="border-t border-border/60">
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
                );
              })}
            </div>
          </div>
        </div>
      )}

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
                        {pricingLabel(s.category, s.subtype)}
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
              onClick={async () => {
                if (toDelete) {
                  try {
                    await deletePricingScheme(toDelete.id);
                    toast.success("Skema dihapus");
                    refresh();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
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
