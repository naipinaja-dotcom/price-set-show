// Export worksheet finance ke Excel (multi-sheet) & CSV.
// Excel pakai format SpreadsheetML 2003 (XML) — ZERO dependency, multi-sheet,
// kebuka di Excel & Google Sheets. Angka diekspor sebagai Number (bukan
// "Rp..."), jadi Finance bisa langsung SUM di sheet-nya.
import type { RateCard } from "./rate-card";

export type Cell = string | number | null | undefined;
export interface Sheet {
  name: string;
  rows: Cell[][];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cellXML(v: Cell): string {
  if (v === null || v === undefined || v === "") return "<Cell/>";
  if (typeof v === "number" && Number.isFinite(v)) return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
  return `<Cell><Data ss:Type="String">${esc(String(v))}</Data></Cell>`;
}

function sheetXML(s: Sheet): string {
  const rows = s.rows.map((r) => `<Row>${r.map(cellXML).join("")}</Row>`).join("");
  // nama sheet Excel: maks 31 char, tanpa karakter terlarang
  const name = esc(s.name.slice(0, 31).replace(/[\\/?*:[\]]/g, "-"));
  return `<Worksheet ss:Name="${name}"><Table>${rows}</Table></Worksheet>`;
}

export function downloadXLS(filename: string, sheets: Sheet[]) {
  const xml =
    '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    sheets.map(sheetXML).join("") +
    "</Workbook>";
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xls") ? filename : filename + ".xls";
  a.click();
  URL.revokeObjectURL(url);
}

// Ratakan daftar rate card jadi baris sheet (Rate / PKS reference).
export function rateCardsToRows(cards: RateCard[]): Cell[][] {
  const rows: Cell[][] = [];
  for (const c of cards) {
    rows.push([`${c.schemeName} — ${c.calcLabel}${c.clientName ? " · " + c.clientName : ""} (${c.schemeFor === "client" ? "Tagihan Client" : "Fee Rider"})`]);
    rows.push(["Variable", "Rate", "Satuan", "Remarks"]);
    for (const sec of c.sections) {
      if (sec.title) rows.push([sec.title]);
      for (const r of sec.rows) rows.push([r.variable, r.rate, r.unit, r.remarks]);
    }
    rows.push([]); // pemisah antar scheme
  }
  return rows;
}
