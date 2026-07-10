import { describe, it, expect, beforeEach, vi } from "vitest";

// A scripted fake of the Supabase query builder. Defined via vi.hoisted so it
// exists BEFORE the module under test imports "@/integrations/supabase/client".
// It records every op and returns queued pages — the real pagination, grouping
// and batched-delete logic runs unchanged, against no live database.
const mock = vi.hoisted(() => {
  const calls = { selects: [] as any[], deletes: [] as any[], updates: [] as any[] };
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

import { cleanDuplicateDeliveries } from "@/lib/delivery-dedup";

beforeEach(() => {
  mock.calls.selects.length = 0;
  mock.calls.deletes.length = 0;
  mock.pages.select = [];
  mock.errors.select = mock.errors.delete = null;
});

describe("cleanDuplicateDeliveries (mocked Supabase)", () => {
  it("keeps the newest row per (dash_id, provider_id) and deletes the rest", async () => {
    mock.pages.select = [[
      { id: "1", dash_delivery_id: "D1", provider_order_id: "P1", created_at: "2026-01-01" },
      { id: "2", dash_delivery_id: "D1", provider_order_id: "P1", created_at: "2026-01-02" }, // newest -> kept
      { id: "3", dash_delivery_id: "D2", provider_order_id: "P2", created_at: "2026-01-01" }, // unique
      { id: "4", dash_delivery_id: null, provider_order_id: "P3", created_at: "2026-01-01" },  // no dash id -> ignored
    ]];

    const res = await cleanDuplicateDeliveries();

    expect(res.scanned).toBe(4);
    expect(res.duplicateGroups).toBe(1);
    expect(res.deleted).toBe(1);
    // deleted the OLDER row (id "1"), kept id "2"
    expect(mock.calls.deletes).toHaveLength(1);
    expect(mock.calls.deletes[0].filters[0]).toEqual({ op: "in", col: "id", val: ["1"] });
  });

  it("does nothing when there are no duplicates", async () => {
    mock.pages.select = [[
      { id: "1", dash_delivery_id: "D1", provider_order_id: "P1", created_at: "2026-01-01" },
      { id: "2", dash_delivery_id: "D2", provider_order_id: "P2", created_at: "2026-01-01" },
    ]];
    const res = await cleanDuplicateDeliveries();
    expect(res).toEqual({ scanned: 2, duplicateGroups: 0, deleted: 0 });
    expect(mock.calls.deletes).toHaveLength(0);
  });

  it("paginates through multiple 1000-row pages", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({
      id: `a${i}`, dash_delivery_id: `D${i}`, provider_order_id: `P${i}`, created_at: "2026-01-01",
    }));
    const tail = [{ id: "b0", dash_delivery_id: "DX", provider_order_id: "PX", created_at: "2026-01-01" }];
    mock.pages.select = [full, tail]; // 1000 then 1 -> two range() calls
    const res = await cleanDuplicateDeliveries();
    expect(res.scanned).toBe(1001);
    expect(mock.calls.selects).toHaveLength(2);
    expect(mock.calls.selects[0].range).toEqual([0, 999]);
    expect(mock.calls.selects[1].range).toEqual([1000, 1999]);
  });

  it("throws when the database returns an error", async () => {
    mock.errors.select = { message: "boom" };
    mock.pages.select = [[]];
    await expect(cleanDuplicateDeliveries()).rejects.toBeTruthy();
  });
});
