import { BookiError, msg } from "./msg.js";

export type OpenItemKind = "receivable" | "payable";

/** An invoice or credit note that is not fully settled. */
export type OpenItem = {
  id: string;
  partyId: string;
  partyName: string;
  documentNumber: string;
  /** ISO date, YYYY-MM-DD. */
  dueDate: string;
  /** What remains, in minor units. Negative for a credit, which reduces the party's total. */
  amountMinor: number;
  kind: OpenItemKind;
};

/** A column of the aging table. Days are whole calendar days past the due date. */
export type AgingBucket = {
  /** `not-due`, `1-30`, `31-60`, `61-90`, `over-90` for the default limits. */
  id: string;
  /** Lowest number of days overdue in the bucket. Missing for the first bucket. */
  fromDays?: number;
  /** Highest number of days overdue in the bucket. Missing for the last bucket. */
  toDays?: number;
};

export type AgingRow = {
  partyId: string;
  partyName: string;
  /** One amount per bucket, in the order of `buckets`. */
  amountsMinor: number[];
  totalMinor: number;
  itemCount: number;
};

export type AgingReport = {
  kind: OpenItemKind;
  asOf: string;
  buckets: AgingBucket[];
  /** Sorted by party name. */
  rows: AgingRow[];
  /** One total per bucket. */
  totalsMinor: number[];
  grandTotalMinor: number;
};

export type AgedItem = OpenItem & {
  /** Whole days past due on the as-of date. Zero or below when not yet due. */
  daysOverdue: number;
  bucket: string;
};

export type OverdueParty = {
  partyId: string;
  partyName: string;
  /** Sum of the items overdue by at least the asked number of days, credits included. */
  overdueMinor: number;
  /** Days overdue of the oldest such item. */
  oldestDays: number;
  itemCount: number;
};

export const DEFAULT_AGING_LIMITS: readonly number[] = [0, 30, 60, 90];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function utcDay(value: unknown, what: string): number {
  if (typeof value === "string" && ISO_DATE.test(value)) {
    const time = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value) return time / DAY_MS;
  }
  throw new BookiError("aging.date-format", { what, value: String(value) });
}

/** Whole calendar days from the due date to the as-of date, counted in UTC. Negative before the due date. */
export function daysOverdue(dueDate: string, asOf: string): number {
  return utcDay(asOf, msg("aging.what.as-of")) - utcDay(dueDate, msg("aging.what.due-date"));
}

/**
 * The buckets for a list of limits. `[0, 30, 60, 90]` gives not due, 1–30,
 * 31–60, 61–90 and over 90. The first limit must be 0 and the rest must rise.
 */
export function agingBuckets(limits: readonly number[] = DEFAULT_AGING_LIMITS): AgingBucket[] {
  const valid =
    Array.isArray(limits) &&
    limits.length > 0 &&
    limits[0] === 0 &&
    limits.every((limit, index) => Number.isSafeInteger(limit) && (index === 0 || limit > limits[index - 1]!));
  if (!valid) {
    throw new BookiError("aging.limits", { value: String(JSON.stringify(limits)) });
  }
  const buckets: AgingBucket[] = [{ id: "not-due", toDays: 0 }];
  for (let index = 1; index < limits.length; index += 1) {
    const fromDays = limits[index - 1]! + 1;
    const toDays = limits[index]!;
    buckets.push({ id: `${fromDays}-${toDays}`, fromDays, toDays });
  }
  const last = limits[limits.length - 1]!;
  buckets.push({ id: `over-${last}`, fromDays: last + 1 });
  return buckets;
}

function bucketIndex(days: number, limits: readonly number[]): number {
  for (let index = 0; index < limits.length; index += 1) {
    if (days <= limits[index]!) return index;
  }
  return limits.length;
}

function checkKind(kind: unknown): OpenItemKind {
  if (kind !== "receivable" && kind !== "payable") {
    throw new BookiError("aging.kind", { value: String(kind) });
  }
  return kind;
}

function checkItems(items: OpenItem[], kind: OpenItemKind | undefined): { kind: OpenItemKind; items: OpenItem[] } {
  const ids = new Set<string>();
  const kinds = new Set<OpenItemKind>();
  for (const item of items) {
    if (ids.has(item.id)) throw new BookiError("aging.item-twice", { id: String(item.id) });
    ids.add(item.id);
    if (!Number.isSafeInteger(item.amountMinor)) {
      throw new BookiError("aging.item-amount", { id: String(item.id), value: String(item.amountMinor) });
    }
    kinds.add(checkKind(item.kind));
  }
  if (kind === undefined) {
    if (kinds.size > 1) {
      throw new BookiError("aging.mixed-kinds");
    }
    return { kind: [...kinds][0] ?? "receivable", items };
  }
  checkKind(kind);
  return { kind, items: items.filter((item) => item.kind === kind) };
}

function safeTotal(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new BookiError("money.not-safe-integer", { value: String(value) });
  return result;
}

const sumMinor = (amounts: bigint[]) => amounts.reduce((total, amount) => total + amount, 0n);

/**
 * The aging table: per party, what is open in each bucket on the as-of date.
 * A credit lands in the bucket of its own due date and reduces the party's
 * total. Pass `kind` when the items hold both receivables and payables.
 */
