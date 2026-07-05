import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { parseCSV } from "@/lib/csv";
import { resolveOrCreateRiders } from "@/lib/rider-lookup";
import { classifyAllClients } from "@/lib/delivery-classification";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { Upload, FileText, Loader2, AlertTriangle, X, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/admin/upload")({ component: UploadPage });

type Client = { id: string; name: string };

// buat query .in() dgn ribuan ID tanpa nabrak batas panjang URL
async function inChunks<T>(table: string, column: string, values: string[], select: string): Promise<T[]> {
  const uniq = Array.from(new Set(values.filter(Boolean)));
  const out: T[] = [];
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await (supabase as any).from(table).select(select).in(column, uniq.slice(i, i + 200));
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

function UploadPage() {
  const [tab, setTab] = useState<"delivery" | "attendance">("delivery");
  return (
    <AdminLayout title="Upload Data">
      <div className="flex gap-1 p-1 bg-muted rounded-md w-fit mb-5">
        {(["delivery","attendance"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm rounded ${tab === t ? "bg-card shadow-sm font-medium" : "text-muted-foreground"}`}>
            {t === "delivery" ? "Upload Delivery" : "Upload Attendance"}
          </button>
        ))}
      </div>
      {tab === "delivery" ? <DeliveryUpload /> : <AttendanceUpload />}
    </AdminLayout>
  );
}

const DELIVERY_FIELDS = ["driver_code","driver_name","client_name","status","dash_delivery_id","provider_order_id","delivery_date","awb","district","distance_km","weight_kg","destination_address","sender_name","receiver_name","service_type"];

interface DeliveryPreview {
  records: Record<string, unknown>[]; // sudah dikurangi duplikat, siap insert
  totalRows: number;
  duplicateCount: number;
  duplicateSamples: { dash: string; provider: string; source: "file" | "database" }[];
  anomalyCount: number;
  anomalySamples: { dash: string; provider: string }[];
  unmatchedClients: string[];
  createdRiderCodes: string[];
}

function DeliveryUpload() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [preview, setPreview] = useState<DeliveryPreview | null>(null);
  const [reclassifying, setReclassifying] = useState(false);

  useEffect(() => {
    supabase.from("clients").select("id, name").then(({ data }) => setClients(data ?? []));
  }, []);

  // Buat data lama yang udah keupload SEBELUM fitur klasifikasi Delivery/Return
  // ini ada — hitung ulang semua client, bukan cuma yang baru diupload.
  const reclassifyAll = async () => {
    if (!(await confirmDialog({ title: "Hitung ulang Delivery/Return?", description: `Untuk semua ${clients.length} client. Ini bisa makan waktu kalau datanya banyak.`, confirmText: "Hitung ulang", danger: false }))) return;
    setReclassifying(true);
    try {
      const results = await classifyAllClients(clients.map((c) => c.id));
      const totalUnclassified = results.reduce((s, r) => s + r.unclassifiedCount, 0);
      toast.success(`Klasifikasi ulang selesai buat ${results.length} client.`);
      if (totalUnclassified > 0) toast.warning(`${totalUnclassified} baris ga bisa ditandain (kemungkinan outlet-ke-outlet) — cek data Sender/Receiver Name.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReclassifying(false);
    }
  };

  const onFile = async (f: File) => {
    setFile(f);
    const text = await f.text();
    const parsed = parseCSV(text);
    if (!parsed.length) return toast.error("CSV kosong");
    setHeaders(parsed[0]); setRows(parsed.slice(1));
    const m: Record<string, string> = {};
    DELIVERY_FIELDS.forEach((field) => {
      let found = parsed[0].find((h) => h.toLowerCase().replace(/[^a-z]/g, "") === field.replace(/_/g, ""));
      // Fallback buat nama kolom yang lebih verbose di data mentah operasional
      // (mis. "Total Distance In KM" alih-alih "distance_km").
      if (!found) {
        if (field === "client_name") found = parsed[0].find((h) => /provider|client/i.test(h));
        else if (field === "distance_km") found = parsed[0].find((h) => /distance/i.test(h));
        else if (field === "weight_kg") found = parsed[0].find((h) => /weight/i.test(h));
        else if (field === "destination_address") found = parsed[0].find((h) => /destination/i.test(h) && !/lat|long/i.test(h));
      }
      if (found) m[field] = found;
    });
    setMapping(m);
  };

  const hasClientColumn = !!mapping["client_name"];
  const hasDedupKeys = !!mapping["dash_delivery_id"] && !!mapping["provider_order_id"];

  // Tahap 1: baca file, cocokkan rider/client, cek duplikat — TAMPILIN dulu
  // hasilnya sebelum beneran nulis ke database.
  const analyze = async () => {
    if (!clientId && !hasClientColumn) return toast.error("Pilih client, atau map kolom client di file");
    if (!file || rows.length === 0) return toast.error("Upload CSV dulu");
    setAnalyzing(true);

    const get = (r: string[], f: string) => {
      const idx = headers.indexOf(mapping[f]);
      return idx >= 0 ? r[idx] : null;
    };

    const codes = rows.map((r) => get(r, "driver_code"));
    const namesByCode: Record<string, string> = {};
    rows.forEach((r) => {
      const code = get(r, "driver_code");
      const name = get(r, "driver_name");
      if (code && name) namesByCode[code] = name;
    });
    let riderMap: Map<string, string>;
    let createdCodes: string[];
    try {
      ({ map: riderMap, createdCodes } = await resolveOrCreateRiders(codes, namesByCode));
    } catch (e) {
      setAnalyzing(false);
      return toast.error(`Gagal lookup rider: ${(e as Error).message}`);
    }

    // Client TIDAK di-auto-create (beda kebijakan sama rider) — nama yang ga
    // ketemu di daftar client yang ADA cuma diflag, bukan ditebak/dibikinin,
    // karena salah tulis dikit bisa bikin "client hantu" & fee nyasar.
    const clientByName = new Map(clients.map((c) => [c.name.trim().toLowerCase(), c.id]));
    const unmatchedClients = new Set<string>();
    const resolveClientId = (rawName: string | null): string | null => {
      if (rawName && rawName.trim()) {
        const hit = clientByName.get(rawName.trim().toLowerCase());
        if (hit) return hit;
        unmatchedClients.add(rawName.trim());
        return null; // JANGAN fallback ke dropdown — beda client, jangan ditebak salah
      }
      return clientId || null; // baris tanpa nilai client -> pakai default dropdown
    };

    const records = rows.map((r) => {
      const driverCode = get(r, "driver_code");
      return {
        client_id: hasClientColumn ? resolveClientId(get(r, "client_name")) : (clientId || null),
        rider_id: driverCode ? riderMap.get(driverCode) ?? null : null,
        driver_code: driverCode,
        status: get(r, "status"),
        dash_delivery_id: get(r, "dash_delivery_id"),
        provider_order_id: get(r, "provider_order_id"),
        delivery_date: get(r, "delivery_date") || new Date().toISOString().slice(0, 10),
        awb: get(r, "awb"), district: get(r, "district"),
        distance_km: parseFloat(get(r, "distance_km") || "0") || null,
        weight_kg: parseFloat(get(r, "weight_kg") || "0") || null,
        destination_address: get(r, "destination_address"),
        sender_name: get(r, "sender_name"),
        receiver_name: get(r, "receiver_name"),
        service_type: get(r, "service_type"),
      };
    });

    // Deteksi duplikat: kunci = dash_delivery_id DAN provider_order_id
    // dua-duanya harus sama baru dianggap duplikat. Kalau cuma salah satu
    // yang sama -> anomali, tetap diupload tapi diflag (jangan auto-skip).
    let duplicateSamples: DeliveryPreview["duplicateSamples"] = [];
    let anomalySamples: DeliveryPreview["anomalySamples"] = [];
    let finalRecords = records;

    if (hasDedupKeys) {
      const dashIds = records.map((r) => r.dash_delivery_id).filter((v): v is string => !!v);
      const providerIds = records.map((r) => r.provider_order_id).filter((v): v is string => !!v);
      const [byDash, byProvider] = await Promise.all([
        inChunks<{ dash_delivery_id: string; provider_order_id: string }>("delivery_records", "dash_delivery_id", dashIds, "dash_delivery_id, provider_order_id"),
        inChunks<{ dash_delivery_id: string; provider_order_id: string }>("delivery_records", "provider_order_id", providerIds, "dash_delivery_id, provider_order_id"),
      ]);
      const dbByDash = new Map<string, Set<string>>();
      const dbByProvider = new Map<string, Set<string>>();
      [...byDash, ...byProvider].forEach((e) => {
        if (e.dash_delivery_id) (dbByDash.get(e.dash_delivery_id) ?? dbByDash.set(e.dash_delivery_id, new Set()).get(e.dash_delivery_id)!).add(e.provider_order_id);
        if (e.provider_order_id) (dbByProvider.get(e.provider_order_id) ?? dbByProvider.set(e.provider_order_id, new Set()).get(e.provider_order_id)!).add(e.dash_delivery_id);
      });

      const seenInFile = new Map<string, number>(); // key -> index kemunculan pertama
      const isDuplicate: boolean[] = new Array(records.length).fill(false);
      const duplicates: DeliveryPreview["duplicateSamples"] = [];
      const anomalies: DeliveryPreview["anomalySamples"] = [];

      records.forEach((rec, i) => {
        const dash = rec.dash_delivery_id as string | null;
        const provider = rec.provider_order_id as string | null;
        if (!dash || !provider) return; // ga bisa dicek tanpa dua-duanya
        const key = dash + "|" + provider;
        if (seenInFile.has(key)) {
          isDuplicate[i] = true;
          duplicates.push({ dash, provider, source: "file" });
          return;
        }
        seenInFile.set(key, i);
        if (dbByDash.get(dash)?.has(provider)) {
          isDuplicate[i] = true;
          duplicates.push({ dash, provider, source: "database" });
        } else if (dbByDash.has(dash) || dbByProvider.has(provider)) {
          anomalies.push({ dash, provider });
        }
      });

      finalRecords = records.filter((_, i) => !isDuplicate[i]);
      duplicateSamples = duplicates;
      anomalySamples = anomalies;
    }

    setAnalyzing(false);
    setPreview({
      records: finalRecords,
      totalRows: records.length,
      duplicateCount: duplicateSamples.length,
      duplicateSamples: duplicateSamples.slice(0, 50),
      anomalyCount: anomalySamples.length,
      anomalySamples: anomalySamples.slice(0, 50),
      unmatchedClients: Array.from(unmatchedClients),
      createdRiderCodes: createdCodes,
    });
  };

  // Tahap 2: user udah liat preview & klik lanjut -> baru beneran ditulis.
  const confirmUpload = async () => {
    if (!preview || !file) return;
    setBusy(true);
    const { data: batch, error: bErr } = await supabase.from("upload_batches")
      .insert({ kind: "delivery", client_id: clientId || null, filename: file.name, row_count: preview.records.length })
      .select().single();
    if (bErr) { setBusy(false); return toast.error(bErr.message); }

    const records = preview.records.map((r) => ({ ...r, batch_id: batch.id }));
    let inserted = 0;
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500);
      const { error } = await (supabase as any).from("delivery_records").insert(chunk);
      if (error) { setBusy(false); return toast.error(error.message); }
      inserted += chunk.length;
    }

    // Klasifikasi Delivery/Return otomatis buat tiap client yang kena upload ini
    const affectedClientIds = Array.from(new Set(records.map((r) => (r as { client_id?: string | null }).client_id).filter((v): v is string => !!v)));
    let unclassifiedTotal = 0;
    if (affectedClientIds.length > 0) {
      try {
        const results = await classifyAllClients(affectedClientIds);
        unclassifiedTotal = results.reduce((s, r) => s + r.unclassifiedCount, 0);
      } catch (e) {
        toast.warning(`Klasifikasi Delivery/Return gagal jalan: ${(e as Error).message}`);
      }
    }

    setBusy(false);
    toast.success(
      `Berhasil upload ${inserted} record` +
      (preview.duplicateCount ? ` · ${preview.duplicateCount} duplikat di-skip` : "") +
      (preview.createdRiderCodes.length ? ` · ${preview.createdRiderCodes.length} rider baru otomatis terdaftar` : "")
    );
    if (preview.unmatchedClients.length > 0) {
      toast.warning(`Nama client tidak dikenal (baris ini ke-skip dari perhitungan sampai dibetulkan): ${preview.unmatchedClients.join(", ")}`);
    }
    if (preview.anomalyCount > 0) {
      toast.warning(`${preview.anomalyCount} baris anomali (cuma salah satu ID cocok) — tetap terupload, tapi cek manual.`);
    }
    if (unclassifiedTotal > 0) {
      toast.warning(`${unclassifiedTotal} baris ga bisa ditandain Delivery/Return (sender & receiver dua-duanya bukan titik pusat — kemungkinan kiriman outlet-ke-outlet). Cek & lengkapi data Sender/Receiver Name kalau ini seharusnya bukan kasus itu.`);
    }
    setFile(null); setHeaders([]); setRows([]); setMapping({}); setPreview(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={reclassifyAll} disabled={reclassifying || clients.length === 0}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
          {reclassifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Hitung Ulang Delivery/Return (semua data lama)
        </button>
      </div>
      <div>
        <label className="text-sm font-medium">Client {hasClientColumn && <span className="font-normal text-muted-foreground">(diabaikan — file sudah punya kolom client sendiri, per baris auto-detect)</span>}</label>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={hasClientColumn}
          className="mt-1 w-full max-w-sm rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50">
          <option value="">— pilih client —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          {hasClientColumn
            ? "Client dideteksi otomatis per baris dari file (1 file boleh campur banyak client)."
            : "Dipakai kalau file TIDAK punya kolom client sendiri. Kalau file punya kolom Provider Name/Client, itu otomatis kepakai duluan."}
        </p>
      </div>
      <label className="block">
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="hidden" />
        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30">
          <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm">{file ? <span className="font-medium">{file.name}</span> : "Klik untuk upload CSV"}</p>
        </div>
      </label>
      {headers.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h4 className="text-sm font-semibold mb-2">Mapping Kolom ({rows.length} baris)</h4>
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            {DELIVERY_FIELDS.map((f) => (
              <div key={f} className="flex items-center gap-2">
                <span className="font-mono text-xs w-44">{f}</span>
                <select value={mapping[f] ?? ""} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value })}
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs">
                  <option value="">—</option>
                  {headers.map((h, i) => <option key={`${h}-${i}`} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
      {!hasDedupKeys && rows.length > 0 && (
        <p className="text-xs text-warning">Kolom Dash Delivery ID / Provider Order ID ga ke-map — deteksi duplikat ga bisa jalan buat upload ini.</p>
      )}
      <button onClick={analyze} disabled={analyzing || rows.length === 0 || (!clientId && !hasClientColumn)}
        className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50">
        {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} {analyzing ? "Menganalisa…" : "Analisa & Preview"}
      </button>
      {preview && (
        <DeliveryPreviewModal
          preview={preview}
          busy={busy}
          onCancel={() => setPreview(null)}
          onConfirm={confirmUpload}
        />
      )}
    </div>
  );
}

function DeliveryPreviewModal({ preview, busy, onCancel, onConfirm }: {
  preview: DeliveryPreview;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={onCancel}>
      <div className="bg-card rounded-lg w-full max-w-lg p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Preview Upload</h2>
          <button onClick={onCancel} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm mb-4">
          <div className="rounded-md border border-border p-2.5"><div className="text-xs text-muted-foreground">Total baris di file</div><div className="font-semibold">{preview.totalRows}</div></div>
          <div className="rounded-md border border-border p-2.5"><div className="text-xs text-muted-foreground">Siap diupload</div><div className="font-semibold text-success">{preview.records.length}</div></div>
          <div className="rounded-md border border-border p-2.5"><div className="text-xs text-muted-foreground">Duplikat (di-skip)</div><div className="font-semibold text-warning">{preview.duplicateCount}</div></div>
          <div className="rounded-md border border-border p-2.5"><div className="text-xs text-muted-foreground">Anomali (cek manual)</div><div className="font-semibold text-warning">{preview.anomalyCount}</div></div>
        </div>

        {preview.duplicateSamples.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium mb-1">Contoh duplikat (Dash ID + Provider ID sama-sama cocok):</p>
            <div className="rounded-md border border-border max-h-32 overflow-y-auto text-xs font-mono">
              {preview.duplicateSamples.map((d, i) => (
                <div key={i} className="px-2 py-1 border-t border-border first:border-t-0 flex justify-between gap-2">
                  <span className="truncate">{d.dash} / {d.provider}</span>
                  <span className="text-muted-foreground flex-shrink-0">{d.source === "file" ? "dobel di file" : "sudah ada di DB"}</span>
                </div>
              ))}
              {preview.duplicateCount > preview.duplicateSamples.length && (
                <div className="px-2 py-1 border-t border-border text-muted-foreground">+{preview.duplicateCount - preview.duplicateSamples.length} lainnya</div>
              )}
            </div>
          </div>
        )}

        {preview.anomalySamples.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 text-warning text-xs font-medium mb-1"><AlertTriangle className="w-3.5 h-3.5" /> Cuma SALAH SATU ID yang cocok — bukan duplikat pasti, tetap terupload:</div>
            <div className="rounded-md border border-border max-h-32 overflow-y-auto text-xs font-mono">
              {preview.anomalySamples.map((d, i) => (
                <div key={i} className="px-2 py-1 border-t border-border first:border-t-0">{d.dash} / {d.provider}</div>
              ))}
              {preview.anomalyCount > preview.anomalySamples.length && (
                <div className="px-2 py-1 border-t border-border text-muted-foreground">+{preview.anomalyCount - preview.anomalySamples.length} lainnya</div>
              )}
            </div>
          </div>
        )}

        {preview.unmatchedClients.length > 0 && (
          <div className="mb-3 text-xs text-warning">
            Nama client tidak dikenal (baris ini ga dihitung): {preview.unmatchedClients.join(", ")}
          </div>
        )}
        {preview.createdRiderCodes.length > 0 && (
          <div className="mb-3 text-xs text-muted-foreground">{preview.createdRiderCodes.length} rider baru bakal otomatis terdaftar.</div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm rounded border border-border">Batal</button>
          <button onClick={onConfirm} disabled={busy || preview.records.length === 0}
            className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50">
            {busy ? "Mengupload…" : `Lanjutkan Upload (${preview.records.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function AttendanceUpload() {
  const [clients, setClients] = useState<Client[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("clients").select("id, name").then(({ data }) => setClients(data ?? []));
  }, []);

  const onFile = async (f: File) => {
    setFile(f);
    const text = await f.text();
    const parsed = parseCSV(text);
    if (!parsed.length) return toast.error("CSV kosong");
    setHeaders(parsed[0]); setRows(parsed.slice(1));
  };

  const parseDur = (s: string): number | null => {
    if (!s) return null;
    const m = s.match(/(\d+):(\d+)/);
    if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
    const n = parseInt(s); return isNaN(n) ? null : n;
  };

  const process = async () => {
    if (!file || rows.length === 0) return toast.error("Upload CSV dulu");
    setBusy(true);
    const { data: batch, error: bErr } = await supabase.from("upload_batches")
      .insert({ kind: "attendance", filename: file.name, row_count: rows.length }).select().single();
    if (bErr) { setBusy(false); return toast.error(bErr.message); }

    const idx = (name: string) => headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));
    const iCode = idx("kode"), iName = idx("name"), iClient = idx("client"), iDate = idx("date"), iIn = idx("clock-in"), iOut = idx("clock-out"), iDur = idx("duration"), iOtp = idx("otp");

    // Rider berdiri sendiri dari kode MTR — sama seperti upload delivery,
    // kode yang belum terdaftar otomatis dibikinkan rider baru.
    const codes = rows.map((r) => r[iCode]);
    const namesByCode: Record<string, string> = {};
    if (iName >= 0) rows.forEach((r) => { if (r[iCode] && r[iName]) namesByCode[r[iCode]] = r[iName]; });
    let riderMap: Map<string, string>;
    let createdCodes: string[];
    try {
      ({ map: riderMap, createdCodes } = await resolveOrCreateRiders(codes, namesByCode));
    } catch (e) {
      setBusy(false);
      return toast.error(`Gagal lookup rider: ${(e as Error).message}`);
    }

    // Cocokkan nama client di CSV ke client yang beneran ada di sistem —
    // dipakai Payroll Run buat milih aturan absensi (attendance_rules) yang
    // tepat per client, bukan nebak dari client_id tetap di rider.
    const clientByName = new Map(clients.map((c) => [c.name.trim().toLowerCase(), c.id]));
    const unmatchedClients = new Set<string>();

    const logs = rows.map((r) => {
      const code = r[iCode];
      const duration = parseDur(r[iDur] ?? "");
      const clientNameRaw = r[iClient] ?? null;
      let client_id: string | null = null;
      if (clientNameRaw) {
        const hit = clientByName.get(clientNameRaw.trim().toLowerCase());
        if (hit) client_id = hit;
        else unmatchedClients.add(clientNameRaw);
      }
      const otpRaw = iOtp >= 0 ? (r[iOtp] ?? "").trim().toLowerCase() : "";
      return {
        batch_id: batch.id, rider_id: code ? riderMap.get(code) ?? null : null, driver_code: code,
        client_name: clientNameRaw, client_id,
        log_date: r[iDate] || new Date().toISOString().slice(0, 10),
        clock_in: r[iIn] || null, clock_out: r[iOut] || null,
        duration_minutes: duration,
        is_absent: !r[iIn],
        is_late: otpRaw === "late",
      };
    });

    let inserted = 0;
    for (let i = 0; i < logs.length; i += 500) {
      const chunk = logs.slice(i, i + 500);
      const { error } = await (supabase as any).from("attendance_logs").insert(chunk);
      if (error) { setBusy(false); return toast.error(error.message); }
      inserted += chunk.length;
    }
    setBusy(false);
    toast.success(`Berhasil upload ${inserted} log absensi` + (createdCodes.length ? ` · ${createdCodes.length} rider baru otomatis terdaftar` : ""));
    if (unmatchedClients.size > 0) {
      toast.warning(`Nama client tidak dikenal (aturan absensi mungkin salah pilih): ${Array.from(unmatchedClients).join(", ")}`);
    }
    setFile(null); setHeaders([]); setRows([]);
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        Format kolom: <code>Kode Mitra, Client Name, Date, Clock-in, Clock-out, Duration, OTP</code> (OTP: ONTIME/LATE — dipakai buat insentif ontime di Type E)
      </div>
      <label className="block">
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="hidden" />
        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30">
          <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm">{file ? <span className="font-medium">{file.name}</span> : "Klik untuk upload CSV"}</p>
        </div>
      </label>
      {rows.length > 0 && <p className="text-sm text-muted-foreground">{rows.length} baris siap diimport.</p>}
      <button onClick={process} disabled={busy || rows.length === 0}
        className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Proses Upload
      </button>
    </div>
  );
}
