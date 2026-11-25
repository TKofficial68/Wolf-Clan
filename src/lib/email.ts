export type MailResult = { ok: true; id?: string } | { ok: false; reason: "not_configured" | "provider_error"; detail?: string };

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendMail(input: { to: string; subject: string; text: string; html?: string }): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "not_configured" };
  const from = process.env.MAIL_FROM ?? "Wolf Clan <onboarding@resend.dev>";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, reason: "provider_error", detail: detail.slice(0, 300) };
    }
    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: body.id };
  } catch (error) {
    return { ok: false, reason: "provider_error", detail: error instanceof Error ? error.message : "network" };
  }
}

/** Recipient addresses stay server-side only. */
export function contactRecipient(kind: "developer" | "owner"): string | null {
  if (kind === "developer") {
    return process.env.DEVELOPER_CONTACT_EMAIL ?? "tkofficial68@gmail.com";
  }
  return process.env.OWNER_CONTACT_EMAIL ?? "mrshadow12301@gmail.com";
}

export function appBaseUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}
