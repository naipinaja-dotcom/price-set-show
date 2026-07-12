import process from "node:process";

// Server-only config. The .server.ts suffix prevents Vite from bundling
// this file into the client — values here never reach the browser.
//
// On Cloudflare Workers, env binds at REQUEST time. Module-scope reads
// (e.g. `const x = process.env.X`) resolve to undefined — always read
// process.env INSIDE a function or handler.
//
// When to use which env-access pattern:
//   - .server.ts module (this file): server-only helpers reused across
//     handlers. Wrap reads in a function so they run per-request.
//   - inline process.env inside a createServerFn handler: one-off reads
//     not reused elsewhere.
//   - import.meta.env.VITE_FOO: PUBLIC config readable from both client
//     and server (analytics IDs, public URLs). Define in .env with the
//     VITE_ prefix. Never put secrets here — they ship to the browser.

export function getServerConfig() {
  return {
    nodeEnv: process.env.NODE_ENV,
    // Add server-only values here, e.g.:
    //   databaseUrl: process.env.DATABASE_URL,
    //   stripeSecretKey: process.env.STRIPE_SECRET_KEY,

    // Weekly PNL Push (lihat src/routes/api.pnl-weekly-push.ts) —
    // pnlPushSecret wajib dikirim cron/manual trigger sebagai header
    // `x-pnl-push-secret` biar endpoint gak bisa dipanggil orang sembarang.
    pnlPushSecret: process.env.PNL_PUSH_SECRET,
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    resendApiKey: process.env.RESEND_API_KEY,
    pnlPushEmailFrom: process.env.PNL_PUSH_EMAIL_FROM,
    pnlPushEmailTo: process.env.PNL_PUSH_EMAIL_TO,

    // Payroll Reminder (lihat src/routes/api.payroll-reminder.ts) — sama
    // polanya dengan pnlPushSecret, header `x-payroll-reminder-secret`.
    payrollReminderSecret: process.env.PAYROLL_REMINDER_SECRET,
  };
}
