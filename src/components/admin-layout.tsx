import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  UserCircle2,
  Tag,
  Upload,
  Wallet,
  FileBarChart2,
  Calculator,
  Coins,
  TrendingUp,
  LayoutPanelTop,
  ShieldCheck,
  Search,
  Receipt,
  LogOut,
  Menu,
  X,
  Package,
  Banknote,
  Percent,
  Bike,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";

// -------------------- Payroll Mode vs Intelligence Mode --------------------
// Nav dipecah 2 grup, di-switch lewat toggle di atas sidebar (bukan gabung
// jadi 1 halaman). Item yang belum ada routenya (SLA/Area/Client Analytics,
// Attendance Rules — udah nyatu di Pricing Schemes) sengaja tidak dimasukkan.
type NavMode = "payroll" | "intelligence";
const NAV_MODE_STORAGE_KEY = "dash-admin-nav-mode";

const NAV_PAYROLL = [
  { to: "/admin/dashboard", label: "Payroll Dashboard", icon: LayoutDashboard },
  { to: "/admin/riders", label: "Riders", icon: UserCircle2 },
  { to: "/admin/clients", label: "Clients", icon: Users },
  { to: "/admin/pricing", label: "Pricing Schemes", icon: Tag },
  { to: "/admin/upload", label: "Attendance Upload", icon: Upload },
  { to: "/admin/payroll", label: "Payroll Run", icon: Calculator },
  { to: "/admin/deductions", label: "Deductions", icon: Wallet },
  { to: "/admin/data-check", label: "Cek Data", icon: Search },
  { to: "/admin/calculate", label: "Hitung Fee", icon: Coins },
  { to: "/admin/reports", label: "Reports", icon: FileBarChart2 },
  { to: "/admin/users", label: "User Management", icon: ShieldCheck },
] as const;

const NAV_INTELLIGENCE = [
  { to: "/admin/pnl-dashboard", label: "Executive Dashboard", icon: LayoutPanelTop },
  { to: "/admin/pnl", label: "Margin Analytics", icon: TrendingUp },
  { to: "/admin/invoices", label: "Invoices", icon: Receipt },
  { to: "/admin/shipment-analytics", label: "Shipment Analytics", icon: Package },
  { to: "/admin/revenue-analytics", label: "Revenue Analytics", icon: Banknote },
  { to: "/admin/bcr-analytics", label: "BCR Analytics", icon: Percent },
  { to: "/admin/driver-analytics", label: "Driver Analytics", icon: Bike },
] as const;

const NAV_GROUPS: Record<NavMode, { sectionLabel: string; items: typeof NAV_PAYROLL | typeof NAV_INTELLIGENCE }> = {
  payroll: { sectionLabel: "PAYROLL", items: NAV_PAYROLL },
  intelligence: { sectionLabel: "INTELLIGENCE", items: NAV_INTELLIGENCE },
};

function modeForPath(pathname: string): NavMode {
  return NAV_INTELLIGENCE.some((it) => pathname === it.to || pathname.startsWith(it.to + "/")) ? "intelligence" : "payroll";
}

export function AdminLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const [mode, setMode] = useState<NavMode>(() => {
    if (typeof window === "undefined") return modeForPath(pathname);
    const stored = window.localStorage.getItem(NAV_MODE_STORAGE_KEY);
    return stored === "payroll" || stored === "intelligence" ? stored : modeForPath(pathname);
  });

  // Kalau user pindah halaman lewat cara lain (mis. link langsung / back button)
  // ke route yang beda grup, ikutin mode-nya biar toggle tetep konsisten.
  useEffect(() => {
    setMode(modeForPath(pathname));
  }, [pathname]);

  useEffect(() => {
    window.localStorage.setItem(NAV_MODE_STORAGE_KEY, mode);
  }, [mode]);

  const navItems = NAV_GROUPS[mode].items;
  const sectionLabel = NAV_GROUPS[mode].sectionLabel;

  const handleLogout = () => {
    logout();
    navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex w-60 flex-col border-r border-border bg-sidebar shadow-[1px_0_0_0_var(--color-border)]">
        <div className="flex items-center gap-3 px-5 py-[18px] border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground grid place-items-center text-sm font-black tracking-tight shadow-sm select-none" style={{fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            D
          </div>
          <div>
            <div className="text-[13px] font-bold leading-tight tracking-tight" style={{fontFamily:"'Plus Jakarta Sans',sans-serif"}}>DASH Payroll</div>
            <div className="text-[10px] text-muted-foreground tracking-widest uppercase mt-0.5">PT. Dash Elektrik</div>
          </div>
        </div>

        {/* Mode switcher — ganti grup menu, bukan navigasi langsung */}
        <div className="px-3 pt-3">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-muted">
            {([["intelligence", "PnL Mode"], ["payroll", "Payroll Mode"]] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={
                  "text-[12px] font-medium py-1.5 rounded-md transition-colors " +
                  (mode === m ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
          <div className="px-3 pb-1.5 pt-1 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">{sectionLabel}</div>
          {navItems.map((it) => {
            const Icon = it.icon;
            const active = pathname === it.to || pathname.startsWith(it.to + "/");
            return (
              <Link
                key={it.to}
                to={it.to}
                className={
                  "flex items-center gap-2.5 px-3 py-[7px] rounded-md text-[13px] transition-all duration-150 " +
                  (active
                    ? "bg-primary-soft text-primary-soft-foreground font-semibold shadow-sm"
                    : "text-foreground/65 hover:bg-muted/80 hover:text-foreground")
                }
              >
                {active && <span className="absolute left-2.5 w-0.5 h-4 bg-primary rounded-full" style={{position:"relative",marginRight:"-2px",flexShrink:0}} />}
                <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-primary" : ""}`} />
                <span>{it.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/60 transition-colors">
            <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground grid place-items-center text-[11px] font-bold flex-shrink-0">
              {user?.fullName?.charAt(0) ?? "A"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold truncate leading-tight">{user?.fullName ?? "Admin"}</div>
              <div className="text-[10px] text-muted-foreground truncate">Administrator</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
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
            <div className="px-3 pt-3">
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-muted">
                {([["intelligence", "PnL Mode"], ["payroll", "Payroll Mode"]] as const).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={
                      "text-[12px] font-medium py-1.5 rounded-md transition-colors " +
                      (mode === m ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
              <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">{sectionLabel}</div>
              {navItems.map((it) => {
                const Icon = it.icon;
                const active = pathname === it.to || pathname.startsWith(it.to + "/");
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
        <header className="sticky top-0 z-10 h-14 border-b border-border bg-card/85 backdrop-blur-md flex items-center px-4 lg:px-8 gap-3">
          <button
            className="lg:hidden p-1.5 -ml-1 rounded-md hover:bg-muted"
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-bold leading-tight truncate tracking-tight" style={{fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{title}</h1>
            {subtitle && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{subtitle}</p>}
          </div>
        </header>
        <main className="flex-1 px-4 lg:px-8 py-6 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
