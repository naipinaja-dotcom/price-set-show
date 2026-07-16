// src/lib/pin-validator.ts

/**
 * Memvalidasi kekuatan PIN untuk keamanan rider.
 * Mengembalikan objek berisi validitas dan pesan kesalahan jika ada.
 */
export function validatePinStrength(pin: string): { valid: boolean; error?: string; score: number } {
  // 1. Cek format dasar (hanya angka, panjang 4-8)
  if (!/^\d{4,8}$/.test(pin)) {
    return { valid: false, error: "PIN harus terdiri dari 4-8 digit angka.", score: 0 };
  }

  let score = 0;
  const length = pin.length;

  // 2. Skor berdasarkan panjang
  if (length >= 6) score += 20;
  if (length === 8) score += 20;

  // 3. Deteksi pola lemah (Weak Patterns)
  const isSequential = (str: string) => {
    for (let i = 0; i < str.length - 1; i++) {
      if (parseInt(str[i+1]) !== parseInt(str[i]) + 1) return false;
    }
    return true;
  };

  const isRepeating = (str: string) => new Set(str.split('')).size === 1;
  
  const commonPatterns = [
    "1234", "12345", "123456", "1234567", "12345678",
    "8765", "87654", "876543", "8765432", "87654321",
    "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
    "2024", "2025", "1990", "1995", "2000" // Tahun umum
  ];

  // Cek pola berulang (misal: 1111, 1212)
  if (isRepeating(pin)) {
    return { valid: false, error: "PIN terlalu mudah ditebak (angka berulang). Gunakan kombinasi acak.", score: 10 };
  }

  // Cek pola berurutan (misal: 1234, 5678)
  if (isSequential(pin) || isSequential(pin.split('').reverse().join(''))) {
    return { valid: false, error: "PIN terlalu mudah ditebak (angka berurutan). Gunakan kombinasi acak.", score: 10 };
  }

  // Cek pola umum
  if (commonPatterns.some(p => pin.startsWith(p) || pin.endsWith(p))) {
    return { valid: false, error: "PIN ini terlalu umum digunakan. Pilih kombinasi lain.", score: 15 };
  }

  // Tambah skor jika lolos cek pola
  score += 60;

  return {
    valid: score > 40, // Dianggap valid jika skor > 40
    error: score <= 40 ? "PIN terlalu lemah. Hindari pola berulang atau berurutan." : undefined,
    score
  };
}