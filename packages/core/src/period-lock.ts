import { BookiError } from "./msg.js";
import { isIsoDate } from "./iso-date.js";
import { parsePeriodCode, periodBounds } from "./period.js";

/**
 * - `open`: anyone who may post, may post.
 * - `soft-closed`: only someone allowed to adjust a closed period may post.
 * - `hard-closed`: nobody posts. Corrections go in an open period.
 */
export type PeriodStatus = "open" | "soft-closed" | "hard-closed";

/** The status of one period, by code: `2025`, `2025-03` or `2025-T2`. */
export type PeriodState = { code: string; status: PeriodStatus };

const RANK: Record<PeriodStatus, number> = { open: 0, "soft-closed": 1, "hard-closed": 2 };

function checkDate(date: string): string {
  const value = String(date ?? "").trim();
  if (!isIsoDate(value)) {
    throw new BookiError("period.posting-date-format", { value: String(JSON.stringify(date)) });
  }
  return value;
}

/**
 * The status that applies to a date. A date can sit in several periods at
 * once (a month, a VAT term, a year); the strictest one wins. A period that
 * is not listed is open.
 */
export function periodStatusOn(states: PeriodState[], date: string): { status: PeriodStatus; code?: string } {
  const day = checkDate(date);
  let found: { status: PeriodStatus; code?: string } = { status: "open" };
  for (const state of states) {
    const bounds = periodBounds(state.code);
    if (!bounds) throw new BookiError("period.not-a-code", { code: String(state.code) });
    // Fail closed: a status Booki does not know ("closed", from a store) is refused, never read as open.
    if (!Object.hasOwn(RANK, state.status)) {
      throw new BookiError("period.not-a-status", { status: String(state.status) });
    }
    if (day < bounds.from || day > bounds.to) continue;
    if (RANK[state.status] > RANK[found.status]) found = { status: state.status, code: state.code };
  }
  return found;
}

/** Throws when a posting dated `date` is not allowed. */
export function assertPostingAllowed(
  states: PeriodState[],
  date: string,
  options: { mayAdjustClosed?: boolean } = {},
): void {
  const { status, code } = periodStatusOn(states, date);
  if (status === "hard-closed") {
    throw new BookiError("period.hard-closed", { code: String(code), date: String(date) });
  }
  if (status === "soft-closed" && !options.mayAdjustClosed) {
    throw new BookiError("period.soft-closed", { code: String(code), date: String(date) });
  }
}

/**
 * Change one period's status and return the new list. A hard-closed period
 * stays closed: reopening it is refused.
 */
export function setPeriodStatus(states: PeriodState[], code: string, status: PeriodStatus): PeriodState[] {
  const period = parsePeriodCode(String(code ?? ""));
  if (!period) throw new BookiError("period.not-a-code", { code: String(code) });
  // Own keys only: "toString" is in every object.
  if (!Object.hasOwn(RANK, status)) {
    throw new BookiError("period.not-a-status", { status: String(status) });
  }
  const current = states.find((state) => state.code === period.code)?.status ?? "open";
  if (current === "hard-closed" && status !== "hard-closed") {
    throw new BookiError("period.hard-closed-reopen", { code: period.code });
  }
  const rest = states.filter((state) => state.code !== period.code);
  return status === "open" ? rest : [...rest, { code: period.code, status }];
}
