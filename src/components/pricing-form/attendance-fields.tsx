// Kategori 2 — Per Kehadiran. Dipecah dari pricing-form.tsx per
// docs/pricing-engine-v2-design.md §6.
import { parseRupiah } from "@/lib/format";
import { AddRowBtn, FieldLabel, RupiahInput, Td, TableShell, TextInput, Th, RowDeleteBtn, ToggleBlock } from "./shared";

export interface AttendanceState {
  full_fee: string;
  standard_hours: string; // ditampilkan dalam jam, disimpan sebagai menit di config
  overtimeOn: boolean;
  overtime_rate_per_hour: string;
  incentives: { label: string; amount: string; condition: "always" | "ontime_only" }[];
}

export function emptyAttendanceState(): AttendanceState {
  return {
    full_fee: "100000",
    standard_hours: "8",
    overtimeOn: false,
    overtime_rate_per_hour: "0",
    incentives: [{ label: "Insentif Ontime", amount: "40000", condition: "ontime_only" }],
  };
}

export function buildAttendanceConfig(a: AttendanceState): Record<string, unknown> {
  return {
    full_fee: parseRupiah(a.full_fee),
    standard_minutes: (Number(a.standard_hours) || 0) * 60,
    overtime: a.overtimeOn ? { enabled: true, rate_per_hour: parseRupiah(a.overtime_rate_per_hour) } : null,
    incentives: a.incentives
      .filter((c) => c.label.trim())
      .map((c) => ({ label: c.label.trim(), amount: parseRupiah(c.amount), condition: c.condition })),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadAttendanceState(c: any): AttendanceState {
  return {
    full_fee: String(c.full_fee ?? ""),
    standard_hours: String((Number(c.standard_minutes) || 0) / 60 || ""),
    overtimeOn: !!c.overtime?.enabled,
    overtime_rate_per_hour: String(c.overtime?.rate_per_hour ?? "0"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    incentives: (c.incentives ?? []).map((x: any) => ({ label: x.label ?? "", amount: String(x.amount ?? ""), condition: x.condition === "ontime_only" ? "ontime_only" : "always" })),
  };
}

export function AttendanceFields({ value, onChange }: { value: AttendanceState; onChange: (v: AttendanceState) => void }) {
  const patch = (p: Partial<AttendanceState>) => onChange({ ...value, ...p });

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-primary-border bg-primary-soft px-3.5 py-2.5 text-xs text-primary-soft-foreground">
        Rumus: (fee penuh × proporsi jam kerja) {value.overtimeOn ? "+ lembur " : ""}+ insentif (nominal ditentuin di sini, data absensi cuma dipakai cek syarat — mis. OTP=ONTIME).
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Fee Penuh per Shift (Rp)</FieldLabel>
          <RupiahInput value={value.full_fee} onChange={(v) => patch({ full_fee: v })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Jam Standar per Shift</FieldLabel>
          <TextInput type="number" value={value.standard_hours} onChange={(e) => patch({ standard_hours: e.target.value })} placeholder="8" />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-2">Kerja kurang dari jam standar dibayar proporsional. Kerja pas/lebih = fee penuh (kecuali lembur dinyalain di bawah).</p>

      <ToggleBlock
        label="Lembur (bayar kelebihan jam kerja)"
        hint="Kalau mati, kerja lebih dari jam standar tetap mentok di fee penuh (tidak ada tambahan)."
        on={value.overtimeOn}
        onToggle={(on) => patch({ overtimeOn: on })}
      >
        <div className="max-w-xs">
          <FieldLabel>Tarif Lembur per Jam (Rp)</FieldLabel>
          <RupiahInput value={value.overtime_rate_per_hour} onChange={(v) => patch({ overtime_rate_per_hour: v })} />
        </div>
      </ToggleBlock>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Insentif</p>
        <TableShell>
          <>
            <Th>Nama Insentif</Th>
            <Th className="w-36">Jumlah (Rp)</Th>
            <Th className="w-44">Syarat Cair</Th>
            <Th className="w-10" />
          </>
          {value.incentives.map((c, i) => (
            <tr key={i} className="border-t border-border/60">
              <Td><TextInput value={c.label} placeholder="cth: Insentif Ontime" onChange={(e) => patch({ incentives: value.incentives.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)) })} /></Td>
              <Td><RupiahInput value={c.amount} onChange={(v) => patch({ incentives: value.incentives.map((x, idx) => (idx === i ? { ...x, amount: v } : x)) })} /></Td>
              <Td>
                <select
                  value={c.condition}
                  onChange={(e) => patch({ incentives: value.incentives.map((x, idx) => (idx === i ? { ...x, condition: e.target.value as "always" | "ontime_only" } : x)) })}
                  className="w-full text-sm rounded-md border border-border bg-card px-2 py-1.5"
                >
                  <option value="always">Selalu (hari kerja)</option>
                  <option value="ontime_only">Cuma kalau ONTIME</option>
                </select>
              </Td>
              <Td className="text-center"><RowDeleteBtn onClick={() => patch({ incentives: value.incentives.filter((_, idx) => idx !== i) })} /></Td>
            </tr>
          ))}
        </TableShell>
        <AddRowBtn onClick={() => patch({ incentives: [...value.incentives, { label: "", amount: "", condition: "always" }] })}>Tambah Insentif</AddRowBtn>
        <p className="text-[11px] text-muted-foreground mt-1.5">"Cuma kalau ONTIME" itu biner — hari LATE dapet Rp0 buat insentif ini, ga ada setengah-setengah.</p>
      </div>
    </div>
  );
}