export function ageItems(
  items: OpenItem[],
  asOf: string,
  buckets: readonly number[] = DEFAULT_AGING_LIMITS,
  kind?: OpenItemKind,
): AgingReport {
  const columns = agingBuckets(buckets);
  const today = utcDay(asOf, msg("aging.what.as-of"));
  const checked = checkItems(items, kind);
  const byParty = new Map<string, { partyId: string; partyName: string; amountsMinor: bigint[]; itemCount: number }>();
  const totalsMinor = columns.map(() => 0n);
  for (const item of checked.items) {
    const days = today - utcDay(item.dueDate, msg("aging.what.item-due-date", { id: String(item.id) }));
    const column = bucketIndex(days, buckets);
    let row = byParty.get(item.partyId);
    if (!row) {
      row = {
        partyId: item.partyId,
        partyName: item.partyName,
        amountsMinor: columns.map(() => 0n),
        itemCount: 0,
      };
      byParty.set(item.partyId, row);
    }
    const amount = BigInt(item.amountMinor);
    row.amountsMinor[column]! += amount;
    row.itemCount += 1;
    totalsMinor[column]! += amount;
  }
  const rows = [...byParty.values()]
    .map((row) => ({
      ...row,
      amountsMinor: row.amountsMinor.map(safeTotal),
      totalMinor: safeTotal(sumMinor(row.amountsMinor)),
    }))
    .sort(
      (a, b) =>
        a.partyName.localeCompare(b.partyName, "en") || (a.partyId < b.partyId ? -1 : a.partyId > b.partyId ? 1 : 0),
    );
  return {
    kind: checked.kind,
    asOf,
    buckets: columns,
    rows,
    totalsMinor: totalsMinor.map(safeTotal),
    grandTotalMinor: safeTotal(sumMinor(totalsMinor)),
  };
}

/**
 * One party's open items with their days overdue and bucket, oldest due date
 * first. Give `bucket` (an id such as `31-60`) to list only that column.
 */
export function partyItems(
  items: OpenItem[],
  asOf: string,
  partyId: string,
  options: { bucket?: string; buckets?: readonly number[]; kind?: OpenItemKind } = {},
): AgedItem[] {
  const limits = options.buckets ?? DEFAULT_AGING_LIMITS;
  const columns = agingBuckets(limits);
  if (options.bucket !== undefined && !columns.some((column) => column.id === options.bucket)) {
    throw new BookiError("aging.no-bucket", {
      bucket: String(options.bucket),
      buckets: columns.map((column) => column.id).join(", "),
    });
  }
  const today = utcDay(asOf, msg("aging.what.as-of"));
  const checked = checkItems(items, options.kind);
  const id = String(partyId ?? "");
  const own = checked.items.filter((item) => item.partyId === id);
  if (own.length === 0) {
    const known = [...new Set(checked.items.map((item) => item.partyId))];
    const listed =
      known.length > 20
        ? msg("word.and-more", { list: known.slice(0, 20).join(", "), count: known.length - 20 })
        : known.join(", ");
    const params = { id, parties: listed || msg("word.none") };
    throw new BookiError(checked.kind === "payable" ? "aging.no-party-payables" : "aging.no-party-receivables", params);
  }
  return own
    .map((item): AgedItem => {
      const days = today - utcDay(item.dueDate, msg("aging.what.item-due-date", { id: String(item.id) }));
      return { ...item, daysOverdue: days, bucket: columns[bucketIndex(days, limits)]!.id };
    })
    .filter((item) => options.bucket === undefined || item.bucket === options.bucket)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Parties with something overdue by at least `minDays` days, largest amount
 * first. Credits that old count against the party; a party whose overdue items
 * net to zero or less is left out.
 */
export function overdueParties(items: OpenItem[], asOf: string, minDays = 1, kind?: OpenItemKind): OverdueParty[] {
  if (!Number.isSafeInteger(minDays) || minDays < 1) {
    throw new BookiError("aging.min-days", { value: String(minDays) });
  }
  const today = utcDay(asOf, msg("aging.what.as-of"));
  const checked = checkItems(items, kind);
  const byParty = new Map<string, Omit<OverdueParty, "overdueMinor"> & { overdueMinor: bigint }>();
  for (const item of checked.items) {
    const days = today - utcDay(item.dueDate, msg("aging.what.item-due-date", { id: String(item.id) }));
    if (days < minDays) continue;
    const party = byParty.get(item.partyId) ?? {
      partyId: item.partyId,
      partyName: item.partyName,
      overdueMinor: 0n,
      oldestDays: 0,
      itemCount: 0,
    };
    party.overdueMinor += BigInt(item.amountMinor);
    party.oldestDays = Math.max(party.oldestDays, days);
    party.itemCount += 1;
    byParty.set(item.partyId, party);
  }
  return [...byParty.values()]
    .filter((party) => party.overdueMinor > 0n)
    .map((party) => ({ ...party, overdueMinor: safeTotal(party.overdueMinor) }))
    .sort((a, b) => b.overdueMinor - a.overdueMinor || (a.partyId < b.partyId ? -1 : 1));
}
