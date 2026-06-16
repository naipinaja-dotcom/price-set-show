import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Role = "admin" | "rider";

export interface MockUser {
  id: string;
  name: string;
  role: Role;
  employeeId?: string;
  email?: string;
}

interface AuthCtx {
  user: MockUser | null;
  loading: boolean;
  loginAdmin: (email: string, password: string) => Promise<void>;
  loginRider: (employeeId: string, pin: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const STORAGE_KEY = "dash_mock_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) setUser(JSON.parse(raw));
    } catch {}
    setLoading(false);
  }, []);

  const persist = (u: MockUser | null) => {
    setUser(u);
    if (typeof window !== "undefined") {
      if (u) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        loginAdmin: async (email) => {
          // MOCK — ganti dengan Supabase signInWithPassword setelah project di-connect
          await new Promise((r) => setTimeout(r, 300));
          persist({ id: "admin-1", name: "Admin DASH", role: "admin", email });
        },
        loginRider: async (employeeId) => {
          await new Promise((r) => setTimeout(r, 300));
          persist({
            id: "rider-1",
            name: "Rider " + employeeId.toUpperCase(),
            role: "rider",
            employeeId: employeeId.toUpperCase(),
          });
        },
        logout: () => persist(null),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
