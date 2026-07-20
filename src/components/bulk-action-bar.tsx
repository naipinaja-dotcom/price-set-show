import { Loader2, Trash2, X } from "lucide-react";

// Bar melayang di bawah tabel, muncul begitu ada baris tercentang. Dipakai
// bareng useBulkSelect() di semua tabel admin yang butuh hapus banyak sekaligus.
export function BulkActionBar({
  count,
  label,
  deleting,
  onDelete,
  onClear,
}: {
  count: number;
  label: string;
  deleting?: boolean;
  onDelete: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky bottom-4 z-10 mt-3 flex w-fit items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-lg mx-auto">
      <span className="text-[12px] font-medium">
        {count} {label} dipilih
      </span>
      <button
        onClick={onClear}
        className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <X className="w-3.5 h-3.5" /> Batal
      </button>
      <button
        onClick={onDelete}
        disabled={deleting}
        className="inline-flex items-center gap-1.5 rounded-lg bg-destructive text-destructive-foreground px-3 py-1.5 text-[12px] font-medium hover:opacity-90 disabled:opacity-50"
      >
        {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        Hapus {count}
      </button>
    </div>
  );
}
