import { BookiError, msg } from "./msg.js";
import { isIsoDate } from "./iso-date.js";
import { periodBounds } from "./period.js";

/** One posted line of a voucher. Amounts are whole minor units, never negative. */
export type LedgerEntry = {
  id: string;
  voucherId: string;
  voucherNumber: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  account: string;
  accountName: string;
  description: string;
  debitMinor: number;
  creditMinor: number;
  /** Dimension key to value, e.g. `{ costCentre: "40" }`. */
  dimensions?: Record<string, string>;
};

/** Inclusive ISO dates. A missing end is open. */
export type LedgerRange = { from?: string; to?: string };

/** Balances are debit minus credit: an asset is positive, a liability negative. */
export type TrialBalanceRow = {
  account: string;
  accountName: string;
  /** Balance before `from`. Zero when the range has no `from`. */
  openingMinor: number;
  debitMinor: number;
  creditMinor: number;
  closingMinor: number;
};

export type TrialBalanceTotals = {
  openingMinor: number;
  debitMinor: number;
  creditMinor: number;
  closingMinor: number;
};

export type TrialBalance = {
  from?: string;
  to?: string;
  rows: TrialBalanceRow[];
  totals: TrialBalanceTotals;
  /** Total debit minus total credit of everything up to `to`. Zero when the ledger balances. */
  differenceMinor: number;
  balanced: boolean;
};

export type AccountLedgerRow = LedgerEntry & {
  /** The account's balance after this entry. */
  balanceMinor: number;
};

export type AccountLedger = {
  account: string;
  accountName: string;
  from?: string;
  to?: string;
  openingMinor: number;
  debitMinor: number;
  creditMinor: number;
  closingMinor: number;
  rows: AccountLedgerRow[];
};

export type LedgerFilter = LedgerRange & {
  /** One account number, or several. */
  account?: string | string[];
  voucherId?: string;
  /** Matched without case against description, voucher number and account name. */
  text?: string;
  /** Every listed dimension must have this value. */
  dimensions?: Record<string, string>;
};

export type VarianceVoucher = {
  voucherId: string;
  voucherNumber: string;
  date: string;
  description: string;
  /** Which of the two periods the voucher is in. */
  period: "A" | "B";
  /** Debit minus credit the voucher put on the account. */
  netMinor: number;
  /** What it adds to `differenceMinor`: the net for period B, minus the net for period A. */
  effectMinor: number;
};

export type Variance = {
  account: string;
  accountName: string;
  periodA: { code: string; from: string; to: string; netMinor: number };
  periodB: { code: string; from: string; to: string; netMinor: number };
  /** Period B minus period A. The `effectMinor` of the vouchers add up to it. */
  differenceMinor: number;
  /** Largest effect first. */
  vouchers: VarianceVoucher[];
};

/** Throws unless the range is ISO dates in order. Returns it with empty ends dropped. */
export function checkRange(range: LedgerRange = {}): LedgerRange {
  const from = range.from === "" || range.from === null ? undefined : range.from;
  const to = range.to === "" || range.to === null ? undefined : range.to;
  if (from !== undefined && !isIsoDate(from)) {
    throw new BookiError("ledger.range-start-format", { value: String(from) });
  }
  if (to !== undefined && !isIsoDate(to)) {
    throw new BookiError("ledger.range-end-format", { value: String(to) });
  }
  if (from !== undefined && to !== undefined && from > to) {
    throw new BookiError("ledger.range-order", { from: String(from), to: String(to) });
  }
  return { ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) };
}

