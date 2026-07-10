import { describe, it, expect, beforeEach, vi } from "vitest";

// Same scripted Supabase fake as the dedup test (see comment there).
const mock = vi.hoisted(() => {
  const calls = { selects: [] as any[], updates: [] as any[], deletes: [] as any[] };
  const pages: { select: any[][] } = { select: [] };
  const errors: any = { select: null, update: null, delete: null };

  function makeBuilder(table: string) {
    const q: any = { table, verb: "select", filters: [] };
    const b: any = {
      select() { q.verb = "select"; return b; },
      update(v: unknown) { q.verb = "update"; q.vals = v; return b; },
      delete() { q.verb = "delete"; return b; },
      eq(col: string, val: unknown) { q.filters.push({ op: "eq", col, val }); return b; },
      in(col: string, val: unknown) { q.filters.push({ op: "in", col, val }); return b; },
      range(a: number, c: number) { q.range = [a, c]; return b; },
      then(resolve: (v: unknown) => void) {
        if (q.verb === "select") { calls.selects.push({ ...q }); resolve({ data: pages.select.length ? pages.select.shift() : [], error: errors.select }); }
        else if (q.verb === "update") { calls.updates.push({ ...q }); resolve({ data: null, error: errors.update }); }
        else { calls.deletes.push({ ...q }); resolve({ data: null, error: errors.delete }); }
      },
    };
    return b;
  }

  return { client: { from: (t: string) => makeBuilder(t) }, calls, pages, errors };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mock.client }));

import { classifyDeliveryType } from "@/lib/delivery-classification";

beforeEach(() => {
  mock.calls.selects.length = 0;
  mock.calls.updates.length = 0;
  mock.pages.select = [];
  mock.errors.select = mock.errors.update = null;
});

describe("classifyDeliveryType (mocked Supabase)", () => {
  it("picks the most frequent sender as the hub and classifies rows", async () => {
    mock.pages.select = [[
      { sender_name: "HUB", receiver_name: "Cust A" },   // DELIVERY
      { sender_name: "HUB", receiver_name: "Cust B" },   // DELIVERY
      { sender_name: "Cust C", receiver_name: "HUB" },   // RETURN
      { sender_name: "Cust D", receiver_name: "Cust E" },// unclassified
    ]];

    const res = await classifyDeliveryType("client-1");

    expect(res.hub).toBe("HUB");
    expect(res.deliveryCount).toBe(2);
    expect(res.returnCount).toBe(1);
    expect(res.unclassifiedCount).toBe(1);
    expect(res.unclassifiedSamples).toHaveLength(1);

    // writes RETURN first, then DELIVERY (order matters when a row's sender == receiver == hub)
    expect(mock.calls.updates).toHaveLength(2);
    expect(mock.calls.updates[0].vals).toEqual({ delivery_type: "RETURN" });
    expect(mock.calls.updates[1].vals).toEqual({ delivery_type: "DELIVERY" });
    // both scoped to the requested client
    expect(mock.calls.updates[0].filters).toContainEqual({ op: "eq", col: "client_id", val: "client-1" });
  });

  it("returns empty zero-counts and writes nothing when the client has no rows", async () => {
    mock.pages.select = [[]];
    const res = await classifyDeliveryType("client-empty");
    expect(res).toEqual({
      clientId: "client-empty",
      hub: null,
      deliveryCount: 0,
      returnCount: 0,
      unclassifiedCount: 0,
      unclassifiedSamples: [],
    });
    expect(mock.calls.updates).toHaveLength(0);
  });

  it("scopes the read to the given client_id", async () => {
    mock.pages.select = [[{ sender_name: "HUB", receiver_name: "X" }]];
    await classifyDeliveryType("client-42");
    expect(mock.calls.selects[0].filters).toContainEqual({ op: "eq", col: "client_id", val: "client-42" });
  });
});
