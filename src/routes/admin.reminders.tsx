import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin-layout";
import { PayrollReminderPanel } from "@/components/payroll-reminder-panel";

export const Route = createFileRoute("/admin/reminders")({ component: RemindersPage });

function RemindersPage() {
  return (
    <AdminLayout
      title="Reminders"
      subtitle="Konfigurasi jadwal pengingat disbursement rider per client/hari. Dikirim otomatis ke Slack & Email."
    >
      <PayrollReminderPanel />
    </AdminLayout>
  );
}
