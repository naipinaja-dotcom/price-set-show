import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin-layout";
import { Tag, Upload, Calculator, Wallet } from "lucide-react";

export const Route = createFileRoute("/admin/dashboard")({
  component: () => (
    <AdminLayout title="Dashboard" subtitle="Ringkasan operasional payroll">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Riders Aktif", value: "—", hint: "Connect Supabase untuk data" },
          { label: "Payroll Draft", value: "—", hint: "Belum ada run aktif" },
          { label: "Tunggakan Aktif", value: "—", hint: "Total cicilan berjalan" },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="text-2xl font-semibold mt-1">{c.value}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{c.hint}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-primary-soft p-4 mb-6">
        <div className="text-sm font-medium text-primary-soft-foreground mb-1">
          Hubungkan Supabase project untuk mengaktifkan data real
        </div>
        <p className="text-xs text-primary-soft-foreground/80">
          Halaman dashboard, list riders, dan reminder tunggakan akan menarik dari tabel{" "}
          <code className="text-[11px]">v_active_installment_reminders</code> setelah project di-connect.
        </p>
      </div>

      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">Akses Cepat</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { to: "/admin/pricing", label: "Pricing Schemes", icon: Tag },
          { to: "/admin/upload", label: "Upload Data", icon: Upload },
          { to: "/admin/deductions", label: "Deductions", icon: Wallet },
          { to: "/admin/payroll", label: "Payroll Run", icon: Calculator },
        ].map((q) => {
          const I = q.icon;
          return (
            <Link
              key={q.to}
              to={q.to}
              className="rounded-lg border border-border bg-card p-4 hover:border-primary-border hover:bg-primary-soft/40 transition-colors"
            >
              <I className="w-5 h-5 text-primary mb-2" />
              <div className="text-sm font-medium">{q.label}</div>
            </Link>
          );
        })}
      </div>
    </AdminLayout>
  ),
});
