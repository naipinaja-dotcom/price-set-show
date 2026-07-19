import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin-layout";
import { Plus, Pencil, Trash2, Tag, Truck, Banknote, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import {
  listPricingSchemes,
  deletePricingScheme,
  listClients,
  type MockClient,
} from "@/lib/pricing-store";
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
  // Baris tabel dikelompokkan per client: kalau 1 client punya >1 skema
  // (biasanya pasangan Rider + Client), tampil sebagai 1 baris ringkas yang
  // bisa diklik buat expand — bukan selalu 2 baris terpisah kayak sebelumnya.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const refresh = () => {
    listPricingSchemes().then(setSchemes);
    listClients().then(setClients);
  };
  useEffect(refresh, []);

  const filtered = schemes.filter(
    (s) => filterClient === "all" || (s.client_id ?? "all-clients") === filterClient,
  );

  // Ringkasan gabungan Rider Pricing (cost) + Revenue Pricing — cuma muncul
  // kalau 1 client spesifik dipilih di filter (bukan "Semua Client" atau
  // "Berlaku Semua Client"), biar begitu klik client A langsung keliatan
  // dua-duanya bareng, gak perlu cross-reference baris tabel di bawah manual.
  const isSingleClient = filterClient !== "all" && filterClient !== "all-clients";
  const selectedClientName = isSingleClient
    ? (clients.find((c) => c.id === filterClient)?.name ?? "Client")
    : "";
  const riderSchemesForClient = filtered.filter((s) => s.scheme_for === "rider");
  const revenueSchemesForClient = filtered.filter((s) => s.scheme_for === "client");

  // Group baris tabel per client_id ("all" = skema "Berlaku Semua Client").
  // Group dengan >1 skema (biasanya pasangan Rider+Client utk client yang
  // sama) ditampilkan sebagai 1 baris ringkas, expand on click. Group dengan
  // cuma 1 skema tetap tampil flat seperti sebelumnya (gak ada gunanya di-collapse).
  const groupMap = new Map<string, { key: string; clientName: string; items: PricingScheme[] }>();
  for (const s of filtered) {
    const key = s.client_id ?? "all";
    let g = groupMap.get(key);
    if (!g) {
      g = { key, clientName: s.client_name ?? "Semua Client", items: [] };
      groupMap.set(key, g);
    }
    g.items.push(s);
  }
  const schemeGroups = [...groupMap.values()];

  const renderSchemeRow = (s: PricingScheme, indented = false) => (
    <tr
      key={s.id}
      className="border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors"
    >
      <td className={"px-4 py-3 font-medium text-foreground" + (indented ? " pl-9" : "")}>
        {s.name}
      </td>
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

  return (
    <AdminLayout title="Pricing Schemes" subtitle="Skema kalkulasi pendapatan rider per client">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-muted-foreground">Filter Client</label>
          <select
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] outline-none focus:border-primary transition-colors"
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
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" /> Tambah Skema
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
                <p className="p-3 text-xs text-muted-foreground">
                  Belum ada skema pembayaran rider untuk client ini.
                </p>
              ) : (
                riderSchemesForClient.map((s) => {
                  const rc = describeScheme(s);
                  return (
                    <div key={s.id} className="border-t border-border first:border-t-0">
                      <div className="px-3 py-2 flex items-center gap-2 bg-muted/40">
                        <span className="text-[12px] font-medium truncate">{rc.schemeName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-soft text-primary-soft-foreground flex-shrink-0">
                          {rc.calcLabel}
                        </span>
                        <Link
                          to="/admin/pricing/$id"
                          params={{ id: s.id }}
                          className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex-shrink-0"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                      <table className="w-full text-xs">
                        <tbody>
                          {rc.sections.map((sec, si) => (
                            <Fragment key={si}>
                              {sec.title && (
                                <tr>
                                  <td
                                    colSpan={4}
                                    className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/20"
                                  >
                                    {sec.title}
                                  </td>
                                </tr>
                              )}
                              {sec.rows.map((r, ri) => (
                                <tr key={`${si}-${ri}`} className="border-t border-border/60">
                                  <td className="px-3 py-1.5">{r.variable}</td>
                                  <td className="px-2 py-1.5 text-right font-medium tabular-nums whitespace-nowrap">
                                    {r.rate}
                                  </td>
                                  <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                                    {r.unit}
                                  </td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{r.remarks}</td>
                                </tr>
                              ))}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })
              )}
            </div>

            {/* Revenue Pricing (billing ke client) */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-3 py-2 bg-violet-500/10 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-violet-600 dark:text-violet-300" />
                <span className="text-[13px] font-semibold">Revenue Pricing (Billing Client)</span>
              </div>
              {revenueSchemesForClient.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">
                  Belum ada skema tagihan ke client ini.
                </p>
              ) : (
                revenueSchemesForClient.map((s) => {
                  const rc = describeScheme(s);
                  return (
                    <div key={s.id} className="border-t border-border first:border-t-0">
                      <div className="px-3 py-2 flex items-center gap-2 bg-muted/40">
                        <span className="text-[12px] font-medium truncate">{rc.schemeName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-soft text-primary-soft-foreground flex-shrink-0">
                          {rc.calcLabel}
                        </span>
                        <Link
                          to="/admin/pricing/$id"
                          params={{ id: s.id }}
                          className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex-shrink-0"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                      <table className="w-full text-xs">
                        <tbody>
                          {rc.sections.map((sec, si) => (
                            <Fragment key={si}>
                              {sec.title && (
                                <tr>
                                  <td
                                    colSpan={4}
                                    className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/20"
                                  >
                                    {sec.title}
                                  </td>
                                </tr>
                              )}
                              {sec.rows.map((r, ri) => (
                                <tr key={`${si}-${ri}`} className="border-t border-border/60">
                                  <td className="px-3 py-1.5">{r.variable}</td>
                                  <td className="px-2 py-1.5 text-right font-medium tabular-nums whitespace-nowrap">
                                    {r.rate}
                                  </td>
                                  <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                                    {r.unit}
                                  </td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{r.remarks}</td>
                                </tr>
                              ))}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" /> Tambah Skema
            </button>
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Nama Skema
                </th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Client
                </th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Untuk
                </th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Tipe
                </th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Berlaku
                </th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {schemeGroups.map((g) => {
                if (g.items.length === 1) {
                  return renderSchemeRow(g.items[0]);
                }
                const isOpen = expandedGroups.has(g.key);
                return (
                  <Fragment key={g.key}>
                    <tr
                      onClick={() => toggleGroup(g.key)}
                      className="border-b border-border last:border-b-0 hover:bg-muted/40 cursor-pointer bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3" colSpan={6}>
                        <div className="flex items-center gap-2">
                          <ChevronRight
                            className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                          />
                          <span className="font-medium">{g.clientName}</span>
                          <span className="text-[11px] text-muted-foreground">
                            · {g.items.length} skema (
                            {g.items
                              .map((i) => (i.scheme_for === "client" ? "Client" : "Rider"))
                              .join(" · ")}
                            )
                          </span>
                        </div>
                      </td>
                    </tr>
                    {isOpen && g.items.map((s) => renderSchemeRow(s, true))}
                  </Fragment>
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
