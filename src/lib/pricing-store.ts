// In-memory store sebagai placeholder sebelum Supabase di-connect.
import type { PricingScheme } from "./pricing-types";

const KEY = "dash_mock_pricing_schemes";
const CLIENTS_KEY = "dash_mock_clients";

export interface MockClient {
  id: string;
  name: string;
  code: string;
}

function read<T>(k: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(k);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(k: string, v: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(k, JSON.stringify(v));
}

import { supabase } from "@/integrations/supabase/client";

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

export function listPricingSchemes(): PricingScheme[] {
  return read<PricingScheme[]>(KEY, []);
}

export function savePricingScheme(s: PricingScheme) {
  const all = listPricingSchemes();
  const idx = all.findIndex((x) => x.id === s.id);
  if (idx >= 0) all[idx] = s;
  else all.unshift(s);
  write(KEY, all);
}

export function deletePricingScheme(id: string) {
  write(
    KEY,
    listPricingSchemes().filter((s) => s.id !== id),
  );
}

export function getPricingScheme(id: string): PricingScheme | undefined {
  return listPricingSchemes().find((s) => s.id === id);
}
