import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { DTypesTab } from "@/components/deductions/d-types-tab";
import { AddTab } from "@/components/deductions/add-tab";
import { ActiveTab } from "@/components/deductions/active-tab";

export const Route = createFileRoute("/admin/deductions")({ component: DeductionsPage });

function DeductionsPage() {
  const [tab, setTab] = useState<"types" | "add" | "active">("types");
  return (
    <AdminLayout title="Deductions" subtitle="Kelola potongan, tunggakan, dan cicilan rider">
      <div className="flex gap-1 p-1 bg-muted rounded-md w-fit mb-5">
        {(
          [
            ["types", "Jenis Potongan"],
            ["add", "Tambah Potongan"],
            ["active", "Cicilan Aktif"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-1.5 text-sm rounded ${tab === k ? "bg-card shadow-sm font-medium" : "text-muted-foreground"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "types" && <DTypesTab />}
      {tab === "add" && <AddTab />}
      {tab === "active" && <ActiveTab />}
    </AdminLayout>
  );
}
