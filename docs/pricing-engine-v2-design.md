# Pricing Engine v2 — Konsolidasi 3-Kategori

Status: **Draft — hasil brainstorming, belum diimplementasi, skill `dash-payroll-engine` belum diupdate.**
Tanggal: 2026-07-11

## 1. Konteks & Kenapa Ini Dibikin

Skill project (`dash-payroll-engine`) mencatat 5 model pricing resmi. Kode di repo ini sekarang punya **6** `calc_type` (`flat_unit`, `tier`, `tier_daily`, `threshold_multiple`, `attendance`, `combined`) — `combined` ditambahkan atas permintaan user tapi belum di-generalisasi, jadi berpotensi jadi cabang baru tiap ada kombinasi kebutuhan client lain.

Audit kode (`src/lib/pricing-calc.ts`) nemuin akar masalahnya: ada **3 engine kalkulasi terpisah** —

- `calcScheme()` — flat_unit / tier / tier_daily / threshold_multiple, sumber data `delivery_records`.
- `calcAttendanceScheme()` — attendance, sumber data `attendance_logs`.
- `calcCombinedScheme()` — reimplementasi ulang logic proporsi jam kerja dari `calcAttendanceScheme` (rumus `fullFee × proporsi_jam` dicopy, bukan direuse) DAN logic tier per-order dari `calcScheme`, digabung jadi satu fungsi baru.

Selain masalah duplikasi, `calcCombinedScheme()` **hardcode** komponen order fee-nya cuma bisa tier-based (`order_tier: StepTier`) — gak ada opsi flat/area-based. Padahal kebutuhan riil di lapangan (dikonfirmasi user): ada client yang butuh kombinasi *attendance + order fee tiering* **atau** *attendance + order fee area/flat*. Skema `combined` yang ada sekarang gak bisa melayani varian kedua itu.

Data `pricing_schemes` di Supabase sekarang berisi campuran dummy dan **scheme client asli** (3+ scheme pakai `combined`), jadi redesign ini butuh migration path yang aman, bukan sekadar ganti kode.

## 2. Prinsip Desain

1. **Jangan ubah rumus kalkulasi.** `stepTierFee()` dan rumus proporsi jam attendance (`fullFee × proporsi`) tetap byte-identical. Yang berubah cuma *bagaimana komponen-komponen ini dirangkai*, bukan hasil matematikanya.
2. **3 kategori, bukan N kombinasi.** Daripada bikin `calc_type` baru tiap ada kombinasi, generalisasi jadi: pilih base component (dari kategori 1) + opsional nyalain time component (kategori 2). Kategori 3 bukan tipe berdiri sendiri secara logic — dia adalah kategori 1 + kategori 2 dinyalain bareng.
3. **Reuse, bukan reimplement.** Fungsi kalkulasi delivery-based dan attendance-based masing-masing diekstrak jadi 1 fungsi murni yang dipanggil dari mana saja (base standalone, atau dari dalam hybrid) — bukan dicopy.
4. **Migrasi data eksisting wajib zero-surprise.** Scheme yang bukan `combined` (flat_unit/tier/tier_daily/threshold_multiple/attendance) tidak butuh transformasi config sama sekali — hanya re-tag kategori. Hanya scheme `combined` yang butuh transformasi shape.

## 3. Taksonomi Baru

### Kategori 1 — Per Pengiriman (`delivery`)
Sub-tipe (dipilih di dalam kategori, bukan `calc_type` terpisah):
- `flat` — dulunya `flat_unit`
- `tier` — dulunya `tier` / `tier_daily` (akumulasi harian jadi flag `accumulate: "daily" | "per_order"` di dalam sub-tipe ini, bukan tipe terpisah)
- `threshold` — dulunya `threshold_multiple`

Sumber data: `delivery_records`. Output: fee per baris.

### Kategori 2 — Per Kehadiran (`attendance`)
Base harian proporsional + overtime opsional + incentive list (bisa lebih dari satu, kondisional `always` / `ontime_only`). Ini **superset** dari `combined` yang sekarang (combined cuma punya 1 `ontime_bonus` flat, gak ada overtime, gak ada incentive list) — jadi hybrid otomatis dapet fitur overtime & multi-incentive yang sebelumnya cuma ada di attendance standalone.

Sumber data: `attendance_logs`. Output: fee per hari per rider.

### Kategori 3 — Kombinasi (`hybrid`)
```
hybrid = 1 sub-tipe dari Kategori 1 (delivery component)
       + Kategori 2 dinyalain (attendance component)
       + modifier (add_kg / multi_drop / billing_addons) — tetap seperti sekarang
```
Bukan fungsi kalkulasi baru. Engine hybrid = panggil delivery-component calculator + attendance-component calculator, lalu jumlahkan per rider per hari (alokasi ke baris pakai `allocInt()` yang sudah ada, tidak berubah).

## 4. Perubahan Schema (`params` JSON di `pricing_schemes`)

**Tidak berubah** (flat/tier/threshold/attendance standalone) — hanya field `calc_type` di tabel yang di-retag menjadi kombinasi `category` + `subtype`:

```jsonc
// sebelum
{ "calc_type": "tier", "params": { "type": "tier", "config": { "distance": {...}, "weight": {...} }, ... } }

// sesudah (config JSON di dalam SAMA PERSIS, cuma pembungkusnya berubah)
{ "category": "delivery", "subtype": "tier", "params": { "config": { "distance": {...}, "weight": {...} }, ... } }
```

**Berubah** (scheme `combined` existing) — perlu migration nyata:

