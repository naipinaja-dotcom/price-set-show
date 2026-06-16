import { createFileRoute } from "@tanstack/react-router";
import { RiderLayout } from "@/components/rider-layout";

export const Route = createFileRoute("/rider/payslips")({
  component: () => (
    <RiderLayout title="Slip Gaji">
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <div className="text-sm font-medium">Belum ada slip gaji</div>
        <p className="text-xs text-muted-foreground mt-1">Slip 30 hari terakhir akan muncul di sini.</p>
      </div>
    </RiderLayout>
  ),
});
