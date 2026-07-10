import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RiderLayout } from "@/components/rider-layout";
import { supabase } from "@/integrations/supabase/client";
import { useRiderSelf } from "@/lib/use-rider-self";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/rider/dashboard")({ component: DashboardPage });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function DashboardPage() {
  const { rider } = useRiderSelf();
  const [latest, setLatest] = useState<{ net_pay: number; gross_earning: number; total_deduction: number } | null>(null);
  const [runName, setRunName] = useState<string | null>(null);
  const [installmentTotal, setInstallmentTotal] = useState(0);

  useEffect(() => {
    if (!rider) return;
    sb.from("payslips").select("data, payroll_runs(name)").eq("rider_id", rider.id)
      .order("published_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }: { data: { data: typeof latest; payroll_runs: { name: string } | null } | null }) => {
        if (data) { setLatest(data.data); setRunName(data.payroll_runs?.name ?? null); }
      });
    supabase.from("rider_installments").select("total_amount, installments_paid, per_period_amount, installment_count")
      .eq("rider_id", rider.id).eq("active", true)
      .then(({ data }) => {
        const remaining = (data ?? []).reduce((s, i) => s + Math.max(0, (i.installment_count - i.installments_paid) * i.per_period_amount), 0);
        setInstallmentTotal(remaining);
      });
  }, [rider]);

  return (
    <RiderLayout title="Beranda">
      <div className="rounded-xl bg-primary text-primary-foreground p-5 mb-4">
        <div className="text-xs opacity-80">Slip gaji terbaru</div>
        <div className="text-2xl font-semibold mt-1">{formatRupiah(latest?.net_pay ?? 0)}</div>
        <div className="text-[11px] opacity-80 mt-1">
          {latest ? runName ?? "" : "Belum ada payslip yang dipublish"}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[11px] text-muted-foreground">Fee Kotor</div>
          <div className="text-sm font-semibold mt-0.5">{latest ? formatRupiah(latest.gross_earning) : "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[11px] text-muted-foreground">Total Potongan</div>
          <div className="text-sm font-semibold mt-0.5">{latest ? formatRupiah(latest.total_deduction) : "—"}</div>
        </div>
      </div>
      {installmentTotal > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 mt-3">
          <div className="text-[11px] text-warning">Sisa tunggakan aktif</div>
          <div className="text-sm font-semibold mt-0.5 text-warning">{formatRupiah(installmentTotal)}</div>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground mt-6 text-center">
        Data akan muncul setelah admin mempublish payslip.
      </p>
    </RiderLayout>
  );
}