function checkEntry(entry: LedgerEntry): void {
  if (
    !Number.isSafeInteger(entry.debitMinor) ||
    !Number.isSafeInteger(entry.creditMinor) ||
    entry.debitMinor < 0 ||
    entry.creditMinor < 0
  ) {
    throw new BookiError("ledger.entry-amounts", {
      id: String(entry.id),
      debit: String(entry.debitMinor),
      credit: String(entry.creditMinor),
    });
  }
  if (!isIsoDate(entry.date)) {
    throw new BookiError("ledger.entry-date", { id: String(entry.id), value: String(entry.date) });
  }
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function knownAccounts(entries: LedgerEntry[]): string {
  const accounts = [...new Set(entries.map((entry) => entry.account))].sort(compareText);
  if (accounts.length === 0) return msg("word.none");
  return accounts.length > 20
    ? msg("word.and-more", { list: accounts.slice(0, 20).join(", "), count: accounts.length - 20 })
    : accounts.join(", ");
}

/**
 * Opening balance, debit, credit and closing balance per account, sorted by
 * account number. Does not judge the ledger: read `balanced` and
 * `differenceMinor`, or call `trialBalance` to have an unbalanced ledger refused.
 * One pass over the entries.
 */
export function summarizeLedger(entries: LedgerEntry[], range: LedgerRange = {}): TrialBalance {
  const { from, to } = checkRange(range);
  const byAccount = new Map<string, TrialBalanceRow>();
  for (const entry of entries) {
    checkEntry(entry);
    if (to !== undefined && entry.date > to) continue;
    let row = byAccount.get(entry.account);
    if (!row) {
      row = {
        account: entry.account,
        accountName: entry.accountName,
        openingMinor: 0,
        debitMinor: 0,
        creditMinor: 0,
        closingMinor: 0,
      };
      byAccount.set(entry.account, row);
    }
    if (from !== undefined && entry.date < from) {
      row.openingMinor += entry.debitMinor - entry.creditMinor;
    } else {
      row.debitMinor += entry.debitMinor;
      row.creditMinor += entry.creditMinor;
    }
  }
  const rows = [...byAccount.values()].sort((a, b) => compareText(a.account, b.account));
  const totals: TrialBalanceTotals = { openingMinor: 0, debitMinor: 0, creditMinor: 0, closingMinor: 0 };
  for (const row of rows) {
    row.closingMinor = row.openingMinor + row.debitMinor - row.creditMinor;
    totals.openingMinor += row.openingMinor;
    totals.debitMinor += row.debitMinor;
    totals.creditMinor += row.creditMinor;
    totals.closingMinor += row.closingMinor;
  }
  return {
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    rows,
    totals,
    differenceMinor: totals.closingMinor,
    balanced: totals.openingMinor === 0 && totals.debitMinor === totals.creditMinor,
  };
}

/** Vouchers whose own debit and credit differ, largest difference first. */
export function unbalancedVouchers(
  entries: LedgerEntry[],
  range: LedgerRange = {},
): { voucherId: string; voucherNumber: string; differenceMinor: number }[] {
  const { to } = checkRange(range);
  const byVoucher = new Map<string, { voucherId: string; voucherNumber: string; differenceMinor: number }>();
  for (const entry of entries) {
    if (to !== undefined && entry.date > to) continue;
    const voucher = byVoucher.get(entry.voucherId) ?? {
      voucherId: entry.voucherId,
      voucherNumber: entry.voucherNumber,
      differenceMinor: 0,
    };
    voucher.differenceMinor += entry.debitMinor - entry.creditMinor;
    byVoucher.set(entry.voucherId, voucher);
  }
  return [...byVoucher.values()]
    .filter((voucher) => voucher.differenceMinor !== 0)
    .sort((a, b) => Math.abs(b.differenceMinor) - Math.abs(a.differenceMinor) || compareText(a.voucherId, b.voucherId));
}

/**
 * The trial balance for a range. Throws when total debit and total credit
 * differ, naming the amount and the vouchers that do not balance.
 */
export function trialBalance(entries: LedgerEntry[], range: LedgerRange = {}): TrialBalance {
  const result = summarizeLedger(entries, range);
  if (!result.balanced) {
    const off = unbalancedVouchers(entries, range);
    const namedCommaList = off.slice(0, 5).map((voucher) =>
      msg("ledger.voucher-difference", {
        voucher: voucher.voucherNumber || voucher.voucherId,
        difference: voucher.differenceMinor,
      }),
    );
    const opening =
      result.totals.openingMinor === 0 ? "" : msg("ledger.opening-off", { opening: result.totals.openingMinor });
    const tail =
      off.length === 0
        ? msg("ledger.split-voucher")
        : off.length > 5
          ? msg("ledger.unbalanced-vouchers-more", { namedCommaList, count: off.length - 5 })
          : msg("ledger.unbalanced-vouchers", { namedCommaList });
    throw new BookiError("ledger.not-balanced", {
      debit: result.totals.debitMinor,
      credit: result.totals.creditMinor,
      opening,
      difference: result.differenceMinor,
      tail,
    });
  }
  return result;
}

/** Entries that pass every given condition, in the order they came. */
export function filterEntries(entries: LedgerEntry[], filter: LedgerFilter = {}): LedgerEntry[] {
  const { from, to } = checkRange(filter);
  const accounts =
    filter.account === undefined ? null : new Set(Array.isArray(filter.account) ? filter.account : [filter.account]);
  const text = filter.text?.trim().toLowerCase() ?? "";
  const dimensions = Object.entries(filter.dimensions ?? {});
  return entries.filter((entry) => {
    if (from !== undefined && entry.date < from) return false;
    if (to !== undefined && entry.date > to) return false;
    if (accounts && !accounts.has(entry.account)) return false;
    if (filter.voucherId !== undefined && entry.voucherId !== filter.voucherId) return false;
    for (const [key, value] of dimensions) {
      if (entry.dimensions?.[key] !== value) return false;
    }
    if (text !== "") {
      const haystack = `${entry.description}\n${entry.voucherNumber}\n${entry.accountName}`.toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    return true;
  });
}

function byDateThenVoucher(a: LedgerEntry, b: LedgerEntry): number {
  return compareText(a.date, b.date) || compareText(a.voucherNumber, b.voucherNumber) || compareText(a.id, b.id);
}

/**
 * One account's entries in a range, oldest first, each with the balance after
 * it. The first balance starts from everything posted before `from`.
 */
export function accountLedger(entries: LedgerEntry[], account: string, range: LedgerRange = {}): AccountLedger {
  const { from, to } = checkRange(range);
  const number = String(account ?? "").trim();
  let accountName: string | undefined;
  let openingMinor = 0;
  const inRange: LedgerEntry[] = [];
  for (const entry of entries) {
    if (entry.account !== number) continue;
    checkEntry(entry);
    accountName ??= entry.accountName;
    if (to !== undefined && entry.date > to) continue;
    if (from !== undefined && entry.date < from) openingMinor += entry.debitMinor - entry.creditMinor;
    else inRange.push(entry);
  }
  if (accountName === undefined) {
    throw new BookiError("ledger.no-account", { number, accounts: knownAccounts(entries) });
  }
  inRange.sort(byDateThenVoucher);
  let balanceMinor = openingMinor;
  let debitMinor = 0;
  let creditMinor = 0;
  const rows = inRange.map((entry): AccountLedgerRow => {
    balanceMinor += entry.debitMinor - entry.creditMinor;
    debitMinor += entry.debitMinor;
    creditMinor += entry.creditMinor;
    return { ...entry, balanceMinor };
  });
  return {
    account: number,
    accountName,
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    openingMinor,
    debitMinor,
    creditMinor,
    closingMinor: balanceMinor,
    rows,
  };
}

function boundsOf(code: string, which: string): { code: string; from: string; to: string } {
  const bounds = typeof code === "string" ? periodBounds(code) : null;
  if (!bounds) {
    throw new BookiError("ledger.period-code", { which, value: String(code) });
  }
  return { code: code.trim(), ...bounds };
}

/**
 * Why an account moved differently in two periods: every voucher that touched
 * it in either period, with what it adds to the difference (B minus A),
 * largest first. Changes nothing.
 */
export function explainVariance(entries: LedgerEntry[], account: string, periodA: string, periodB: string): Variance {
  const a = boundsOf(periodA, "A");
  const b = boundsOf(periodB, "B");
  if (a.code === b.code) {
    throw new BookiError("ledger.same-periods", { code: a.code });
  }
  const number = String(account ?? "").trim();
  let accountName: string | undefined;
  const vouchers = new Map<string, VarianceVoucher>();
  let netA = 0;
  let netB = 0;
  for (const entry of entries) {
    if (entry.account !== number) continue;
    checkEntry(entry);
    accountName ??= entry.accountName;
    const net = entry.debitMinor - entry.creditMinor;
    // Overlapping periods (a year and one of its months) count the entry in both.
    for (const [period, bounds] of [
      ["A", a],
      ["B", b],
    ] as const) {
      if (entry.date < bounds.from || entry.date > bounds.to) continue;
      if (period === "A") netA += net;
      else netB += net;
      const key = `${period}|${entry.voucherId}`;
      const voucher = vouchers.get(key);
      if (voucher) {
        voucher.netMinor += net;
        voucher.effectMinor += period === "B" ? net : -net;
      } else {
        vouchers.set(key, {
          voucherId: entry.voucherId,
          voucherNumber: entry.voucherNumber,
          date: entry.date,
          description: entry.description,
          period,
          netMinor: net,
          effectMinor: period === "B" ? net : -net,
        });
      }
    }
  }
  if (accountName === undefined) {
    throw new BookiError("ledger.no-account", { number, accounts: knownAccounts(entries) });
  }
  return {
    account: number,
    accountName,
    periodA: { ...a, netMinor: netA },
    periodB: { ...b, netMinor: netB },
    differenceMinor: netB - netA,
    vouchers: [...vouchers.values()]
      .filter((voucher) => voucher.effectMinor !== 0)
      .sort(
        (x, y) =>
          Math.abs(y.effectMinor) - Math.abs(x.effectMinor) ||
          compareText(x.date, y.date) ||
          compareText(x.voucherId, y.voucherId),
      ),
  };
}
