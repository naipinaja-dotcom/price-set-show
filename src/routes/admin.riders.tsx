import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin-layout";

export const Route = createFileRoute("/admin/riders")({
  component: () => (
    <AdminLayout title="Riders" subtitle="Daftar rider aktif & pending review">
      <div className="rounded-lg border border-dashed border-primary-border bg-primary-soft/40 p-8 text-center">
        <div className="text-sm font-medium text-primary-soft-foreground">Coming next</div>
        <p className="text-xs text-primary-soft-foreground/80 mt-1">
          List rider + filter status (active / pending_review / inactive), detail rider, dan tombol "Buat Akun Login" (MTR Code + PIN).
        </p>
      </div>
    </AdminLayout>
  ),
});
