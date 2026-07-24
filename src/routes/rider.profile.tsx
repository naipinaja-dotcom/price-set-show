import { createFileRoute } from "@tanstack/react-router";
import { RiderLayout } from "@/components/rider-layout";
import { useAuth } from "@/lib/auth";
import { useRiderSelf } from "@/lib/use-rider-self";
import { formatTanggal } from "@/lib/format";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/rider/profile")({
  component: ProfilePage,
});

const STATUS_LABEL: Record<string, string> = {
  ready_to_work: "Ready to Work", active: "Active", resign: "Resign",
  blacklisted: "Blacklisted", withdrawn: "Withdrawn", suspended: "Suspend",
};

function ProfilePage() {
  const { user } = useAuth();
  const { rider, loading } = useRiderSelf();

  return (
    <RiderLayout title="Profil">
      <div className="flex flex-col items-center py-6">
        <div className="w-16 h-16 rounded-full bg-primary-soft text-primary-soft-foreground grid place-items-center text-xl font-semibold">
          {user?.fullName?.charAt(0) ?? "R"}
        </div>
        <div className="mt-3 text-sm font-semibold">{rider?.full_name ?? user?.fullName}</div>
        <div className="text-xs text-muted-foreground">{rider?.employee_id ?? user?.employeeId}</div>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : !rider ? (
        <p className="text-xs text-center text-muted-foreground">Profil belum tersambung ke data rider — hubungi admin.</p>
      ) : (
        <div className="space-y-2">
          {[
            { k: "Kode Mitra", v: rider.employee_id },
            { k: "NIK", v: rider.nik ?? "-" },
            { k: "Nomor WhatsApp", v: rider.phone ?? "-" },
            { k: "Email", v: rider.email ?? "-" },
            { k: "Bank", v: rider.bank_name ? `${rider.bank_name} · ${rider.bank_account ?? "-"}` : "-" },
            { k: "Tempat, Tgl Lahir", v: rider.birth_place || rider.birth_date ? `${rider.birth_place ?? "-"}, ${rider.birth_date ? formatTanggal(rider.birth_date) : "-"}` : "-" },
            { k: "Status", v: STATUS_LABEL[rider.status] ?? rider.status },
          ].map((r) => (
            <div key={r.k} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
              <span className="text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap pt-0.5">{r.k}</span>
              <span className="text-sm font-medium text-right min-w-0 break-words">{r.v}</span>
            </div>
          ))}
        </div>
      )}
    </RiderLayout>
  );
}
