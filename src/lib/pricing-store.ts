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

const DEFAULT_CLIENTS: MockClient[] = [
  { id: "c1", name: "JNE Express", code: "JNE" },
  { id: "c2", name: "SiCepat", code: "SCP" },
  { id: "c3", name: "Anteraja", code: "ATR" },
];

export function listClients(): MockClient[] {
  const stored = read<MockClient[] | null>(CLIENTS_KEY, null);
  if (stored && stored.length) return stored;
  write(CLIENTS_KEY, DEFAULT_CLIENTS);
  return DEFAULT_CLIENTS;
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
