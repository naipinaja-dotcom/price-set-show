// Kirim email lewat Resend (https://resend.com). Server-only (.server.ts)
// biar RESEND_API_KEY gak pernah ke-bundle ke client.
// Setup: bikin akun Resend -> verify domain pengirim (atau pakai
// onboarding@resend.dev buat testing) -> copy API key -> isi ke env
// RESEND_API_KEY. PNL_PUSH_EMAIL_FROM & PNL_PUSH_EMAIL_TO juga wajib di-set.
export interface EmailSendResult {
  ok: boolean;
  error?: string;
}

export async function sendEmail(opts: { subject: string; html: string }): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PNL_PUSH_EMAIL_FROM;
  const toRaw = process.env.PNL_PUSH_EMAIL_TO; // comma-separated
  if (!apiKey || !from || !toRaw) {
    return { ok: false, error: "RESEND_API_KEY / PNL_PUSH_EMAIL_FROM / PNL_PUSH_EMAIL_TO belum lengkap di env" };
  }
  const to = toRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (to.length === 0) {
    return { ok: false, error: "PNL_PUSH_EMAIL_TO kosong" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
