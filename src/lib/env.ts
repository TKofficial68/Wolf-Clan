import { SERVER_ONLY } from "./server/guard";

/** Public values are safe to ship; everything else stays on the server. */
const PUBLIC_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_LIVEKIT_URL",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "NEXT_PUBLIC_APP_VERSION",
] as const;

export const publicEnv = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  livekitUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "",
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0",
} as const;

type Requirement = { key: string; required: boolean; note: string };

const SERVER_REQUIREMENTS: Requirement[] = [
  { key: "DATABASE_URL", required: true, note: "PostgreSQL connection string" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", required: false, note: "server-only storage + delete worker" },
  { key: "LIVEKIT_API_KEY", required: false, note: "meeting tokens" },
  { key: "LIVEKIT_API_SECRET", required: false, note: "meeting tokens" },
  { key: "VAPID_PRIVATE_KEY", required: false, note: "web push delivery" },
  { key: "VAPID_SUBJECT", required: false, note: "web push subject" },
  { key: "RESEND_API_KEY", required: false, note: "transactional email" },
  { key: "EMAIL_FROM", required: false, note: "sender address" },
  { key: "DEVELOPER_CONTACT_EMAIL", required: false, note: "contact form recipient" },
  { key: "OWNER_CONTACT_EMAIL", required: false, note: "contact form recipient" },
  { key: "CLEANUP_WORKER_SECRET", required: false, note: "cron authentication" },
  { key: "PUSH_WEBHOOK_SECRET", required: false, note: "push webhook authentication" },
  { key: "CRON_SECRET", required: false, note: "cron authentication" },
];

export type CapabilityStatus = { key: string; configured: boolean; note: string };

/** Validates the required server variables and fails fast with the variable name. */
export function validateServerEnv(): void {
  if (typeof window !== "undefined") throw new Error("env validation is server-only");
  const missing = SERVER_REQUIREMENTS.filter((entry) => entry.required && !process.env[entry.key]).map((entry) => entry.key);
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}. See .env.example and HANDOFF.md.`);
  }
}

export function capabilityStatus(): CapabilityStatus[] {
  const status = SERVER_REQUIREMENTS.filter((entry) => !entry.required).map((entry) => ({
    key: entry.key,
    configured: Boolean(process.env[entry.key]),
    note: entry.note,
  }));
  const publicStatus: CapabilityStatus[] = PUBLIC_KEYS.map((key) => ({
    key,
    configured: Boolean(process.env[key]),
    note: "public",
  }));
  return [...publicStatus, ...status];
}

export function meetingsConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET,
  );
}

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

export function mailConfiguredEnv(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? process.env.CLEANUP_WORKER_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const provided = bearer || request.headers.get("x-cron-secret") || "";
  return provided === secret;
}

export const serverGuard = SERVER_ONLY;
