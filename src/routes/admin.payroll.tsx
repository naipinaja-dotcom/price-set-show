import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin-layout";

export const Route = createFileRoute("/admin/payroll")({
  component: () => (
    <AdminLayout title="Payroll Run" subtitle="Generate, review, finalize, dan publish payroll">
      <div className="rounded-lg border border-dashed border-primary-border bg-primary-soft/40 p-8 text-center">
        <div className="text-sm font-medium text-primary-soft-foreground">Coming next</div>
        <p className="text-xs text-primary-soft-foreground/80 mt-1 max-w-md mx-auto">
          Calculation engine 6 model pricing + attendance + auto-deductions. Review draft per rider, edit nominal, finalize, publish payslip.
        </p>
      </div>
    </AdminLayout>
  ),
});
