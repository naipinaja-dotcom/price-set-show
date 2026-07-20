import { useMemo, useState } from "react";

// Checkbox multi-pilih generik dipakai di semua tabel admin (Pricing, Deduction,
// Clients, Riders, dst) biar hapus banyak sekaligus gak perlu klik satu-satu.
export function useBulkSelect(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const idSet = useMemo(() => new Set(ids), [ids]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const visibleSelected = [...selected].filter((id) => idSet.has(id));
  const allSelected = ids.length > 0 && visibleSelected.length === ids.length;

  const toggleAll = () =>
    setSelected((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...ids]);
    });

  const clear = () => setSelected(new Set());

  return { selected, toggle, allSelected, toggleAll, clear, count: visibleSelected.length };
}
