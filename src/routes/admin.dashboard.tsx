import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Tag, Upload, Calculator, Wallet } from "lucide-react";

const isSupabaseConnected = Boolean(import.meta.env.VITE_SUPABASE_URL);

export const Route = createFileRoute("/admin/dashboard")({ component: DashboardPage });

function DashboardPage() {
  const [ridersAktif, setRidersAktif] = useState<number | null>(null);
  const [payrollDraft, setPayrollDraft] = useState<number | null>(null);
  const [tunggakanAktif, setTunggakanAktif] = useState<number | null>(null);

  useEffect(() => {
    if (!isSupabaseConnected) return;

    supabase.from("riders").select("id", { count: "exact", head: true }).eq("status", "active")
      .then(({ count }) => setRidersAktif(count ?? 0));

    supabase.from("payroll_runs").select("id", { count: "exact", head: true }).eq("status", "draft")
      .then(({ count }) => setPayrollDraft(count ?? 0));

    supabase.from("rider_installments").select("id", { count: "exact", head: true }).eq("active", true)
      .then(({ count }) => setTunggakanAktif(count ?? 0));
  }, []);

  const fmt = (v: number | null) => (v === null ? "…" : String(v));

  return (
    <AdminLayout title="Dashboard" subtitle="Ringkasan operasional payroll">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Riders Aktif", value: isSupabaseConnected ? fmt(ridersAktif) : "—", hint: isSupabaseConnected ? "Status active" : "Connect Supabase untuk data", barColor: "var(--color-primary)" },
          { label: "Payroll Draft", value: isSupabaseConnected ? fmt(payrollDraft) : "—", hint: "Belum ada run aktif", barColor: "var(--color-warning)" },
          { label: "Tunggakan Aktif", value: isSupabaseConnected ? fmt(tunggakanAktif) : "—", hint: "Total cicilan berjalan", barColor: "var(--color-destructive)" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="h-1 opacity-60" style={{ background: c.barColor }} />
            <div className="p-5">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{c.label}</div>
              <div className="text-4xl font-bold mt-2 mb-1 tracking-tight tabular-nums" style={{fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{c.value}</div>
              <div className="text-[11px] text-muted-foreground">{c.hint}</div>
            </div>
          </div>
        ))}
      </div>

      {!isSupabaseConnected && (
        <div className="rounded-lg border border-border bg-primary-soft p-4 mb-6">
          <div className="text-sm font-medium text-primary-soft-foreground mb-1">
            Hubungkan Supabase project untuk mengaktifkan data real
          </div>
          <p className="text-xs text-primary-soft-foreground/80">
            Halaman dashboard, list riders, dan data tunggakan akan menarik langsung dari tabel
            {" "}<code className="text-[11px]">riders</code>, <code className="text-[11px]">payroll_runs</code>,{" "}
            dan <code className="text-[11px]">rider_installments</code> setelah project di-connect.
          </p>
        </div>
      )}

      <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Akses Cepat</h2>
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
              className="group rounded-xl border border-border bg-card p-4 hover:border-primary-border hover:bg-primary-soft/30 hover:shadow-sm transition-all duration-150"
            >
              <div className="w-8 h-8 rounded-lg bg-primary-soft grid place-items-center mb-3 group-hover:bg-primary-soft/80 transition-colors">
                <I className="w-4 h-4 text-primary" />
              </div>
              <div className="text-[13px] font-semibold">{q.label}</div>
            </Link>
          );
        })}
      </div>
    </AdminLayout>
  );
}
