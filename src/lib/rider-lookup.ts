import { supabase } from "@/integrations/supabase/client";

// Rider berdiri sendiri (identitasnya = kode MTR/employee_id). Client TIDAK
// ditempel ke rider — itu nempel per delivery/attendance row (1 rider bisa
// jalan untuk banyak client). Fungsi ini nyari rider yang sudah ada by kode;
// kode yang belum terdaftar otomatis dibikinkan rider baru (tanpa client_id).
export async function resolveOrCreateRiders(
  codes: (string | null | undefined)[],
  namesByCode: Record<string, string> = {},
): Promise<{ map: Map<string, string>; createdCodes: string[] }> {
  const uniqueCodes = Array.from(new Set(codes.filter((c): c is string => !!c && c.trim() !== "").map((c) => c.trim())));
  const map = new Map<string, string>();
  if (uniqueCodes.length === 0) return { map, createdCodes: [] };

  const { data: existing, error: selErr } = await supabase
    .from("riders")
    .select("id, employee_id")
    .in("employee_id", uniqueCodes);
  if (selErr) throw selErr;
  (existing ?? []).forEach((r) => map.set(r.employee_id, r.id));

  const missing = uniqueCodes.filter((c) => !map.has(c));
  if (missing.length === 0) return { map, createdCodes: [] };

  const toInsert = missing.map((code) => ({
    employee_id: code,
    full_name: namesByCode[code]?.trim() || code,
    status: "active" as const,
  }));
  const { data: inserted, error: insErr } = await supabase.from("riders").insert(toInsert).select("id, employee_id");
  if (insErr) throw insErr;
  (inserted ?? []).forEach((r) => map.set(r.employee_id, r.id));
  return { map, createdCodes: missing };
}
