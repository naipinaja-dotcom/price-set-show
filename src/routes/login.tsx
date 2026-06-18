import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Masuk — DASH Payroll" },
      { name: "description", content: "Masuk ke DASH Payroll sebagai admin untuk mengakses dashboard payroll, attendance, dan slip gaji." },
      { property: "og:title", content: "Masuk — DASH Payroll" },
      { property: "og:description", content: "Masuk ke DASH Payroll sebagai admin." },
      { property: "og:url", content: "https://price-set-show.lovable.app/login" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://price-set-show.lovable.app/login" }],
  }),
});

function LoginPage() {
  const { user, loginAdmin, signUpAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (authLoading) return null;
  if (user) return <Navigate to={user.role === "admin" ? "/admin/dashboard" : "/rider/dashboard"} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signup") {
        if (!email || !password || !fullName) throw new Error("Semua field wajib diisi");
        if (password.length < 6) throw new Error("Password minimal 6 karakter");
        await signUpAdmin(email, password, fullName);
        toast.success("Akun dibuat. Silakan login.");
        setMode("login");
      } else {
        if (!email || !password) throw new Error("Email & password wajib diisi");
        await loginAdmin(email, password);
        toast.success("Berhasil masuk");
        navigate({ to: "/admin/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-primary text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-foreground/15 grid place-items-center font-bold">D</div>
          <div>
            <div className="font-semibold">DASH Payroll</div>
            <div className="text-xs opacity-80">PT. Dash Elektrik Indonesia</div>
          </div>
        </div>
        <div>
          <h2 className="text-3xl font-semibold leading-tight mb-3">
            Sistem payroll terpadu<br />untuk operasional rider.
          </h2>
          <p className="text-sm opacity-80 max-w-sm">
            Kelola skema pricing, attendance, potongan, dan slip gaji dari satu tempat.
          </p>
        </div>
        <div className="text-xs opacity-70">© {new Date().getFullYear()} PT. Dash Elektrik Indonesia</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h1 className="text-xl font-semibold mb-1">{mode === "signup" ? "Daftar Admin" : "Masuk ke DASH"}</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "signup"
              ? "Buat akun admin. User pertama otomatis menjadi admin."
              : "Masuk dengan email & password admin Anda."}
          </p>

          <div className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="text-sm font-medium">Nama Lengkap</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nama lengkap"
                  className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
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
            {mode === "signup" ? "Daftar" : "Masuk"}
          </button>

          <button
            type="button"
            onClick={() => setMode(mode === "signup" ? "login" : "signup")}
            className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "signup" ? "Sudah punya akun? Masuk" : "Belum punya akun? Daftar admin"}
          </button>
        </form>
      </div>
    </main>
  );
}
