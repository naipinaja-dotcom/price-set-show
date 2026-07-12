import { useState } from "react";

const STORAGE_KEY_FROM = "dash-intel-range-from";
const STORAGE_KEY_TO = "dash-intel-range-to";

// PENTING: pakai tanggal kalender LOKAL, bukan `toISOString()` (itu UTC).
// User ada di WIB (UTC+7) — antara jam 00:00–06:59 WIB, `toISOString()`
// masih nunjuk ke tanggal KEMARIN (UTC-nya belum ganti hari), jadi default
// "hari ini" bisa salah telat 1 hari kalau dipakai apa adanya.
function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function today() {
  return localDate(new Date());
}
function sevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return localDate(d);
}

function readStored(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

// Rentang tanggal bebas (from-to, kamu atur sendiri — mis. 1-3, 3-10, dst)
// yang di-share ke semua halaman Intelligence Mode — cuma bisa DIUBAH dari
// Executive Dashboard (satu-satunya halaman yang render filter tanggalnya);
// 5 halaman lain (Margin/Revenue/BCR/Driver/Shipment Analytics) cuma BACA
// rentang yang sama dari localStorage dan otomatis hitung sendiri, tanpa
// filter/tombol "Hitung" masing-masing.
export function useIntelligenceDate() {
  const [from, setFromState] = useState(() => readStored(STORAGE_KEY_FROM, sevenDaysAgo()));
  const [to, setToState] = useState(() => readStored(STORAGE_KEY_TO, today()));

  const setFrom = (v: string) => { setFromState(v); window.localStorage.setItem(STORAGE_KEY_FROM, v); };
  const setTo = (v: string) => { setToState(v); window.localStorage.setItem(STORAGE_KEY_TO, v); };
  const resetToDefault = () => { setFrom(sevenDaysAgo()); setTo(today()); };

  return { from, setFrom, to, setTo, resetToDefault };
}
