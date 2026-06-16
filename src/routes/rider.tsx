import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/rider")({
  component: RiderGuard,
});

function RiderGuard() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  if (user.role !== "rider") return <Navigate to="/admin/dashboard" />;
  return <Outlet />;
}