```jsonc
// sebelum
{
  "calc_type": "combined",
  "params": {
    "type": "combined",
    "config": {
      "full_fee": 100000, "standard_minutes": 480, "ontime_bonus": 20000,
      "order_by": "distance", "order_tier": { "base_fee": 5000, ... }
    }
  }
}

// sesudah
{
  "category": "hybrid",
  "subtype": "tier",              // dari order_by/order_tier -> jadi delivery component "tier"
  "params": {
    "delivery_config": { "distance": { "base_fee": 5000, ... }, "weight": null },
    "attendance_config": {
      "full_fee": 100000, "standard_minutes": 480,
      "overtime": null,
      "incentives": [{ "label": "Bonus Ontime", "amount": 20000, "condition": "ontime_only" }]
    }
  }
}
```
Kalau combined lama pakai `order_by: "weight"` → `subtype: "tier"` tetap, tinggal isi `weight` bukan `distance`. Belum ada kasus combined dengan flat/area based di data existing (setahu ini) — tapi struktur baru mendukungnya (`subtype: "flat"` juga valid di dalam hybrid).

## 5. Perubahan di `pricing-calc.ts`

- Ekstrak logic base kategori 1 (flat/tier/threshold) dari `calcScheme()` jadi fungsi murni per sub-tipe: `calcFlatComponent()`, `calcTierComponent()`, `calcThresholdComponent()` — masing-masing terima rows, kembaliin fee per baris (tanpa modifier, tanpa skip/anomaly logic).
- Ekstrak logic kategori 2 dari `calcAttendanceScheme()` jadi `calcAttendanceComponent()` — terima attendance logs, kembaliin `{daily_base, overtime, incentive}` per rider per hari.
- `calcScheme()` (standalone delivery) dan `calcAttendanceScheme()` (standalone attendance) jadi wrapper tipis yang manggil component + tempelin skip/anomaly/modifier logic yang sudah ada (tidak berubah).
- `calcCombinedScheme()` **dihapus**, diganti `calcHybridScheme()` yang manggil `calc<Subtype>Component()` + `calcAttendanceComponent()`, lalu alokasi gabungan pakai `allocInt()` yang sudah ada.
- **Regression test wajib**: untuk tiap scheme existing (dummy maupun asli), hitung pakai engine lama vs engine baru dengan data delivery/attendance yang sama, assert `perRow`/`perRider`/`subtotal` identik sampai ke rupiah. Ini jalan SEBELUM cutover, bukan sesudah.

## 6. Dampak ke UI (`pricing-form.tsx`)

File ini sekarang **1268 baris** — sudah melanggar aturan CLAUDE.md project ("keep files under 500 lines"). Redesign ini momentum yang tepat buat pecah jadi:
- `pricing-form.tsx` — shell (info card, tombol save, pemilihan kategori/subtype)
- `pricing-form/delivery-fields.tsx` — form field kategori 1 (flat/tier/threshold)
- `pricing-form/attendance-fields.tsx` — form field kategori 2
- `pricing-form/interactive-calc.tsx` — kalkulator interaktif (sudah lumayan berdiri sendiri di kode saat ini)

UI kategori jadi 2 level: pilih kategori dulu (Per Pengiriman / Per Kehadiran / Kombinasi), baru kalau "Per Pengiriman" atau "Kombinasi" muncul sub-pilihan (Flat/Tier/Threshold).

## 7. Migration Plan (data existing)

1. Inventory dulu: query semua `pricing_schemes` yang `calc_type = 'combined'`, catat `client_id`, `order_by`, isi `order_tier` — pastikan gak ada varian tak terduga (misal `order_tier` kosong/null).
2. Tulis migration script (bisa SQL `UPDATE ... SET params = jsonb_build_object(...)`, atau script Node one-off) yang transform tiap row combined → shape hybrid baru. **Idempotent** dan **dry-run mode dulu** (print hasil transform tanpa nulis) sebelum apply.
3. Jalankan regression test (bagian 5) pakai scheme yang sudah dimigrasi vs scheme lama, di environment staging/dummy dulu.
4. Setelah lolos, migration jalan di production, deploy kode baru bareng.
5. RLS yang sekarang udah enabled di `pricing_schemes` — pastikan migration script jalan pakai service role (bukan lewat client authenticated) biar gak kena block RLS.

## 8. Rollout Plan (urutan kerja, bukan langsung digarap semua)

1. Regression test harness dulu (jalanin engine lama, simpen snapshot hasil) — supaya ada baseline sebelum refactor apa pun.
2. Ekstrak component functions di `pricing-calc.ts`, tes hasilnya sama dengan snapshot.
3. Migration script (dry-run) untuk scheme `combined` existing.
4. Update `pricing-types.ts` (schema baru) + `pricing-form.tsx` (pecah file, UI 2-level).
5. Apply migration di production, deploy.
6. Baru setelah semua ini stabil → update skill `dash-payroll-engine` (references/pricing-schemes.md) supaya dokumentasi balik sinkron dengan kode.

## 9. Open Questions

- Ada scheme `combined` existing yang `order_by`/`order_tier`-nya kosong/tidak lengkap? (perlu inventory nyata, belum dicek)
- Apakah `tier_daily` benar-benar perlu jadi flag `accumulate` di dalam subtype `tier`, atau ada alasan bisnis kenapa dia harus tetap subtype terpisah dari `tier` biasa?
- Siapa yang approve migration production (single approver atau perlu review lain)? — ini overlap sama open question "approval flow payroll" yang sudah dicatat di `status-and-priorities.md`.

## 10. Non-Goals (sengaja tidak dikerjakan di scope ini)

- Tidak menambah kategori/sub-tipe baru di luar yang sudah dikonfirmasi.
- Tidak mengubah rumus kalkulasi apa pun (`stepTierFee`, proporsi jam, alokasi `allocInt`).
- Tidak menyentuh dynamic UI form styling di luar yang perlu buat 2-level category/subtype.
