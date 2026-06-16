import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin-layout";

function Stub({ title, subtitle, note }: { title: string; subtitle: string; note: string }) {
  return (
    <AdminLayout title={title} subtitle={subtitle}>
      <div className="rounded-lg border border-dashed border-primary-border bg-primary-soft/40 p-8 text-center">
        <div className="text-sm font-medium text-primary-soft-foreground">Coming next</div>
        <p className="text-xs text-primary-soft-foreground/80 mt-1 max-w-md mx-auto">{note}</p>
      </div>
    </AdminLayout>
  );
}

export const Route = createFileRoute("/admin/attendance")({
  component: () => (
    <Stub
      title="Attendance Rules"
      subtitle="Rule kehadiran + insentif"
      note="Rule per client: jam clock-in, durasi minimal, toleransi telat, penalty, daily base fee, insentif per kondisi, dan assignment ke rider."
    />
  ),
});
