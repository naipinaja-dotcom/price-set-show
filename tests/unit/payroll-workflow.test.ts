import { describe, expect, it } from "vitest";
import { resolvePeriodIfDue } from "@/lib/payroll-workflow.server";

describe("resolvePeriodIfDue", () => {
  it("default weekly Senin(1)-Minggu(0): jatuh tempo pas hari ini Senin", () => {
    // 2026-07-20 = Senin
    expect(resolvePeriodIfDue(new Date("2026-07-20T01:00:00Z"), 1, 0)).toEqual({
      periodStart: "2026-07-13",
      periodEnd: "2026-07-19",
    });
  });

  it("default weekly: belum jatuh tempo di hari lain", () => {
    // 2026-07-22 = Rabu, kemarin (Selasa) bukan Minggu -> belum jatuh tempo
    expect(resolvePeriodIfDue(new Date("2026-07-22T10:00:00Z"), 1, 0)).toBeNull();
  });

  it("custom Selasa(2)-Kamis(4): jatuh tempo pas hari ini Jumat (kemarin Kamis)", () => {
    // 2026-07-16 = Kamis -> hari ini 2026-07-17 (Jumat)
    expect(resolvePeriodIfDue(new Date("2026-07-17T01:00:00Z"), 2, 4)).toEqual({
      periodStart: "2026-07-14", // Selasa
      periodEnd: "2026-07-16", // Kamis
    });
  });

  it("custom Jumat(5)-Senin(1) wrap-around minggu: jatuh tempo pas hari ini Selasa (kemarin Senin)", () => {
    // 2026-07-20 = Senin -> hari ini 2026-07-21 (Selasa)
    expect(resolvePeriodIfDue(new Date("2026-07-21T01:00:00Z"), 5, 1)).toEqual({
      periodStart: "2026-07-17", // Jumat
      periodEnd: "2026-07-20", // Senin (4 hari: Jum,Sab,Min,Sen)
    });
  });

  it("Wicked Pies: dua periode beda gak saling nabrak dalam 1 minggu", () => {
    const tueThu = { start: 2, end: 4 };
    const friMon = { start: 5, end: 1 };
    // Kamis (2026-07-16) -> jatuh tempo Selasa-Kamis di hari Jumat (2026-07-17)
    expect(resolvePeriodIfDue(new Date("2026-07-17T00:00:00Z"), tueThu.start, tueThu.end)).toEqual({
      periodStart: "2026-07-14",
      periodEnd: "2026-07-16",
    });
    // Fri-Mon belum jatuh tempo di hari yang sama
    expect(resolvePeriodIfDue(new Date("2026-07-17T00:00:00Z"), friMon.start, friMon.end)).toBeNull();
  });
});
