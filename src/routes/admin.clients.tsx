import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin-layout";

function ComingSoon({ title, subtitle, note }: { title: string; subtitle: string; note: string }) {
  return (
    <AdminLayout title={title} subtitle={subtitle}>
      <div className="rounded-lg border border-dashed border-primary-border bg-primary-soft/40 p-8 text-center">
        <div className="text-sm font-medium text-primary-soft-foreground">Halaman ini akan dibangun di iterasi berikutnya</div>
        <p className="text-xs text-primary-soft-foreground/80 mt-1 max-w-md mx-auto">{note}</p>
      </div>
    </AdminLayout>
  );
}

export const Route = createFileRoute("/admin/clients")({
  component: () => (
    <ComingSoon
      title="Clients"
      subtitle="Daftar klien & mapping kolom upload"
      note="CRUD client dengan field name, code, address, contact_person, phone — disinkronkan ke tabel clients setelah Supabase di-connect."
    />
  ),
});
