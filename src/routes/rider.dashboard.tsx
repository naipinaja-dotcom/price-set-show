import { createFileRoute } from "@tanstack/react-router";
import { RiderLayout } from "@/components/rider-layout";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/rider/dashboard")({
  component: () => (
    <RiderLayout title="Beranda">
      <div className="rounded-xl bg-primary text-primary-foreground p-5 mb-4">
        <div className="text-xs opacity-80">Slip gaji terbaru</div>
        <div className="text-2xl font-semibold mt-1">{formatRupiah(0)}</div>
        <div className="text-[11px] opacity-80 mt-1">Belum ada payslip yang dipublish</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[11px] text-muted-foreground">Total Pendapatan</div>
          <div className="text-sm font-semibold mt-0.5">—</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[11px] text-muted-foreground">Total Potongan</div>
          <div className="text-sm font-semibold mt-0.5">—</div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-6 text-center">
        Data akan muncul setelah admin mempublish payslip.
      </p>
    </RiderLayout>
  ),
});
