import { describe, expect, it } from "vitest";
import { pickPricingScheme } from "@/lib/pnl-engine";
import type { PricingScheme } from "@/lib/pricing-types";

function scheme(over: Partial<PricingScheme>): PricingScheme {
  return {
    id: over.id ?? "id",
    name: "s",
    client_id: null,
    client_name: null,
    scheme_for: "client",
    category: "delivery",
    subtype: null,
    effective_from: "2026-01-01",
    effective_to: null,
    params: { version: 1 } as PricingScheme["params"],
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("pickPricingScheme", () => {
  it("prefers the newer of two overlapping client-specific schemes (GORECA regression)", () => {
    const stale = scheme({ id: "stale", client_id: "goreca", effective_from: "2026-07-18", created_at: "2026-07-18T00:00:00Z" });
    const correct = scheme({ id: "correct", client_id: "goreca", effective_from: "2026-07-19", created_at: "2026-07-19T00:00:00Z" });
    const picked = pickPricingScheme([stale, correct], "goreca", "client");
    expect(picked?.id).toBe("correct");
  });

  it("ignores a scheme whose effective_from is still in the future", () => {
    const active = scheme({ id: "active", client_id: "goreca", effective_from: "2026-07-01" });
    const future = scheme({ id: "future", client_id: "goreca", effective_from: "2099-01-01" });
    const picked = pickPricingScheme([active, future], "goreca", "client");
    expect(picked?.id).toBe("active");
  });

  it("ignores an expired scheme (effective_to in the past)", () => {
    const expired = scheme({ id: "expired", client_id: "goreca", effective_from: "2020-01-01", effective_to: "2020-12-31" });
    const current = scheme({ id: "current", client_id: "goreca", effective_from: "2026-01-01" });
    const picked = pickPricingScheme([expired, current], "goreca", "client");
    expect(picked?.id).toBe("current");
  });

  it("still prefers a client-specific scheme over a catch-all one", () => {
    const catchAll = scheme({ id: "all", client_id: null, effective_from: "2026-07-19" });
    const specific = scheme({ id: "specific", client_id: "goreca", effective_from: "2026-01-01" });
    const picked = pickPricingScheme([catchAll, specific], "goreca", "client");
    expect(picked?.id).toBe("specific");
  });
});
