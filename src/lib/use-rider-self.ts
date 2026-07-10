import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type RiderSelf = {
  id: string; employee_id: string; full_name: string; phone: string | null; email: string | null;
  status: string; bank_name: string | null; bank_account: string | null; bank_account_holder: string | null;
  nik: string | null; birth_date: string | null; birth_place: string | null;
};

export function useRiderSelf() {
  const { user } = useAuth();
  const [rider, setRider] = useState<RiderSelf | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    supabase.from("riders").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      setRider(data as RiderSelf | null);
      setLoading(false);
    });
  }, [user]);

  return { rider, loading };
}
