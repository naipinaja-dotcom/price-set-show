import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export type Role = "admin" | "rider";

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  employeeId?: string;
}

interface AuthCtx {
  user: AppUser | null;
  session: Session | null;
  loading: boolean;
  loginAdmin: (email: string, password: string) => Promise<void>;
  signUpAdmin: (email: string, password: string, fullName: string) => Promise<void>;
  loginRider: (employeeId: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

async function hydrateUser(session: Session | null): Promise<AppUser | null> {
  if (!session?.user) return null;
  const uid = session.user.id;
  const [{ data: roles }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", uid),
    supabase.from("profiles").select("full_name, email, employee_id").eq("id", uid).maybeSingle(),
  ]);
  const isAdmin = roles?.some((r) => r.role === "admin");
  return {
    id: uid,
    email: session.user.email ?? profile?.email ?? "",
    fullName: profile?.full_name ?? session.user.email ?? "",
    role: isAdmin ? "admin" : "rider",
    employeeId: profile?.employee_id ?? undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setTimeout(() => {
        hydrateUser(s).then(setUser);
      }, 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      hydrateUser(data.session).then((u) => {
        setUser(u);
        setLoading(false);
      });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthCtx = {
    user,
    session,
    loading,
    loginAdmin: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    signUpAdmin: async (email, password, fullName) => {
      const redirectUrl = `${window.location.origin}/admin/dashboard`;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName }, emailRedirectTo: redirectUrl },
      });
      if (error) throw new Error(error.message);
    },
    loginRider: async (employeeId, pin) => {
      const slug = employeeId.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      const { error } = await supabase.auth.signInWithPassword({ email: `rider-${slug}@dash.internal`, password: pin });
      if (error) throw new Error("Kode Mitra atau PIN salah");
    },
    logout: async () => {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
