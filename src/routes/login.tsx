import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { usePostHog } from "@posthog/react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Masuk — DASH Payroll" },
      {
        name: "description",
        content:
          "Masuk ke DASH Payroll sebagai admin untuk mengakses dashboard payroll, attendance, dan slip gaji.",
      },
      { property: "og:title", content: "Masuk — DASH Payroll" },
      { property: "og:description", content: "Masuk ke DASH Payroll sebagai admin." },
      { property: "og:url", content: "https://price-set-show.lovable.app/login" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://price-set-show.lovable.app/login" }],
  }),
});

function LoginPage() {
  const { user, loginAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (authLoading) return null;
  if (user)
    return <Navigate to={user.role === "admin" ? "/admin/dashboard" : "/rider/dashboard"} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (!email || !password) throw new Error("Email & password wajib diisi");
      await loginAdmin(email, password);
      posthog.identify(email, { role: "admin" });
      posthog.capture("admin_logged_in");
      toast.success("Berhasil masuk");
      navigate({ to: "/admin/dashboard" });
    } catch (err) {
      posthog.captureException(err);
      toast.error(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-primary text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-foreground/15 grid place-items-center font-bold">
            D
          </div>
          <div>
            <div className="font-semibold">DASH Payroll</div>
            <div className="text-xs opacity-80">PT. Dash Elektrik Indonesia</div>
          </div>
        </div>
        <div>
          <h2 className="text-3xl font-semibold leading-tight mb-3">
            Sistem payroll terpadu
            <br />
            untuk operasional rider.
          </h2>
          <p className="text-sm opacity-80 max-w-sm">
            Kelola skema pricing, attendance, potongan, dan slip gaji dari satu tempat.
          </p>
        </div>
        <div className="text-xs opacity-70">
          © {new Date().getFullYear()} PT. Dash Elektrik Indonesia
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h1 className="text-xl font-semibold mb-1">Masuk ke DASH</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Masuk dengan email &amp; password admin Anda. Akun baru hanya dapat dibuat oleh
            administrator.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@dash.id"
                className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 w-full rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Masuk
          </button>
        </form>
      </div>
    </main>
  );
}
