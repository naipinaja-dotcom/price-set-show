// Ingat periode terakhir yang di-Commit di halaman Hitung Fee, biar Payroll Run
// bisa nawarin bikin run buat periode itu langsung — gak perlu ketik ulang tanggal.
const KEY = "dash_last_fee_period";

export interface LastFeePeriod {
  from: string;
  to: string;
  clientId: string | null; // null = skema "semua client"
  clientName: string; // buat ditampilin, termasuk "Semua Client"
  rowCount: number;
  ts: number;
}

export function saveLastFeePeriod(input: { from: string; to: string; clientId: string | null; clientName: string; rowCount: number }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...input, ts: Date.now() }));
  } catch {
    // localStorage tidak tersedia (mis. private mode) — abaikan, ini cuma kenyamanan UX
  }
}

export function getLastFeePeriod(): LastFeePeriod | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
