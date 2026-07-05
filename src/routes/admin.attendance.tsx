import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { parseRupiah } from "@/lib/format";
import { Plus, Pencil, Trash2, Loader2, ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/admin/attendance")({ component: AttendancePage });

type Rule = {
  id: string; name: string; client_id: string | null;
  clockin_time: string; min_duration_minutes: number; late_tolerance_minutes: number;
  daily_base_fee: number; late_penalty: number; absent_penalty: number; active: boolean;
};
type Incentive = { id: string; rule_id: string; name: string; amount: number; condition: string | null };
type Client = { id: string; name: string };

function AttendancePage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [incentives, setIncentives] = useState<Incentive[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Rule | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [incFor, setIncFor] = useState<string | null>(null); // ruleId yang lagi ditambahin insentif

  const load = async () => {
    setLoading(true);
    const [r, i, c] = await Promise.all([
      supabase.from("attendance_rules").select("*").order("name"),
      supabase.from("attendance_incentives").select("*").order("name"),
      supabase.from("clients").select("id, name"),
    ]);
    if (r.error) toast.error(r.error.message); else setRules(r.data ?? []);
    if (!i.error) setIncentives(i.data ?? []);
    if (!c.error) setClients(c.data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const removeRule = async (id: string) => {
    if (!(await confirmDialog({ title: "Hapus rule absensi?", description: "Rule ini beserta semua insentifnya akan dihapus.", confirmText: "Hapus" }))) return;
    const { error } = await supabase.from("attendance_rules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Dihapus"); load();
  };

  const removeIncentive = async (id: string) => {
    if (!(await confirmDialog({ title: "Hapus insentif?", confirmText: "Hapus" }))) return;
    const { error } = await supabase.from("attendance_incentives").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <AdminLayout title="Aturan Absensi">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{rules.length} rule</p>
        <button onClick={() => { setEdit(null); setOpen(true); }}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm">
          <Plus className="w-4 h-4" /> Tambah Rule
        </button>
      </div>
      <div className="space-y-2">
        {loading ? <div className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
        : rules.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Belum ada rule</p>
        : rules.map((r) => {
          const ruleInc = incentives.filter((x) => x.rule_id === r.id);
          const isOpen = expanded === r.id;
          return (
            <div key={r.id} className="border border-border rounded-lg overflow-hidden">
              <div className="p-3 flex items-center justify-between bg-card">
                <button onClick={() => setExpanded(isOpen ? null : r.id)} className="flex items-center gap-2 text-left flex-1">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <div>
                    <div className="font-medium text-sm">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {clients.find((c) => c.id === r.client_id)?.name ?? "Semua client"} · Clock-in {r.clockin_time.slice(0,5)} · Base Rp{r.daily_base_fee.toLocaleString("id-ID")} · {ruleInc.length} insentif
                    </div>
                  </div>
                </button>
                <div className="flex gap-1">
                  <button onClick={() => { setEdit(r); setOpen(true); }} className="p-1.5 hover:bg-muted rounded"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => removeRule(r.id)} className="p-1.5 hover:bg-muted rounded text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              {isOpen && (
                <div className="p-3 bg-muted/30 border-t border-border">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">Insentif</h4>
                    <button onClick={() => setIncFor(r.id)} className="text-xs text-primary hover:underline">+ Tambah insentif</button>
                  </div>
                  {ruleInc.length === 0 ? <p className="text-xs text-muted-foreground">Tidak ada insentif</p> :
                    <ul className="space-y-1 text-sm">
                      {ruleInc.map((inc) => (
                        <li key={inc.id} className="flex items-center justify-between bg-card px-3 py-2 rounded">
                          <div>
                            <span className="font-medium">{inc.name}</span>
                            <span className="text-muted-foreground"> — Rp{Number(inc.amount).toLocaleString("id-ID")}</span>
                            {inc.condition && <span className="text-xs text-muted-foreground"> · {inc.condition}</span>}
                          </div>
                          <button onClick={() => removeIncentive(inc.id)} className="text-red-600 hover:bg-muted p-1 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                        </li>
                      ))}
                    </ul>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {open && <RuleModal initial={edit} clients={clients} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
      {incFor && <IncentiveModal ruleId={incFor} onClose={() => setIncFor(null)} onSaved={() => { setIncFor(null); load(); }} />}
    </AdminLayout>
  );
}

function IncentiveModal({ ruleId, onClose, onSaved }: { ruleId: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: "", amount: 0, condition: "" });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!f.name.trim()) return toast.error("Nama insentif wajib diisi");
    setSaving(true);
    const { error } = await supabase.from("attendance_incentives").insert({
      rule_id: ruleId, name: f.name.trim(), amount: f.amount, condition: f.condition.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Insentif ditambahkan"); onSaved();
  };

  const inputCls = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-4">Tambah Insentif</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Nama Insentif</label>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="mis. Insentif Ontime" className={inputCls} />
          </div>
          <div>
            <label className="text-sm font-medium">Nominal (Rp)</label>
            <input inputMode="numeric" placeholder="0"
              value={f.amount ? f.amount.toLocaleString("id-ID") : ""}
              onChange={(e) => setF({ ...f, amount: parseRupiah(e.target.value) })} className={inputCls} />
          </div>
          <div>
            <label className="text-sm font-medium">Kondisi <span className="font-normal text-muted-foreground">(opsional)</span></label>
            <input value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })} placeholder="mis. ontime" className={inputCls} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-border hover:bg-muted">Batal</button>
          <button onClick={save} disabled={saving} className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50">
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleModal({ initial, clients, onClose, onSaved }:
  { initial: Rule | null; clients: Client[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: initial?.name ?? "",
    client_id: initial?.client_id ?? "",
    clockin_time: initial?.clockin_time?.slice(0,5) ?? "08:00",
    min_duration_minutes: initial?.min_duration_minutes ?? 480,
    late_tolerance_minutes: initial?.late_tolerance_minutes ?? 15,
    daily_base_fee: initial?.daily_base_fee ?? 0,
    late_penalty: initial?.late_penalty ?? 0,
    absent_penalty: initial?.absent_penalty ?? 0,
    active: initial?.active ?? true,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!f.name) return toast.error("Nama wajib");
    setSaving(true);
    const payload = { ...f, client_id: f.client_id || null };
    const { error } = initial
      ? await supabase.from("attendance_rules").update(payload).eq("id", initial.id)
      : await supabase.from("attendance_rules").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Tersimpan"); onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg w-full max-w-lg p-5 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">{initial ? "Edit" : "Tambah"} Rule Absensi</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2">
            <label className="font-medium">Nama</label>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
          </div>
          <div>
            <label className="font-medium">Client</label>
            <select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2">
              <option value="">Semua client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <Num label="Jam Clock-in" type="time" value={f.clockin_time} onChange={(v) => setF({ ...f, clockin_time: v })} />
          <Num label="Durasi Min. (menit)" value={f.min_duration_minutes} onChange={(v) => setF({ ...f, min_duration_minutes: +v })} />
          <Num label="Toleransi Telat (menit)" value={f.late_tolerance_minutes} onChange={(v) => setF({ ...f, late_tolerance_minutes: +v })} />
          <Num label="Daily Base Fee (Rp)" value={f.daily_base_fee} onChange={(v) => setF({ ...f, daily_base_fee: +v })} />
          <Num label="Penalty Telat (Rp)" value={f.late_penalty} onChange={(v) => setF({ ...f, late_penalty: +v })} />
          <Num label="Penalty Absent (Rp)" value={f.absent_penalty} onChange={(v) => setF({ ...f, absent_penalty: +v })} />
          <label className="col-span-2 flex items-center gap-2">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Aktif
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-border">Batal</button>
          <button onClick={save} disabled={saving} className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50">
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Num({ label, value, onChange, type = "number" }: { label: string; value: any; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="font-medium">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" />
    </div>
  );
}
