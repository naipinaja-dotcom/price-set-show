// Kirim notifikasi ke Slack lewat Incoming Webhook. Server-only (.server.ts)
// biar SLACK_WEBHOOK_URL gak pernah ke-bundle ke client.
// Setup: Slack workspace -> Apps -> Incoming Webhooks -> Add to Slack ->
// pilih channel -> copy Webhook URL -> isi ke env SLACK_WEBHOOK_URL.
export interface SlackSendResult {
  ok: boolean;
  error?: string;
}

export async function sendSlackMessage(text: string): Promise<SlackSendResult> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return { ok: false, error: "SLACK_WEBHOOK_URL belum di-set di env" };
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Slack webhook ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
