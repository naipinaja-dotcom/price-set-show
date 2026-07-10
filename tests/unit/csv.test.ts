import { describe, it, expect } from "vitest";
import { parseCSV, toCSV } from "@/lib/csv";

describe("parseCSV", () => {
  it("parses a simple comma-separated grid", () => {
    expect(parseCSV("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields containing commas", () => {
    expect(parseCSV('name,note\n"Doe, John",hi')).toEqual([
      ["name", "note"],
      ["Doe, John", "hi"],
    ]);
  });

  it("handles escaped double-quotes inside quoted fields", () => {
    expect(parseCSV('a\n"say ""hi"""')).toEqual([["a"], ['say "hi"']]);
  });

  it("handles quoted fields spanning newlines", () => {
    expect(parseCSV('a,b\n"line1\nline2",x')).toEqual([
      ["a", "b"],
      ["line1\nline2", "x"],
    ]);
  });

  it("treats \\r\\n (Windows) line endings correctly", () => {
    expect(parseCSV("a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("drops fully-empty rows", () => {
    expect(parseCSV("a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns the trailing row even without a terminating newline", () => {
    expect(parseCSV("a,b")).toEqual([["a", "b"]]);
  });
});

describe("toCSV", () => {
  it("serialises rows, coercing null/undefined to empty strings", () => {
    expect(toCSV([["a", null, undefined, 3]])).toBe("a,,,3");
  });

  it("quotes and escapes fields with commas, quotes, or newlines", () => {
    expect(toCSV([["Doe, John", 'he said "hi"', "line1\nline2"]])).toBe(
      '"Doe, John","he said ""hi""","line1\nline2"',
    );
  });

  it("round-trips through parseCSV", () => {
    const grid = [
      ["header, 1", "h2"],
      ["value \"x\"", "plain"],
    ];
    expect(parseCSV(toCSV(grid))).toEqual(grid);
  });
});
