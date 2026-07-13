import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { usePostHog } from "@posthog/react";
import { RiderLayout } from "@/components/rider-layout";
import { supabase } from "@/integrations/supabase/client";
import { useRiderSelf } from "@/lib/use-rider-self";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { Loader2, X, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/rider/payslips")({ component: PayslipsPage });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type PayslipRow = {
  id: string;
  detail_id: string;
  published_at: string;
  data: { delivery_count: number; gross_earning: number; total_deduction: number; net_pay: number };
  payroll_runs: { name: string; period_start: string; period_end: string } | null;
};

function PayslipsPage() {
  const posthog = usePostHog();
  const { rider, loading: riderLoading } = useRiderSelf();
  const [slips, setSlips] = useState<PayslipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSlip, setOpenSlip] = useState<PayslipRow | null>(null);

  useEffect(() => {
    if (!rider) {
      setLoading(false);
      return;
    }
    sb.from("payslips")
      .select("id, detail_id, published_at, data, payroll_runs(name, period_start, period_end)")
      .eq("rider_id", rider.id)
      .order("published_at", { ascending: false })
      .then(({ data }: { data: PayslipRow[] | null }) => {
        setSlips(data ?? []);
        setLoading(false);
      });
  }, [rider]);

  const busy = riderLoading || loading;

  return (
    <RiderLayout title="Slip Gaji">
      {busy ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : slips.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <div className="text-sm font-medium">Belum ada slip gaji</div>
          <p className="text-xs text-muted-foreground mt-1">
            Slip gaji akan muncul di sini setelah admin publish payroll.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {slips.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setOpenSlip(s);
                posthog.capture("payslip_viewed", {
                  run_name: s.payroll_runs?.name ?? null,
                  net_pay: s.data?.net_pay ?? null,
                });
              }}
              className="w-full flex items-center justify-between rounded-lg border border-border bg-card px-3.5 py-3 text-left hover:bg-muted/40"
            >
              <div>
                <div className="text-sm font-medium">{s.payroll_runs?.name ?? "Payroll"}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {s.payroll_runs
                    ? `${formatTanggal(s.payroll_runs.period_start)} – ${formatTanggal(s.payroll_runs.period_end)}`
                    : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{formatRupiah(s.data?.net_pay)}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </button>
          ))}
        </div>
      )}
      {openSlip && (
        <PayslipDetailModal
          slip={openSlip}
          riderName={rider?.full_name ?? ""}
          employeeId={rider?.employee_id ?? ""}
          onClose={() => setOpenSlip(null)}
        />
      )}
    </RiderLayout>
  );
}

function PayslipDetailModal({
  slip,
  riderName,
  employeeId,
  onClose,
}: {
  slip: PayslipRow;
  riderName: string;
  employeeId: string;
  onClose: () => void;
}) {
  const [ded, setDed] = useState<{ name: string; amount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sb.from("payroll_deductions")
      .select("amount, deduction_types(name)")
      .eq("detail_id", slip.detail_id)
      .then(
        ({
          data,
        }: {
          data: { amount: number; deduction_types: { name: string } | null }[] | null;
        }) => {
          setDed(
            (data ?? []).map((d) => ({
              name: d.deduction_types?.name ?? "Potongan",
              amount: Number(d.amount),
            })),
          );
          setLoading(false);
        },
      );
  }, [slip.detail_id]);

  return (
    <div
      className="fixed inset-0 bg-black/50 grid place-items-end sm:place-items-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-t-2xl sm:rounded-lg w-full sm:max-w-sm max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-card">
          <div>
            <div className="text-sm font-semibold">{slip.payroll_runs?.name ?? "Payroll"}</div>
            <div className="text-[11px] text-muted-foreground">
              {riderName} · {employeeId}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 text-sm">
          <Row label="Order selesai" value={String(slip.data?.delivery_count ?? 0)} />
          <Row label="Fee kotor" value={formatRupiah(slip.data?.gross_earning)} />
          <div className="border-t border-border my-2" />
          {loading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : ded.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">Tidak ada potongan periode ini.</p>
          ) : (
            ded.map((d, i) => (
              <Row key={i} label={d.name} value={`−${formatRupiah(d.amount)}`} muted />
            ))
          )}
          <div className="border-t border-border my-2" />
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-xs text-muted-foreground">Take-home</span>
            <span className="text-xl font-semibold text-primary">
              {formatRupiah(slip.data?.net_pay)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs ${muted ? "text-warning" : "text-foreground"}`}>{value}</span>
    </div>
  );
}
