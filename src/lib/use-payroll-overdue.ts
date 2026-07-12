import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OverdueStatus = {
  overdue: boolean;
  daysLate: number;
  lastPeriodEnd: string | null;
};

// Toleransi: notifikasi muncul jika hari ini > period_end run terakhir + GRACE_DAYS.
// Spec PRD §5 Open Question #3 — default H+1 (beri 1 hari jeda sebelum dianggap terlambat).
const GRACE_DAYS = 1;

function diffDays(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00Z`).getTime();
  const b = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.floor((b - a) / 86_400_000);
}

export function usePayrollOverdue(): OverdueStatus & { refresh: () => void } {
  const [status, setStatus] = useState<OverdueStatus>({ overdue: false, daysLate: 0, lastPeriodEnd: null });

  const check = async () => {
    const { data } = await supabase
      .from("payroll_runs")
      .select("period_end")
      .order("period_end", { ascending: false })
      .limit(1)
      .single();

    if (!data?.period_end) return setStatus({ overdue: false, daysLate: 0, lastPeriodEnd: null });

    const today = new Date().toISOString().slice(0, 10);
    const daysLate = diffDays(data.period_end, today) - GRACE_DAYS;
    setStatus({ overdue: daysLate > 0, daysLate: Math.max(0, daysLate), lastPeriodEnd: data.period_end });
  };

  useEffect(() => { check(); }, []);

  return { ...status, refresh: check };
}
