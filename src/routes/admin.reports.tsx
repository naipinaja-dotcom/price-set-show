import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin-layout";

export const Route = createFileRoute("/admin/reports")({
  component: () => (
    <AdminLayout title="Reports" subtitle="Rekap fee per client">
      <div className="rounded-lg border border-dashed border-primary-border bg-primary-soft/40 p-8 text-center">
        <div className="text-sm font-medium text-primary-soft-foreground">Coming next</div>
        <p className="text-xs text-primary-soft-foreground/80 mt-1 max-w-md mx-auto">
          Pilih payroll run → rekap per client (nama, total fee ke DASH) + export CSV.
        </p>
      </div>
    </AdminLayout>
  ),
});
