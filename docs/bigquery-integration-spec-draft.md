# BigQuery Integration — Draft Spec

> **STATUS: DRAFT — NEEDS REVIEW.** Ini bukan dokumen arsitektur final. Ditulis untuk mengisi backlog item #9 (`docs/PRD.md` §10, "BigQuery integration — Belum digarap, prioritas rendah") dengan titik awal diskusi, bukan rencana implementasi siap-jalan. Sengaja ringkas — lihat §5 kenapa.

Tanggal: 2026-07-11
Dokumen terkait: `docs/PRD.md` (§8 Intelligence Mode, §10 backlog), `docs/BLUEPRINT.md` §4 (data model).

---

## 1. Business Question — Apa yang Belum Terjawab Intelligence Mode Sekarang?

Intelligence Mode saat ini (`pnl-dashboard`, `pnl`, `revenue-analytics`, `bcr-analytics`, `shipment-analytics`, `driver-analytics`) sudah menjawab pertanyaan operasional inti: *client mana yang margin-nya sehat/tipis/rugi, minggu ini, bulan ini, tren beberapa bulan terakhir*. Semua dihitung on-the-fly dari Postgres (`computePnl()` di `pnl-engine.ts`) atas data yang masih hidup di tabel transaksional (`delivery_records`, `attendance_logs`, `payroll_details`, dst).

Yang **tidak** dijawab oleh setup ini, dan jadi alasan BigQuery pernah muncul di percakapan:

- **Analisis historis lintas-tahun / retensi jangka panjang.** Postgres produksi tidak didesain untuk menyimpan dan meng-query 3-5 tahun data delivery/attendance mentah tanpa memperlambat query operasional. Kalau suatu saat dibutuhkan analisis "tren margin client X selama 2 tahun terakhir per kuartal", ini beban query yang beda kelas dari dashboard real-time yang ada sekarang.
- **Ad-hoc analytical query di luar bentuk dashboard yang sudah ditentukan.** Intelligence Mode punya 6 halaman dengan pertanyaan yang sudah di-hardcode (revenue per client, BCR, driver aggregation, dst). Kalau management butuh pertanyaan baru yang belum ada halamannya (misal: "korelasi antara `district` dan tingkat retur, dipotong per hari-dalam-minggu, lintas 18 bulan") — itu butuh SQL ad-hoc di atas data warehouse, bukan halaman dashboard baru tiap kali ada pertanyaan baru.
- **Join dengan sumber data eksternal.** Kalau ke depan ada kebutuhan gabungin data payroll dengan data non-Supabase (misal data cuaca, data traffic, atau data finance dari sistem lain), BigQuery (atau warehouse manapun) adalah tempat yang natural untuk itu — Postgres produksi bukan tempatnya.

**Catatan penting:** ketiga kebutuhan di atas **belum ada sebagai permintaan konkret dari bisnis** hari ini. Ini kenapa item ini prioritas rendah — bukan karena tidak berguna, tapi karena belum ada pertanyaan nyata yang menunggu jawaban yang butuh warehouse terpisah. Semua kebutuhan analitik yang sudah dikonfirmasi user sejauh ini tercakup oleh Intelligence Mode yang sudah ada (lihat `PRD.md` §8, termasuk daftar item yang sengaja di-skip karena sudah tercakup).

## 2. Proposed Sync Approach

Dua opsi, bukan keputusan final:

| Opsi | Cara Kerja | Kompleksitas | Kapan Masuk Akal |
|---|---|---|---|
| **Batch export (disarankan sebagai starting point)** | Job terjadwal (mis. harian, di luar jam sibuk) query tabel/view sumber, dump ke file (Parquet/CSV), load ke BigQuery via `bq load` atau Storage Transfer. Bisa reuse pola `fetchAllRowsAdmin` (paginasi 1000 baris/halaman) yang sudah ada di `pnl-weekly-push.server.ts`. | Rendah — tidak butuh infrastruktur baru selain job scheduler (bisa pakai `pg_cron` + `pg_net` yang sudah dipakai Weekly PNL Push, pola sudah familiar di repo ini) | Kalau kebutuhan cuma "punya salinan data historis buat query ad-hoc", freshness harian cukup |
| **CDC (Change Data Capture)** | Stream perubahan row-level dari Postgres (mis. lewat Debezium / Supabase's logical replication) ke BigQuery near-real-time. | Tinggi — infrastruktur baru (connector, message queue/pipeline), monitoring tambahan, biaya operasional lebih besar | Hanya kalau ada kebutuhan nyata untuk data warehouse yang *real-time*, yang sejauh ini belum ada use case-nya (dashboard real-time sudah dilayani langsung dari Postgres) |

**Rekomendasi draft:** mulai dari batch export harian kalau/ketika item ini benar-benar dikerjakan. CDC sengaja tidak direkomendasikan di tahap ini — kompleksitas dan biayanya tidak sepadan dengan kebutuhan yang belum konkret (lihat §1).

## 3. Tabel/View yang Akan Disinkronkan (kandidat, urutan prioritas)

Mengacu ke data model `docs/BLUEPRINT.md` §4:

1. `delivery_records` — data mentah, volume terbesar, paling bernilai untuk analisis historis (district, distance, weight, service_type, status, delivery_type, fee).
2. `attendance_logs` — pasangan alami dari `delivery_records` untuk analisis kombinasi kehadiran + kiriman lintas waktu.
3. `report_summary_weekly` (view) — sudah jadi single source of truth untuk angka payroll per-rider-per-run; hasil kalkulasi (bukan data mentah), jadi kandidat baik untuk warehouse tanpa perlu replikasi logic kalkulasi.
4. `pnl_weekly_snapshots` — histori snapshot PNL mingguan yang sudah terstruktur, gampang disinkronkan karena volumenya kecil (1 baris per minggu) dan sudah dalam bentuk agregat.
5. `clients`, `riders` — tabel dimensi (kecil, jarang berubah), dibutuhkan untuk join/label di sisi warehouse.

**Sengaja tidak disertakan (di draft ini):** `payroll_deductions`, `rider_installments`, `payslips`, `invoice_details` — data finansial sensitif per-individu yang belum ada kasus penggunaan analitik lintas-historis yang jelas; kalaupun disinkronkan nanti, butuh pertimbangan privasi/akses terpisah di luar scope draft ringkas ini.

## 4. Perlu Diklarifikasi Sebelum Jadi Spec Penuh

- Siapa konsumen akhir data BigQuery ini — data analyst internal, management, atau tool BI eksternal (Looker Studio, dst)? Ini menentukan skema target dan level agregasi.
- Retensi berapa lama yang dibutuhkan di Postgres vs yang harus "pindah" ke warehouse?
- Ada kebutuhan compliance/privasi soal data rider (PII) yang keluar dari Supabase ke Google Cloud?
- Budget/biaya BigQuery storage + query — belum ada estimasi.

## 5. Kenapa Draft Ini Sengaja Ringkas

Item ini eksplisit ditandai "prioritas rendah, belum digarap" di `PRD.md` §10 dan disebut lagi di §12 (Risiko & Isu Terbuka) sebagai sesuatu yang "kalau jadi kebutuhan mendesak, perlu sesi brainstorming/spec terpisah sebelum implementasi." Menulis dokumen arsitektur penuh (skema target detail, IAM/security model, cost modeling, disaster recovery, dsb.) untuk item yang belum punya business case konkret berisiko jadi kerja spekulatif yang harus ditulis ulang begitu kebutuhan nyata muncul. Draft ini cukup untuk jadi titik mulai diskusi kalau/ketika prioritas berubah — bukan untuk langsung dieksekusi.
