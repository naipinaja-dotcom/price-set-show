import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Memuat…</div>;
  if (!user) return <Navigate to="/login" />;
  return <Navigate to={user.role === "admin" ? "/admin/dashboard" : "/rider/dashboard"} />;
}
