import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface ClassifyResult {
  clientId: string;
  hub: string | null;
  deliveryCount: number;
  returnCount: number;
  unclassifiedCount: number;
  unclassifiedSamples: { sender: string | null; receiver: string | null }[];
}

// Supabase/PostgREST batesin 1000 baris per request secara default —
// kalau ga di-paginate, client yang datanya ribuan bisa keitung salah.
async function fetchAllSenderReceiver(clientId: string) {
  const pageSize = 1000;
  let from = 0;
  const rows: { sender_name: string | null; receiver_name: string | null }[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await sb
      .from("delivery_records")
      .select("sender_name, receiver_name")
      .eq("client_id", clientId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

// Cari titik pusat (hub) per client secara otomatis — Sender Name yang
// paling sering muncul — lalu klasifikasi tiap baris & simpan ke DB.
// Adaptif per client, tidak hardcode.
export async function classifyDeliveryType(clientId: string): Promise<ClassifyResult> {
  const rows = await fetchAllSenderReceiver(clientId);
  if (rows.length === 0) {
    return { clientId, hub: null, deliveryCount: 0, returnCount: 0, unclassifiedCount: 0, unclassifiedSamples: [] };
  }

  const freq = new Map<string, number>();
  rows.forEach((r) => { if (r.sender_name) freq.set(r.sender_name, (freq.get(r.sender_name) ?? 0) + 1); });
  let hub: string | null = null, hubCount = 0;
  freq.forEach((count, name) => { if (count > hubCount) { hub = name; hubCount = count; } });

  if (!hub) {
    return { clientId, hub: null, deliveryCount: 0, returnCount: 0, unclassifiedCount: rows.length, unclassifiedSamples: rows.slice(0, 10).map((r) => ({ sender: r.sender_name, receiver: r.receiver_name })) };
  }

  let deliveryCount = 0, returnCount = 0;
  const unclassifiedSamples: { sender: string | null; receiver: string | null }[] = [];
  rows.forEach((r) => {
    if (r.sender_name === hub) deliveryCount++;
    else if (r.receiver_name === hub) returnCount++;
    else if (unclassifiedSamples.length < 10) unclassifiedSamples.push({ sender: r.sender_name, receiver: r.receiver_name });
  });
  const unclassifiedCount = rows.length - deliveryCount - returnCount;

  // Tulis ke DB — RETURN dulu baru DELIVERY, biar kalau kebetulan sender
  // DAN receiver sama-sama = hub (data ganjil), yang menang tetap DELIVERY.
  await sb.from("delivery_records").update({ delivery_type: "RETURN" }).eq("client_id", clientId).eq("receiver_name", hub);
  await sb.from("delivery_records").update({ delivery_type: "DELIVERY" }).eq("client_id", clientId).eq("sender_name", hub);

  return { clientId, hub, deliveryCount, returnCount, unclassifiedCount, unclassifiedSamples };
}

export async function classifyAllClients(clientIds: string[]): Promise<ClassifyResult[]> {
  const results: ClassifyResult[] = [];
  for (const id of clientIds) {
    results.push(await classifyDeliveryType(id));
  }
  return results;
}
