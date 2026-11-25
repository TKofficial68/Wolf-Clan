import { db } from "@/db";
import { contactMessages } from "@/db/schema";
import { countRecentAttempts, getSessionUser, recordAttempt } from "@/lib/auth";
import { contactRecipient, mailConfigured, sendMail } from "@/lib/email";
import { body, fail, stringField } from "@/lib/http";
import { APP } from "@/lib/roles";
import { formatDateTime } from "@/lib/time";

const SUBJECTS = new Set(["problem", "suggestion", "question", "other"]);

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const input = await body<Record<string, unknown>>(request);
  const audience = input.audience === "owner" ? "owner" : "developer";
  const subject = stringField(input.subject, 20);
  const message = stringField(input.message, 2100);

  if (!SUBJECTS.has(subject)) return fail("subject_required", 422);
  if (message.length < 10) return fail("too_short", 422);
  if (message.length > 2000) return fail("too_long", 422);
  if ((await countRecentAttempts("contact", user.id, 60 * 60 * 1000)) >= 3) return fail("rate_limited", 429);

  const recipientEmail = contactRecipient(audience);
  if (!recipientEmail) return fail("recipient_missing", 500);
  if (!mailConfigured()) {
    await db.insert(contactMessages).values({
      senderId: user.id,
      recipient: audience,
      recipientEmail,
      subject,
      body: message,
      delivery: "not_configured",
      deliveryDetail: "RESEND_API_KEY is missing on the server",
    });
    return fail("email_not_configured", 503);
  }

  const subjectLabels: Record<string, string> = {
    problem: "Problem",
    suggestion: "Suggestion",
    question: "Question",
    other: "Other",
  };
  const sentAt = formatDateTime(new Date(), "en");
  const text = [
    "This message was sent from the app.",
    "",
    `From: ${user.displayName} (@${user.username})`,
    `Email: ${user.email}`,
    `App version: ${APP.version}`,
    `Sent: ${sentAt} (Asia/Dhaka)`,
    `Subject: ${subjectLabels[subject]}`,
    "",
    message,
  ].join("\n");

  const result = await sendMail({
    to: recipientEmail,
    subject: `[Wolf Clan] ${subjectLabels[subject]} from ${user.displayName}`,
    text,
  });

  await db.insert(contactMessages).values({
    senderId: user.id,
    recipient: audience,
    recipientEmail,
    subject,
    body: message,
    delivery: result.ok ? "sent" : "failed",
    deliveryDetail: result.ok ? (result.id ?? null) : (result.detail ?? result.reason),
  });

  if (!result.ok) return fail("email_provider_error", 502);
  await recordAttempt("contact", user.id);
  return Response.json({ ok: true });
}
