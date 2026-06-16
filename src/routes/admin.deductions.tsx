import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin-layout";

export const Route = createFileRoute("/admin/deductions")({
  component: () => (
    <AdminLayout title="Deductions" subtitle="Jenis potongan, input potongan, dan cicilan aktif">
      <div className="rounded-lg border border-dashed border-primary-border bg-primary-soft/40 p-8 text-center">
        <div className="text-sm font-medium text-primary-soft-foreground">Coming next</div>
        <p className="text-xs text-primary-soft-foreground/80 mt-1 max-w-md mx-auto">
          Tab Jenis Potongan (BPJS, Admin, Kasbon, dll), Tambah Potongan (one-time / cicilan), dan list cicilan aktif dengan progress tracking.
        </p>
      </div>
    </AdminLayout>
  ),
});
