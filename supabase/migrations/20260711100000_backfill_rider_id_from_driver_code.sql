-- Sebagian delivery_records/attendance_logs punya driver_code (kode MTR)
-- tapi rider_id-nya NULL — biasanya baris lama yang di-upload sebelum
-- resolveOrCreateRiders() dipasang, atau match sempat gagal. Akibatnya baris
-- itu invisible buat Payroll Run generate() (yang jalan lewat rider_id),
-- walau fee-nya sudah benar di-commit dari Hitung Fee.
-- Non-destruktif: cuma isi rider_id yang NULL, cocokin exact ke riders.employee_id.
UPDATE public.delivery_records d
SET rider_id = r.id
FROM public.riders r
WHERE d.rider_id IS NULL
  AND d.driver_code IS NOT NULL
  AND d.driver_code = r.employee_id;

UPDATE public.attendance_logs a
SET rider_id = r.id
FROM public.riders r
WHERE a.rider_id IS NULL
  AND a.driver_code IS NOT NULL
  AND a.driver_code = r.employee_id;
