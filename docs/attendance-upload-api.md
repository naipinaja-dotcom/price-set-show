# Upload Attendance — Data Contract

**Bukan REST API/endpoint HTTP.** Upload attendance jalan 100% client-side —
browser admin parse CSV lalu insert langsung ke Supabase (Postgres) pakai
Supabase JS client, gak ada request ke server kita sendiri. Dokumen ini
nyatet kontrak data (kolom CSV, tabel tujuan, dedup logic) buat siapa pun
yang mau bikin importer lain (script, integrasi client, dll) yang kompatibel.

**Lokasi kode:** `src/routes/admin.upload.tsx` — komponen `AttendanceUpload`
(function `process`, baris ~577).

## Alur

```
CSV file (browser)
  → parse header + rows
  → resolveOrCreateRiders()   -- lookup/auto-create rider dari Kode Mitra
  → dedup (driver_code + log_date)
  → insert upload_batches (1 baris, metadata batch)
  → delete baris lama yang bentrok (overwrite)
  → insert attendance_logs (chunk 500 baris)
```

Tidak ada validasi server-side lain di luar constraint tabel (NOT NULL,
RLS admin-only) — kolom `log_date` WAJIB valid (`date` type), selebihnya
nullable.

## Request — Format CSV

Kolom di-deteksi otomatis dari **header row**, case-insensitive, pakai
substring match (bukan exact match — lihat fungsi `idx()`):

| Kolom CSV (contoh header) | Match keyword | Field tujuan | Wajib? |
|---|---|---|---|
| `Kode Mitra` | `kode` | `driver_code` | Ya — tanpa ini baris gak bisa di-link ke rider |
| `Name` | `name` | (dipakai buat auto-create rider baru, bukan disimpan langsung) | Tidak |
| `Client Name` | `client` | `client_name` + lookup `client_id` | Tidak (fallback ke dropdown client di UI) |
| `Date` | `date` | `log_date` | Ya |
| `Clock-in` | `clock-in` | `clock_in` | Tidak |
| `Clock-out` | `clock-out` | `clock_out` | Tidak |
| `Duration` | `duration` | `duration_minutes` | Tidak |
| `OTP` | `otp` | `is_late` (`"late"` → true) | Tidak |

**Format tanggal** (`log_date`) — diterima 2 bentuk (fungsi `parseIndoDate`):
- ISO: `YYYY-MM-DD` atau `YYYY-MM-DD...` (prefix)
- Indonesia: `[nama hari,] D Bulan YYYY` (mis. `"Sabtu, 11 Juli 2026"` atau `"11 Juli 2026"`)
- Kalau ga kebaca dua-duanya → fallback ke tanggal hari ini (**bukan error**, jadi hati-hati kalau format tanggal CSV berubah)

**Format duration** (`duration_minutes`) — diterima 3 bentuk (fungsi `parseDur`):
- `"9h 51m"`, `"9h"`, atau `"51m"`
- `"HH:MM"` (mis. `"09:51"`)
- Angka polos (dianggap menit)

**Kode Mitra yang belum terdaftar** → rider baru otomatis dibuat
(`resolveOrCreateRiders`, status `active`, tanpa `client_id`) — bukan error,
row tetap masuk.

## "Response" — efek ke database

Tidak ada JSON response (client-side langsung baca hasil Supabase client
call). Efek ke DB:

**1. `upload_batches`** — 1 row per proses upload:
```
{ kind: "attendance", filename, row_count, uploaded_by (auth), created_at }
```

**2. `attendance_logs`** — 1 row per baris CSV (setelah dedup):
```
{
  batch_id,            -- FK ke upload_batches
  rider_id,            -- FK ke riders, null kalau kode ga match/ga ada
  driver_code,         -- kode MTR mentah dari CSV
  client_name,         -- nama client mentah dari CSV
  client_id,           -- FK ke clients, null kalau nama ga match
  log_date,            -- date, NOT NULL
  clock_in, clock_out,  -- time, nullable
  duration_minutes,    -- int, nullable
  is_absent,           -- true kalau clock_in kosong
  is_late,             -- true kalau kolom OTP = "late"
  fee                  -- default 0, diisi belakangan oleh Payroll Run
}
```

Toast sukses di UI ngasih tau: jumlah row masuk, jumlah data lama ditimpa,
jumlah baris dobel di-skip, jumlah rider baru ke-create. Kalau ada error di
tengah proses (gagal insert batch, gagal lookup rider, dll), proses
langsung berhenti dan toast error muncul — **tidak ada partial-success
report** kecuali untuk overwrite/dedup count di atas.

## Dedup — kunci `driver_code + log_date`

Satu rider cuma boleh punya 1 log per hari:
- Baris kembar **di dalam file yang sama** → di-skip (di-hitung sebagai `fileRepeatCount`)
- Baris yang **key-nya udah ada di DB** → row lama di-`DELETE` dulu, row baru di-`INSERT` (timpa, bukan duplikat)
- Re-upload file yang sama berkali-kali **aman** — gak akan numpuk data

## RLS / Auth

Semua tabel (`upload_batches`, `attendance_logs`, `riders`, `clients`)
di-gate lewat RLS `has_role(auth.uid(), 'admin')` — cuma admin yang login
bisa jalanin upload ini. Tidak ada service-role/API key yang dipakai di
jalur ini (beda dari fitur reminder/PNL push yang server-side).
