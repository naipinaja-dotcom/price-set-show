// Export bulk payment (transfer rider) — CSV & XLS, mengikuti persis struktur
// kolom template bank yang dipakai Finance sekarang (contoh: "BULK Payment
// Rider SI - Payment Rider RSN 2 - 8 Jul 2026.csv"). Kolom-kolom yang memang
// kosong di template (Transaction ID, NIP, Remark, dll) sengaja dibiarkan
// kosong — jangan diisi sendiri tanpa konfirmasi ulang ke Finance.
import { toCSV, downloadCSV } from "./csv";
import { downloadXLS, type Cell } from "./finance-export";

export interface BulkPaymentRow {
  bankName: string | null; // -> kolom "Beneficiary ID" di template (isinya nama bank, bukan ID)
  accountNumber: string | null; // -> kolom "Credited Account"
  receiverName: string; // -> kolom "Receiver Name" (pakai bank_account_holder, fallback full_name)
  amount: number; // -> kolom "Amount" (net_pay)
}

const BULK_PAYMENT_HEADER = [
  "No", "Transaction ID", "Transfer Type", "Beneficiary ID", "Credited Account",
  "Receiver Name", "Amount", "NIP", "Remark", "Beneficiary email address",
  "Receiver Swift Code", "Receiver Cust Type", "Receiver Cust Residence",
];

function buildRows(rows: BulkPaymentRow[]): (string | number)[][] {
  const dataRows = rows.map((r) => [
    "", "", "", r.bankName ?? "", r.accountNumber ?? "", r.receiverName, r.amount,
    "", "", "", "", "", "",
  ]);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const blankRow = ["", "", "", "", "", "", "", "", "", "", "", "", ""];
  const totalRow = ["", "", "", "", "", "", total, "", "", "", "", "", ""];
  return [BULK_PAYMENT_HEADER, ...dataRows, blankRow, totalRow];
}

export function downloadBulkPaymentCSV(filename: string, rows: BulkPaymentRow[]) {
  const name = filename.endsWith(".csv") ? filename : filename + ".csv";
  downloadCSV(name, toCSV(buildRows(rows)));
}

export function downloadBulkPaymentXLS(filename: string, rows: BulkPaymentRow[]) {
  downloadXLS(filename, [{ name: "Bulk Payment", rows: buildRows(rows) as Cell[][] }]);
}
