// In-memory fixed-window rate limiter — best-effort per Worker isolate, bukan
// distributed (gak ada KV/Redis di project ini, lihat config.server.ts). Cukup
// buat throttle brute-force PIN attempt (pin-validator.ts) & endpoint ber-secret
// (x-ingest-secret, x-payroll-reminder-secret, dst) yang cuma dipanggil cron —
// kalau butuh limit akurat lintas isolate/region, pindahin storage-nya ke
// Supabase atau KV.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Buang entry yang udah expired tiap kali dipanggil, biar Map gak numpuk terus
// selama isolate hidup (gak ada TTL native di Map).
function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
};

export function checkRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    limit,
    resetAt: bucket.resetAt,
  };
}

// Reset manual dipakai pas attempt sukses (mis. PIN benar), biar user gak kena
// limit dari percobaan gagal sebelumnya begitu udah berhasil login.
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

// Preset dipakai bareng src/lib/pin-validator.ts: 5 percobaan PIN salah per 15
// menit per rider, sebelum kena lockout sementara.
export const PIN_ATTEMPT_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };

// Preset endpoint cron ber-secret (ingest, payroll-reminder, pnl-weekly-push) —
// generous karena dipanggil scheduler, bukan user, tapi tetap ada batas biar
// gak bisa dipakai buat brute-force header secret.
export const CRON_ENDPOINT_LIMIT = { limit: 30, windowMs: 60 * 1000 };
