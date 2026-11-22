export type FinancialDateKind = "invoice" | "due" | "posting";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Normalize loose input to YYYY-MM-DD, or empty string if unusable. */
/** Whether a locale writes the day before the month in numeric dates (en-GB, nb-NO) or after it (en-US). */
function dayFirst(locale: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric", year: "numeric" }).formatToParts(
      new Date(2026, 3, 3),
    );
    return parts.findIndex((part) => part.type === "day") < parts.findIndex((part) => part.type === "month");
  } catch {
    return false;
  }
}

/** Today in the person's own time zone, as YYYY-MM-DD. UTC's date is a day off around midnight. */
export function localToday(now: Date = new Date()): string {
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/**
 * Typed or pasted date text to YYYY-MM-DD, or "" when it is not a date.
 * Slashed dates follow `locale`: 03/04/2026 is 3 April in en-GB and 4 March
 * in en-US (the default, when no locale is given).
 */
export function normalizeIsoDate(value: string, locale?: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const iso = ISO_DATE.exec(trimmed);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (isValidCalendarDate(year, month, day)) {
      return toIsoDate(year, month, day);
    }
    return "";
  }
  // Accept DD.MM.YYYY (common NO input)
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (dotted) {
    const day = Number(dotted[1]);
    const month = Number(dotted[2]);
    const year = Number(dotted[3]);
    if (isValidCalendarDate(year, month, day)) {
      return toIsoDate(year, month, day);
    }
  }
  // Slashed dates in the locale's order: MM/DD/YYYY in en-US, DD/MM/YYYY in en-GB.
  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (slashed) {
    const first = locale !== undefined && dayFirst(locale);
    const month = Number(first ? slashed[2] : slashed[1]);
    const day = Number(first ? slashed[1] : slashed[2]);
    const year = Number(slashed[3]);
    if (isValidCalendarDate(year, month, day)) {
      return toIsoDate(year, month, day);
    }
  }
  return "";
}

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

export function isValidIsoDate(value: string): boolean {
  return normalizeIsoDate(value) !== "" && ISO_DATE.test(value.trim());
}

export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const iso = normalizeIsoDate(value);
  if (!iso) return null;
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function formatFinancialDate(value: string, locale: string): string {
  const parsed = parseIsoDate(value);
  if (!parsed) return value.trim();
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

/** Add calendar days to an ISO date (UTC). */
export function addCalendarDays(iso: string, days: number): string | null {
  const parsed = parseIsoDate(iso);
  if (!parsed) return null;
  const utc = Date.UTC(parsed.year, parsed.month - 1, parsed.day + days);
  const d = new Date(utc);
  return toIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function daysUntilDue(dueIso: string, asOfIso?: string): number | null {
  const due = parseIsoDate(dueIso);
  if (!due) return null;
  const asOf = parseIsoDate(asOfIso ?? localToday());
  if (!asOf) return null;
  const dueMs = Date.UTC(due.year, due.month - 1, due.day);
  const asOfMs = Date.UTC(asOf.year, asOf.month - 1, asOf.day);
  return Math.round((dueMs - asOfMs) / 86_400_000);
}
