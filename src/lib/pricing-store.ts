import { supabase } from "@/integrations/supabase/client";
import type { PricingScheme } from "./pricing-types";

// pricing_schemes dibuat manual lewat SQL Editor, belum ikut proses
// auto-generate types Supabase — pakai `sb` (untyped) khusus buat tabel ini,
// biar file types.ts (yang auto-generated) ga perlu diubah manual.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface MockClient {
  id: string;
  name: string;
  code: string;
}

const SELECT_COLS = "id, name, client_id, scheme_for, calc_type, effective_from, effective_to, params, created_at, clients(name)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(r: any): PricingScheme {
  return {
    id: r.id,
    name: r.name,
    client_id: r.client_id,
    client_name: r.clients?.name ?? null,
    scheme_for: (r.scheme_for as PricingScheme["scheme_for"]) ?? "rider",
    calc_type: r.calc_type,
    effective_from: r.effective_from,
    effective_to: r.effective_to,
    params: r.params,
    created_at: r.created_at ?? "",
  };
}

export async function listClients(): Promise<MockClient[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, code")
    .eq("active", true)
    .order("name");
  if (error) {
    console.error("[listClients]", error);
    return [];
  }
  return (data ?? []) as MockClient[];
}

export async function listPricingSchemes(): Promise<PricingScheme[]> {
  const { data, error } = await sb
    .from("pricing_schemes")
    .select(SELECT_COLS)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("[listPricingSchemes]", error);
    return [];
  }
  return (data ?? []).map(normalize);
}

export async function getPricingScheme(id: string): Promise<PricingScheme | undefined> {
  const { data, error } = await sb.from("pricing_schemes").select(SELECT_COLS).eq("id", id).maybeSingle();
  if (error) {
    console.error("[getPricingScheme]", error);
    return undefined;
  }
  return data ? normalize(data) : undefined;
}

export type SavePricingSchemeInput = Omit<PricingScheme, "id" | "created_at" | "client_name"> & { id?: string };

export async function savePricingScheme(s: SavePricingSchemeInput): Promise<PricingScheme> {
  const payload = {
    name: s.name,
    client_id: s.client_id,
    scheme_for: s.scheme_for,
    calc_type: s.calc_type,
    effective_from: s.effective_from,
    effective_to: s.effective_to || null,
    params: s.params,
  };
  const query = s.id
    ? sb.from("pricing_schemes").update(payload).eq("id", s.id)
    : sb.from("pricing_schemes").insert(payload);
  const { data, error } = await query.select(SELECT_COLS).single();
  if (error) throw error;
  return normalize(data);
}

export async function deletePricingScheme(id: string): Promise<void> {
  const { error } = await sb.from("pricing_schemes").delete().eq("id", id);
  if (error) throw error;
}
