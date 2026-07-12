import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { useAuth } from "@/lib/auth";
import { triggerPayrollReminderManual } from "@/lib/api/payroll-reminder.functions";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { Loader2, Plus, Trash2, Send, CheckCircle2, XCircle } from "lucide-react";

type Client = { id: string; name: string };
type Rider = { id: string; full_name: string; employee_id: string };
type Schedule = {
  id: string; label: string; client_id: string | null; rider_id: string | null;
  weekdays: number[]; active: boolean;
  clients: { name: string } | null; riders: { full_name: string; employee_id: string } | null;
};
type LogRow = {
  id: string; reminder_date: string;
  due_clients: { id: string; name: string }[];
  due_riders: { id: string; full_name: string; employee_id: string }[];
  push_status: { slack: { ok: boolean; error?: string }; email: { ok: boolean; error?: string } };
  triggered_by: string; created_at: string;
};

const WEEKDAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export function PayrollReminderPanel() {
  const { session } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = () => {
    supabase.from("clients").select("id, name").order("name").then(({ data }) => setClients(data ?? []));
    fetchAllRows<Rider>((c, from, to) => c.from("riders").select("id, full_name, employee_id").order("full_name").range(from, to))
      .then(setRiders);
    (supabase as any).from("payroll_reminder_schedules")
      .select("id, label, client_id, rider_id, weekdays, active, clients(name), riders(full_name, employee_id)")
      .order("created_at", { ascending: false })
      .then(({ data }: { data: Schedule[] | null }) => setSchedules(data ?? []));
    (supabase as any).from("payroll_reminder_log")
      .select("id, reminder_date, due_clients, due_riders, push_status, triggered_by, created_at")
      .order("reminder_date", { ascending: false }).limit(10)
      .then(({ data }: { data: LogRow[] | null }) => setLogs(data ?? []));
  };
  useEffect(load, []);

  const deleteSchedule = async (s: Schedule) => {
    if (!(await confirmDialog({ title: "Hapus jadwal reminder?", description: `"${s.label}" akan dihapus.`, confirmText: "Hapus", danger: true }))) return;
    const { error } = await (supabase as any).from("payroll_reminder_schedules").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Jadwal dihapus"); load();
  };

  const toggleActive = async (s: Schedule) => {
    const { error } = await (supabase as any).from("payroll_reminder_schedules").update({ active: !s.active }).eq("id", s.id);
    if (error) return toast.error(error.message);
    load();
  };

  const testSend = async () => {
    if (!session?.access_token) return toast.error("Sesi admin habis — login ulang");
    setTesting(true);
    try {
      const result = await triggerPayrollReminderManual({ data: { adminToken: session.access_token } });
      if (!result.sent) {
        toast.success("Dicek — tidak ada client/rider yang jatuh tempo hari ini, jadi Slack/Email sengaja tidak dikirim.");
      } else {
        const slackOk = result.pushStatus!.slack.ok, emailOk = result.pushStatus!.email.ok;
        if (slackOk && emailOk) toast.success("Reminder berhasil dikirim ke Slack & Email");
        else toast.warning(`Slack: ${slackOk ? "OK" : "gagal — " + result.pushStatus!.slack.error}. Email: ${emailOk ? "OK" : "gagal — " + result.pushStatus!.email.error}`);
      }
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Jadwal Reminder Disbursement</h3>
          <p className="text-xs text-muted-foreground">Ingatkan Admin/Ops lewat Slack + Email client/rider mana yang harus digaji hari itu, sesuai siklus masing-masing. Cron belum diaktifkan — pakai "Test Kirim Sekarang" untuk cek manual.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={testSend} disabled={testing}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50">
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Test Kirim Sekarang
          </button>
          <button onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" /> Jadwal Baru
          </button>
        </div>
      </div>

      <div className="rounded-md border border-border divide-y divide-border">
        {schedules.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">Belum ada jadwal reminder.</p>
        ) : schedules.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2 p-2.5 text-xs">
            <div className="min-w-0">
              <div className="font-medium truncate">{s.label}</div>
              <div className="text-muted-foreground truncate">
                {s.clients?.name}{s.clients && s.riders ? " · " : ""}{s.riders ? `${s.riders.full_name} (${s.riders.employee_id})` : ""}
                {" — "}{s.weekdays.map((d) => WEEKDAYS[d]).join(", ")}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => toggleActive(s)} className={`px-2 py-1 rounded ${s.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                {s.active ? "Aktif" : "Nonaktif"}
              </button>
              <button onClick={() => deleteSchedule(s)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>

      {logs.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold mb-1.5">Histori Pengiriman (10 terakhir)</h4>
          <div className="rounded-md border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted text-left">
                <tr><th className="p-1.5">Tanggal</th><th className="p-1.5">Client/Rider Due</th><th className="p-1.5">Slack</th><th className="p-1.5">Email</th><th className="p-1.5">Trigger</th></tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="p-1.5">{l.reminder_date}</td>
                    <td className="p-1.5">{[...l.due_clients.map((c) => c.name), ...l.due_riders.map((r) => r.full_name)].join(", ") || "—"}</td>
                    <td className="p-1.5">{l.push_status.slack.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <XCircle className="w-3.5 h-3.5 text-destructive" />}</td>
                    <td className="p-1.5">{l.push_status.email.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <XCircle className="w-3.5 h-3.5 text-destructive" />}</td>
                    <td className="p-1.5">{l.triggered_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {formOpen && (
        <ScheduleFormModal
          clients={clients}
          riders={riders}
          saving={saving}
          onClose={() => setFormOpen(false)}
          onSave={async (rows) => {
            setSaving(true);
            const { error } = await (supabase as any).from("payroll_reminder_schedules").insert(rows);
            setSaving(false);
            if (error) return toast.error(error.message);
            toast.success("Jadwal dibuat"); setFormOpen(false); load();
          }}
        />
      )}
    </div>
  );
}

type ScheduleRow = { label: string; client_id: string | null; rider_id: string | null; weekdays: number[] };

function ScheduleFormModal({ clients, riders, saving, onClose, onSave }: {
  clients: Client[]; riders: Rider[]; saving: boolean;
  onClose: () => void;
  onSave: (rows: ScheduleRow[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [riderIds, setRiderIds] = useState<string[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [riderSearch, setRiderSearch] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);

  const toggleDay = (d: number) => setWeekdays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  const toggleClient = (id: string) => setClientIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleRider = (id: string) => setRiderIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const visibleClients = clients.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()));
  const visibleRiders = riders.filter((r) => `${r.full_name} ${r.employee_id}`.toLowerCase().includes(riderSearch.toLowerCase()));

  // 1 baris = 1 client ATAU 1 rider (bukan kombinasi silang) — pilih banyak
  // client/rider sekaligus di sini cuma bikin banyak baris identik dalam
  // 1x submit, biar ga perlu buka form berkali-kali buat tiap client.
  const submit = () => {
    if (!label.trim()) return toast.error("Label wajib diisi");
    if (clientIds.length === 0 && riderIds.length === 0) return toast.error("Pilih minimal 1 client atau rider");
    if (weekdays.length === 0) return toast.error("Pilih minimal 1 hari");
    const rows: ScheduleRow[] = [
      ...clientIds.map((id) => ({ label: label.trim(), client_id: id, rider_id: null, weekdays })),
      ...riderIds.map((id) => ({ label: label.trim(), client_id: null, rider_id: id, weekdays })),
    ];
    onSave(rows);
  };

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Jadwal Reminder Baru</h2>
        <div className="space-y-3 text-sm">
          <div>
            <label className="font-medium">Label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="mis. Batch Senin & Kamis"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
            <p className="text-xs text-muted-foreground mt-1">Dipakai buat semua client/rider yang dipilih di bawah — kalau mau label beda per client, submit terpisah.</p>
          </div>
          <div>
            <label className="font-medium">Client <span className="font-normal text-muted-foreground">(bisa pilih lebih dari satu)</span></label>
            <input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Cari client…"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs" />
            <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {visibleClients.length === 0 ? <p className="p-2 text-xs text-muted-foreground">Tidak ada match</p> :
                visibleClients.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-muted/50">
                    <input type="checkbox" checked={clientIds.includes(c.id)} onChange={() => toggleClient(c.id)} />
                    {c.name}
                  </label>
                ))}
            </div>
            {clientIds.length > 0 && <p className="text-xs text-muted-foreground mt-1">{clientIds.length} client dipilih.</p>}
          </div>
          <div>
            <label className="font-medium">Rider <span className="font-normal text-muted-foreground">(opsional — buat reminder khusus rider tertentu, bisa pilih lebih dari satu)</span></label>
            <input value={riderSearch} onChange={(e) => setRiderSearch(e.target.value)} placeholder="Cari nama / kode rider…"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs" />
            <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {riderSearch.trim() === "" ? <p className="p-2 text-xs text-muted-foreground">Ketik buat cari rider ({riders.length} total)</p> :
                visibleRiders.length === 0 ? <p className="p-2 text-xs text-muted-foreground">Tidak ada match</p> :
                visibleRiders.slice(0, 50).map((r) => (
                  <label key={r.id} className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-muted/50">
                    <input type="checkbox" checked={riderIds.includes(r.id)} onChange={() => toggleRider(r.id)} />
                    {r.full_name} ({r.employee_id})
                  </label>
                ))}
            </div>
            {riderIds.length > 0 && <p className="text-xs text-muted-foreground mt-1">{riderIds.length} rider dipilih.</p>}
          </div>
          <div>
            <label className="font-medium">Hari Berulang</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {WEEKDAYS.map((name, d) => (
                <button key={d} type="button" onClick={() => toggleDay(d)}
                  className={`px-2.5 py-1 rounded text-xs border ${weekdays.includes(d) ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-border">Batal</button>
          <button onClick={submit} disabled={saving} className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50">
            {saving ? "Menyimpan…" : `Simpan${clientIds.length + riderIds.length > 1 ? ` (${clientIds.length + riderIds.length} jadwal)` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
