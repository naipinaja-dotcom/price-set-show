import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { parseRupiah } from "@/lib/format";
import { Loader2, Trash2, Plus } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Incentive = { id: string; description: string; amount: number };

// Insentif tambahan DI LUAR skema pricing — line item ad-hoc per rider per
// run (mis. bonus referral), diinput admin di Payroll Run sebelum Finalize/
// Publish. Beda dari bonus ontime dsb yang udah kehitung dalam skema pricing
// (nempel ke delivery_fee/attendance_fee) — lihat DASH-Payroll-PRD.md §incentive.
//
// `incentive` numpang ke payroll_details.gross_earning/net_pay (sama pola
// payroll_deductions -> total_deduction), jadi tiap tambah/hapus item HARUS
// recompute & simpan ulang gross_earning/net_pay di detail induknya.
export function IncentiveEditor({
  detailId,
  grossEarning,
  incentive,
  totalDeduction,
  runPublished,
  onSaved,
}: {
  detailId: string;
  grossEarning: number;
  incentive: number;
  totalDeduction: number;
  runPublished: boolean;
  onSaved: (detailId: string, newIncentive: number, newGross: number, newNet: number) => void;
}) {
  const [items, setItems] = useState<Incentive[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newAmount, setNewAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    sb.from("payroll_incentives")
      .select("id, description, amount")
      .eq("detail_id", detailId)
      .order("created_at")
      .then(({ data, error }: { data: Incentive[] | null; error: Error | null }) => {
        if (error) toast.error(error.message);
        setItems(data ?? []);
        setLoading(false);
      });
  }, [detailId]);

  const applyNewTotal = async (list: Incentive[]) => {
    const newIncentive = list.reduce((s, x) => s + Number(x.amount), 0);
    const newGross = grossEarning - incentive + newIncentive;
    const newNet = Math.max(0, newGross - totalDeduction);
    const { error } = await sb
      .from("payroll_details")
      .update({ incentive: newIncentive, gross_earning: newGross, net_pay: newNet })
      .eq("id", detailId);
    if (error) throw error;
    onSaved(detailId, newIncentive, newGross, newNet);
  };

  const addIncentive = async () => {
    if (!newDesc.trim()) return toast.error("Keterangan/alasan wajib diisi");
    if (newAmount <= 0) return toast.error("Jumlah harus lebih dari 0");
    setSaving(true);
    try {
      const { data, error } = await sb
        .from("payroll_incentives")
        .insert({ detail_id: detailId, description: newDesc.trim(), amount: newAmount })
        .select("id, description, amount")
        .single();
      if (error) throw error;
      const list = [...items, data as Incentive];
      await applyNewTotal(list);
      setItems(list);
      setNewDesc("");
      setNewAmount(0);
      setAdding(false);
      toast.success("Insentif ditambahkan");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deleteIncentive = async (item: Incentive) => {
    if (
      !(await confirmDialog({
        title: "Hapus insentif ini?",
        description: `"${item.description}" — Rp${Number(item.amount).toLocaleString("id-ID")} akan dihapus dan gross/net pay dihitung ulang.`,
        confirmText: "Hapus",
        danger: true,
      }))
    )
      return;
    setDeletingId(item.id);
    try {
      const { error } = await sb.from("payroll_incentives").delete().eq("id", item.id);
      if (error) throw error;
      const list = items.filter((x) => x.id !== item.id);
      await applyNewTotal(list);
      setItems(list);
      toast.success("Insentif dihapus");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <Loader2 className="w-4 h-4 animate-spin" />;

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        Insentif Tambahan (di luar skema)
      </div>
      {items.length === 0 && !adding && (
        <p className="text-[12.5px] text-muted-foreground">Belum ada insentif tambahan.</p>
      )}
      {items.map((it) => (
        <div key={it.id} className="flex items-center gap-3 text-[13px]">
          <span className="flex-1 truncate">{it.description}</span>
          <span className="w-32 text-right tabular-nums font-medium text-success">
            +Rp{Number(it.amount).toLocaleString("id-ID")}
          </span>
          {!runPublished && (
            <button
              onClick={() => deleteIncentive(it)}
              disabled={deletingId === it.id}
              title="Hapus insentif ini"
              className="text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              {deletingId === it.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      ))}

      {!runPublished &&
        (adding ? (
          <div className="flex items-center gap-2 pt-1">
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Keterangan/alasan (mis. Bonus referral rider baru)"
              className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-[12px]"
            />
            <input
              inputMode="numeric"
              value={newAmount ? newAmount.toLocaleString("id-ID") : ""}
              onChange={(e) => setNewAmount(parseRupiah(e.target.value))}
              placeholder="Jumlah"
              className="w-32 rounded-md border border-border bg-background px-2 py-1 text-[12px] text-right tabular-nums"
            />
            <button
              onClick={addIncentive}
              disabled={saving}
              className="rounded-md bg-primary text-primary-foreground px-2.5 py-1 text-[12px] disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Simpan"}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="text-[12px] text-muted-foreground hover:text-foreground"
            >
              Batal
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline pt-1"
          >
            <Plus className="w-3.5 h-3.5" /> Tambah Insentif
          </button>
        ))}
      {runPublished && (
        <p className="text-[11px] text-muted-foreground pt-1">
          Run sudah di-publish — insentif gak bisa diedit lagi dari sini.
        </p>
      )}
    </div>
  );
}
