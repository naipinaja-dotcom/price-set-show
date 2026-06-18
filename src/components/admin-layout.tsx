import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  UserCircle2,
  Tag,
  Clock,
  Upload,
  Wallet,
  FileBarChart2,
  Calculator,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";

const NAV = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/clients", label: "Clients", icon: Users },
  { to: "/admin/riders", label: "Riders", icon: UserCircle2 },
  { to: "/admin/pricing", label: "Pricing Schemes", icon: Tag },
  { to: "/admin/attendance", label: "Attendance Rules", icon: Clock },
  { to: "/admin/upload", label: "Upload Data", icon: Upload },
  { to: "/admin/deductions", label: "Deductions", icon: Wallet },
  { to: "/admin/payroll", label: "Payroll Run", icon: Calculator },
  { to: "/admin/reports", label: "Reports", icon: FileBarChart2 },
] as const;

export function AdminLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex w-60 flex-col border-r border-border bg-sidebar">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-md bg-primary text-primary-foreground grid place-items-center font-bold text-sm">
            D
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">DASH Payroll</div>
            <div className="text-[11px] text-muted-foreground">PT. Dash Elektrik</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map((it) => {
            const Icon = it.icon;
            const active = pathname === it.to || pathname.startsWith(it.to + "/");
            return (
              <Link
                key={it.to}
                to={it.to}
                className={
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors " +
                  (active
                    ? "bg-primary-soft text-primary-soft-foreground font-medium"
                    : "text-foreground/80 hover:bg-muted hover:text-foreground")
                }
              >
                <Icon className="w-4 h-4" />
                <span>{it.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-primary-soft text-primary-soft-foreground grid place-items-center text-xs font-semibold">
              {user?.fullName?.charAt(0) ?? "A"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{user?.fullName}</div>
              <div className="text-[11px] text-muted-foreground truncate">Admin</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-sidebar border-r border-border flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold">DASH Payroll</span>
              <button onClick={() => setMobileOpen(false)} className="p-1" aria-label="Tutup menu">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
              {NAV.map((it) => {
                const Icon = it.icon;
                const active = pathname === it.to;
                return (
                  <Link
                    key={it.to}
                    to={it.to}
                    onClick={() => setMobileOpen(false)}
                    className={
                      "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm " +
                      (active
                        ? "bg-primary-soft text-primary-soft-foreground font-medium"
                        : "text-foreground/80 hover:bg-muted")
                    }
                  >
                    <Icon className="w-4 h-4" />
                    {it.label}
                  </Link>
                );
              })}
            </nav>
            <button
              onClick={handleLogout}
              className="m-3 flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-card flex items-center px-4 lg:px-8 gap-3">
          <button
            className="lg:hidden p-1.5 -ml-1 rounded-md hover:bg-muted"
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-tight truncate">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </header>
        <main className="flex-1 px-4 lg:px-8 py-6 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
