import { createFileRoute } from "@tanstack/react-router";
import { RiderLayout } from "@/components/rider-layout";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/rider/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  return (
    <RiderLayout title="Profil">
      <div className="flex flex-col items-center py-6">
        <div className="w-16 h-16 rounded-full bg-primary-soft text-primary-soft-foreground grid place-items-center text-xl font-semibold">
          {user?.name?.charAt(0) ?? "R"}
        </div>
        <div className="mt-3 text-sm font-semibold">{user?.name}</div>
        <div className="text-xs text-muted-foreground">{user?.employeeId}</div>
      </div>
      <div className="space-y-2">
        {[
          { k: "MTR Code", v: user?.employeeId ?? "-" },
          { k: "Hub", v: "-" },
          { k: "Status", v: "Active" },
        ].map((r) => (
          <div key={r.k} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5">
            <span className="text-xs text-muted-foreground">{r.k}</span>
            <span className="text-sm font-medium">{r.v}</span>
          </div>
        ))}
      </div>
    </RiderLayout>
  );
}
