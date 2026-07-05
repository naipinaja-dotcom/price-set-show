import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface DedupResult {
  scanned: number;        // total baris diperiksa
  duplicateGroups: number; // berapa order yang punya salinan kembar
  deleted: number;        // total baris dobel yang dihapus (sisain 1 per order)
}

interface Row {
  id: string;
  dash_delivery_id: string | null;
  provider_order_id: string | null;
  created_at: string | null;
}

// Ambil semua baris (paginasi — PostgREST batesin 1000/request).
async function fetchAll(): Promise<Row[]> {
  const pageSize = 1000;
  let from = 0;
  const rows: Row[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await sb
      .from("delivery_records")
      .select("id, dash_delivery_id, provider_order_id, created_at")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

// Nyisir SEMUA delivery_records: cari yang Dash ID + Provider ID kembar,
// sisain 1 (yang paling baru), buang sisanya. Buat rapiin data lama yang
// terlanjur ke-upload dobel sebelum sistem anti-dobel/timpa ada.
export async function cleanDuplicateDeliveries(): Promise<DedupResult> {
  const rows = await fetchAll();

  // group by dash|provider (cuma baris yang punya dua-duanya bisa dicek)
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.dash_delivery_id || !r.provider_order_id) continue;
    const key = r.dash_delivery_id + "|" + r.provider_order_id;
    const g = groups.get(key);
    if (g) g.push(r); else groups.set(key, [r]);
  }

  const idsToDelete: string[] = [];
  let duplicateGroups = 0;
  for (const g of groups.values()) {
    if (g.length <= 1) continue;
    duplicateGroups++;
    // sisain yang paling baru (created_at terbesar), hapus sisanya
    g.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    for (let i = 1; i < g.length; i++) idsToDelete.push(g[i].id);
  }

  // hapus per batch (biar ga kepanjangan URL)
  for (let i = 0; i < idsToDelete.length; i += 200) {
    const chunk = idsToDelete.slice(i, i + 200);
    const { error } = await sb.from("delivery_records").delete().in("id", chunk);
    if (error) throw error;
  }

  return { scanned: rows.length, duplicateGroups, deleted: idsToDelete.length };
}
