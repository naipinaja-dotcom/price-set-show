import { describe, it, expect } from "vitest";
import { formatRupiah, parseRupiah, formatTanggal } from "@/lib/format";

describe("formatRupiah", () => {
  it("formats numbers with id-ID thousand separators", () => {
    expect(formatRupiah(1500000)).toBe("Rp 1.500.000");
    expect(formatRupiah(0)).toBe("Rp 0");
  });

  it("defaults null/undefined to Rp 0", () => {
    expect(formatRupiah(null)).toBe("Rp 0");
    expect(formatRupiah(undefined)).toBe("Rp 0");
  });

  it("parses a rupiah-formatted string back into a number", () => {
    expect(formatRupiah("Rp 1.500.000")).toBe("Rp 1.500.000");
  });

  it("returns Rp 0 for non-finite input", () => {
    expect(formatRupiah("abc")).toBe("Rp 0");
  });

  it("keeps negative amounts", () => {
    expect(formatRupiah(-2000)).toBe("Rp -2.000");
  });
});

describe("parseRupiah", () => {
  it("strips separators and currency prefix", () => {
    expect(parseRupiah("Rp 1.500.000")).toBe(1500000);
    expect(parseRupiah("2.000")).toBe(2000);
  });

  it("returns 0 for junk", () => {
    expect(parseRupiah("abc")).toBe(0);
    expect(parseRupiah("")).toBe(0);
  });
});

describe("formatTanggal", () => {
  it("formats a Date into 'D Bln YYYY' (Indonesian month)", () => {
    expect(formatTanggal(new Date(2026, 6, 1))).toBe("1 Jul 2026");
    expect(formatTanggal(new Date(2026, 0, 25))).toBe("25 Jan 2026");
    expect(formatTanggal(new Date(2026, 11, 31))).toBe("31 Des 2026");
  });

  it("returns '-' for an invalid date", () => {
    expect(formatTanggal("not-a-date")).toBe("-");
  });
});
