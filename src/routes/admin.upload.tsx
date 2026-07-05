import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { parseCSV } from "@/lib/csv";
import { resolveOrCreateRiders } from "@/lib/rider-lookup";
import { toast } from "sonner";
import { Upload, FileText, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/upload")({ component: UploadPage });

type Client = { id: string; name: string };

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

const DELIVERY_FIELDS = ["driver_code","driver_name","delivery_date","awb","district","distance_km","weight_kg","destination_address","receiver_name","service_type"];

function DeliveryUpload() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
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
    const m: Record<string, string> = {};
    DELIVERY_FIELDS.forEach((field) => {
      const found = parsed[0].find((h) => h.toLowerCase().replace(/[^a-z]/g, "") === field.replace(/_/g, ""));
      if (found) m[field] = found;
    });
    setMapping(m);
  };

  const process = async () => {
    if (!clientId) return toast.error("Pilih client");
    if (!file || rows.length === 0) return toast.error("Upload CSV dulu");
    setBusy(true);
    const { data: batch, error: bErr } = await supabase.from("upload_batches")
      .insert({ kind: "delivery", client_id: clientId, filename: file.name, row_count: rows.length })
      .select().single();
    if (bErr) { setBusy(false); return toast.error(bErr.message); }

    const get = (r: string[], f: string) => {
      const idx = headers.indexOf(mapping[f]);
      return idx >= 0 ? r[idx] : null;
    };

    // Rider berdiri sendiri dari kode MTR — kode yang belum terdaftar
    // otomatis dibikinkan rider baru (tanpa client_id, lihat rider-lookup.ts).
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
      setBusy(false);
      return toast.error(`Gagal lookup rider: ${(e as Error).message}`);
    }

    const records = rows.map((r) => {
      const driverCode = get(r, "driver_code");
      return {
        batch_id: batch.id, client_id: clientId, rider_id: driverCode ? riderMap.get(driverCode) ?? null : null,
        driver_code: driverCode,
        delivery_date: get(r, "delivery_date") || new Date().toISOString().slice(0, 10),
        awb: get(r, "awb"), district: get(r, "district"),
        distance_km: parseFloat(get(r, "distance_km") || "0") || null,
        weight_kg: parseFloat(get(r, "weight_kg") || "0") || null,
        destination_address: get(r, "destination_address"),
        receiver_name: get(r, "receiver_name"),
        service_type: get(r, "service_type"),
      };
    });

    // chunk insert (500/req)
    let inserted = 0;
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500);
      const { error } = await supabase.from("delivery_records").insert(chunk);
      if (error) { setBusy(false); return toast.error(error.message); }
      inserted += chunk.length;
    }
    setBusy(false);
    toast.success(`Berhasil upload ${inserted} record` + (createdCodes.length ? ` · ${createdCodes.length} rider baru otomatis terdaftar` : ""));
    setFile(null); setHeaders([]); setRows([]); setMapping({});
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">Client</label>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)}
          className="mt-1 w-full max-w-sm rounded-md border border-border bg-background px-3 py-2 text-sm">
          <option value="">— pilih client —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
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
      <button onClick={process} disabled={busy || rows.length === 0 || !clientId}
        className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Proses Upload
      </button>
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
    const iCode = idx("kode"), iName = idx("name"), iClient = idx("client"), iDate = idx("date"), iIn = idx("clock-in"), iOut = idx("clock-out"), iDur = idx("duration");

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
      return {
        batch_id: batch.id, rider_id: code ? riderMap.get(code) ?? null : null, driver_code: code,
        client_name: clientNameRaw, client_id,
        log_date: r[iDate] || new Date().toISOString().slice(0, 10),
        clock_in: r[iIn] || null, clock_out: r[iOut] || null,
        duration_minutes: duration,
        is_absent: !r[iIn],
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
        Format kolom: <code>Kode Mitra, Client Name, Date, Clock-in, Clock-out, Duration</code>
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
