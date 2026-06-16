import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin-layout";

export const Route = createFileRoute("/admin/upload")({
  component: () => (
    <AdminLayout title="Upload Data" subtitle="Delivery & attendance">
      <div className="rounded-lg border border-dashed border-primary-border bg-primary-soft/40 p-8 text-center">
        <div className="text-sm font-medium text-primary-soft-foreground">Coming next</div>
        <p className="text-xs text-primary-soft-foreground/80 mt-1 max-w-md mx-auto">
          Upload CSV/Excel delivery dengan column mapping yang disimpan ke clients.column_mapping, auto-create rider pending_review. Upload attendance format fixed.
        </p>
      </div>
    </AdminLayout>
  ),
});
