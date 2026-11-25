export const TIME_ZONE = "Asia/Dhaka";

function dhakaDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86400000);
}

export function formatClock(value: string | Date, locale: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .toUpperCase()
    .replace(/\./g, "");
}

export function formatDateShort(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "numeric",
    year: "2-digit",
  }).formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value ?? "1";
  const month = parts.find((p) => p.type === "month")?.value ?? "1";
  const year = parts.find((p) => p.type === "year")?.value ?? "00";
  return `${Number(day)}/${Number(month)}/${year}`;
}

/** Today -> 8:28 AM, yesterday -> Yesterday (localized), older -> D/M/YY. */
export function formatListTime(
  value: string | Date | null,
  locale: string,
  labels: { yesterday: string },
): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  const now = new Date();
  const today = dhakaDayKey(now);
  const target = dhakaDayKey(date);
  if (today === target) return formatClock(date, locale);
  if (dhakaDayKey(shiftDays(now, 1)) === target) return labels.yesterday;
  return formatDateShort(date);
}

export function formatMonthYear(value: string | Date, locale: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
    timeZone: TIME_ZONE,
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: string | Date, locale: string): string {
  return `${formatDateShort(value)} · ${formatClock(value, locale)}`;
}
