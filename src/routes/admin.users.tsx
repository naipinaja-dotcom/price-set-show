import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/admin/users")({ component: UsersPage });

type Row = { id: string; full_name: string | null; email: string | null; role: string | null };

// role yang app beneran pakai (admin = akses penuh, rider = terbatas)
const ROLES = ["admin", "rider"];

function UsersPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: profiles, error: pe }, { data: roles, error: re }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").order("email"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (pe || re) {
      toast.error((pe || re)!.message);
      setLoading(false);
      return;
    }
    // 1 role utama per user; kalau ada 'admin' menang
    const roleMap = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (roles ?? []).forEach((r: any) => {
      if (r.role === "admin") roleMap.set(r.user_id, "admin");
      else if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setRows((profiles ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name, email: p.email, role: roleMap.get(p.id) ?? null })));
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const changeRole = async (uid: string, newRole: string) => {
    if (!newRole) return;
    setSavingId(uid);
    // ganti role: hapus role lama user itu, lalu isi yang baru
    const { error: de } = await supabase.from("user_roles").delete().eq("user_id", uid);
    if (de) {
      toast.error(de.message);
      setSavingId(null);
      return;
    }
    const { error: ie } = await supabase.from("user_roles").insert({ user_id: uid, role: newRole as "admin" | "rider" });
    if (ie) {
      toast.error(ie.message);
      setSavingId(null);
      return;
    }
    toast.success("Role diperbarui");
    setSavingId(null);
    load();
  };

  return (
    <AdminLayout title="User Management" subtitle="Atur role tiap user — admin (akses penuh) atau rider (terbatas)">
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">User</th>
              <th className="p-3">Email</th>
              <th className="p-3 w-52">Role</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">Belum ada user</td></tr>
            ) : (
              rows.map((r) => {
                const isSelf = r.id === user?.id;
                // pastikan role saat ini selalu muncul di dropdown (mis. 'superadmin')
                const opts = Array.from(new Set([...(r.role ? [r.role] : []), ...ROLES]));
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-3 font-medium">
                      {r.full_name || "—"}
                      {isSelf && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary-soft text-primary-soft-foreground">kamu</span>}
                    </td>
                    <td className="p-3 text-muted-foreground">{r.email}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={r.role ?? ""}
                          disabled={isSelf || savingId === r.id}
                          onChange={(e) => changeRole(r.id, e.target.value)}
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 disabled:opacity-50"
                          title={isSelf ? "Role sendiri dikunci biar ga ke-lock-out" : ""}
                        >
                          {!r.role && <option value="" disabled>— belum ada role —</option>}
                          {opts.map((role) => <option key={role} value={role}>{role}</option>)}
                        </select>
                        {savingId === r.id && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-start gap-2 mt-3 text-xs text-muted-foreground">
        <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>
          <b>admin</b> = akses penuh ke semua halaman. <b>rider</b> = cuma bisa lihat halaman rider (payslip dll).
          Role kamu sendiri dikunci supaya kamu ga ga sengaja ngilangin akses admin sendiri.
        </span>
      </div>
    </AdminLayout>
  );
}
