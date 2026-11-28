import { taxBasisPoints, taxMinorAtBasisPoints, validateTaxBasisPoints } from "./tax-rate.js";
import { closest, LISTED_WHOLE } from "./closest.js";
import { assertForeignAmount, convertMinor, type ForeignAmount } from "./fx.js";
import { BookiError, msg } from "./msg.js";
import { sumMinorUnits } from "./money.js";
import { assertPostingAllowed, type PeriodState } from "./period-lock.js";

export type VoucherLine = {
  id: string;
  account: string;
  accountName: string;
  /** Debit in minor units */
  debitMinor: number;
  /** Credit in minor units */
  creditMinor: number;
  dims?: string;
  /** VAT / tax code for this line, e.g. "MVA25". */
  vatCode?: string;
  /** Department dimension code. */
  department?: string;
  /** Project dimension code. */
  project?: string;
  /** Any further dimensions, by key: `{ costCentre: "40", region: "N" }`. */
  dimensions?: Record<string, string>;
  /** Set when the line was booked in another currency: that amount and its rate. */
  foreign?: ForeignAmount;
};

export type VoucherBalance = {
  debitMinor: number;
  creditMinor: number;
  balanced: boolean;
  differenceMinor: number;
};

/** An amount as `parseLineAmount` reads it: digits-only text counts as its number. */
const amountOf = (value: unknown): number =>
  typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : (value as number);

export function sumVoucher(lines: VoucherLine[]): VoucherBalance {
  // Summed exactly: a float sum past the safe range is rounded, and two different totals could compare equal.
  const debitMinor = sumMinorUnits(lines, (line) => amountOf(line.debitMinor));
  const creditMinor = sumMinorUnits(lines, (line) => amountOf(line.creditMinor));
  // Past the safe range a sum is rounded and two different totals can compare equal.
  if (!Number.isSafeInteger(debitMinor)) throw new BookiError("money.not-safe-integer", { value: String(debitMinor) });
  if (!Number.isSafeInteger(creditMinor))
    throw new BookiError("money.not-safe-integer", { value: String(creditMinor) });
  return {
    debitMinor,
    creditMinor,
    balanced: debitMinor === creditMinor,
    differenceMinor: debitMinor - creditMinor,
  };
}

export type AccountOption = {
  number: string;
  name: string;
  /** VAT codes this account may be posted with. Omit to allow any known code. */
  vatCodes?: string[];
  /** VAT code a line gets when posted to this account without one. */
  defaultVatCode?: string;
  /** A line on this account is not postable without a department. */
  requiresDepartment?: boolean;
  /** A line on this account is not postable without a project. */
  requiresProject?: boolean;
  /** Keys of further dimensions a line on this account must carry. */
  requiredDimensions?: string[];
};

/** A department or project a line can be tagged with. */
export type DimensionOption = { code: string; name: string };

export type VoucherDimension = "department" | "project";

/** A dimension beyond department and project: cost centre, region, product line. */
export type DimensionDefinition = {
  /** The key on `VoucherLine.dimensions`. */
  key: string;
  name: string;
  /** The closed list of values. Omit to accept any code. */
  options?: DimensionOption[];
};

/** When and by whom a voucher is being posted. Checked against `rules.periods`. */
export type PostingContext = {
  /** Posting date, YYYY-MM-DD. */
  date: string;
  /** True when the person posting may adjust a soft-closed period. */
  mayAdjustClosed?: boolean;
};

/** The closed vocabularies and account rules a voucher is checked against. */
export type VoucherRules = {
  accounts?: AccountOption[];
  /** Every VAT code that exists. Omit to accept any code. */
  vatCodes?: string[];
  departments?: DimensionOption[];
  projects?: DimensionOption[];
  /** Further dimensions. A key that is not listed here is refused. */
  dimensions?: DimensionDefinition[];
  /** Closed periods. A voucher dated inside one is not postable. */
  periods?: PeriodState[];
  /** The currency the books are kept in. Needed to check foreign-currency lines. */
  baseCurrency?: string;
  /**
   * VAT codes with their rates. With them, a line with a VAT code is read as
   * gross and its VAT as posted for it (see `vatPostings`), and a voucher that
   * also posts that VAT by hand is refused: it would count it twice.
   */
  taxCodes?: { code: string; percent: number }[];
  /** Where VAT is posted. Default 2710 for input VAT and 2700 for output VAT. */
  vatAccounts?: VatAccounts;
};

export type NewVoucherLine = {
  account: string;
  accountName: string;
  debitMinor?: number;
  creditMinor?: number;
  dims?: string;
  vatCode?: string;
  department?: string;
  project?: string;
  dimensions?: Record<string, string>;
  id?: string;
};

function describeValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * A voucher amount in integer minor units: a non-negative safe integer.
 * Accepts a number, or text that is only digits ("12500"). Anything else
 * throws an Error naming the field, the rule and the offending value; it is
 * never coerced to 0.
 */
export function parseLineAmount(value: unknown, field: string): number {
  let n: number | undefined;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    n = Number(value.trim());
  }
  if (n === undefined || !Number.isSafeInteger(n) || n < 0) {
    throw new BookiError("voucher.amount-format", { field: String(field), value: describeValue(value) });
  }
  return n;
}

/**
 * Check one voucher line: account set, both amounts non-negative safe
 * integers in minor units, and not both a debit and a credit.
 * Throws an Error that states the broken rule and the value.
 */
export function validateVoucherLine(line: { account: string; debitMinor: number; creditMinor: number }): void {
  if (typeof line.account !== "string" || line.account.trim() === "") {
    throw new BookiError("voucher.account-required", { value: describeValue(line.account) });
  }
  parseLineAmount(line.debitMinor, "debitMinor");
  parseLineAmount(line.creditMinor, "creditMinor");
  if (line.debitMinor > 0 && line.creditMinor > 0) {
    throw new BookiError("voucher.debit-and-credit", {
      account: line.account,
      debit: line.debitMinor,
      credit: line.creditMinor,
    });
  }
}

/**
 * Look up `account` in a closed chart. Throws when it isn't there, listing a
 * few valid accounts. Returns the chart's own name for the account.
 */
export function resolveChartAccount(chart: AccountOption[], account: string): AccountOption {
  const number = String(account).trim();
  const found = chart.find((option) => option.number === number);
  if (found) return found;
  // A short chart is listed whole: a model reads a partial list as the chart.
  const shown = chart.length <= LISTED_WHOLE ? chart.length : 5;
  // Of a long one, the nearest to what was asked for.
  const sample = closest(chart, account, (option) => `${option.number} ${option.name}`, shown)
    .map((option) => `${option.number} ${option.name}`)
    .join(", ");
  if (!number) {
    throw new BookiError("voucher.account-needed", {
      sample: sample || msg("word.none"),
      more: chart.length > shown ? `, … (${chart.length})` : "",
    });
  }
  if (chart.length > shown) {
    throw new BookiError("voucher.unknown-account-more", {
      account: describeValue(account),
      sample,
      count: chart.length,
    });
  }
  throw new BookiError("voucher.unknown-account", {
    account: describeValue(account),
    sample: sample || msg("word.none"),
  });
}

let lineSeq = 0;

export function createVoucherLine(input: NewVoucherLine): VoucherLine {
  const debitMinor = input.debitMinor === undefined ? 0 : parseLineAmount(input.debitMinor, "debitMinor");
  const creditMinor = input.creditMinor === undefined ? 0 : parseLineAmount(input.creditMinor, "creditMinor");
  validateVoucherLine({ account: input.account, debitMinor, creditMinor });
  lineSeq += 1;
  return {
    id: input.id ?? `line-${lineSeq}-${Math.random().toString(36).slice(2, 6)}`,
    account: input.account,
    accountName: input.accountName,
    debitMinor,
    creditMinor,
    dims: input.dims,
    ...(input.vatCode ? { vatCode: input.vatCode } : {}),
    ...(input.department ? { department: input.department } : {}),
    ...(input.project ? { project: input.project } : {}),
    ...(input.dimensions && Object.keys(input.dimensions).length > 0 ? { dimensions: { ...input.dimensions } } : {}),
  };
}

export function upsertLine(lines: VoucherLine[], next: VoucherLine): VoucherLine[] {
  const index = lines.findIndex((line) => line.id === next.id);
  if (index === -1) return [...lines, next];
  const copy = lines.slice();
  copy[index] = next;
  return copy;
}

export function removeLine(lines: VoucherLine[], lineId: string): VoucherLine[] {
  return lines.filter((line) => line.id !== lineId);
}

export function setLineDebit(lines: VoucherLine[], lineId: string, debitMinor: number): VoucherLine[] {
  debitMinor = parseLineAmount(debitMinor, "debitMinor");
  return lines.map((line) => (line.id === lineId ? { ...line, debitMinor, creditMinor: 0 } : line));
}

export function setLineCredit(lines: VoucherLine[], lineId: string, creditMinor: number): VoucherLine[] {
  creditMinor = parseLineAmount(creditMinor, "creditMinor");
  return lines.map((line) => (line.id === lineId ? { ...line, creditMinor, debitMinor: 0 } : line));
}

export function setLineAccount(
  lines: VoucherLine[],
  lineId: string,
  account: string,
  accountName?: string,
): VoucherLine[] {
  if (typeof account !== "string" || account.trim() === "") {
    throw new BookiError("voucher.account-required", { value: describeValue(account) });
  }
  return lines.map((line) =>
    line.id === lineId
      ? {
          ...line,
          account,
          accountName: accountName ?? line.accountName,
        }
      : line,
  );
}

function accountOf(rules: VoucherRules, account: string) {
  return rules.accounts?.find((option) => option.number === account);
}

/**
 * The VAT code a line on `account` may carry. Throws when the code does not
 * exist, or when the account does not allow it, naming the codes that are
 * allowed. An empty code clears it.
 */
export function resolveVatCode(rules: VoucherRules, account: string, code: unknown): string | undefined {
  const text = String(code ?? "").trim();
  if (text === "") return undefined;
  if (rules.vatCodes && !rules.vatCodes.includes(text)) {
    throw new BookiError("voucher.unknown-vat-code", {
      code: describeValue(code),
      codes: rules.vatCodes.join(", ") || msg("word.none"),
    });
  }
  const allowed = accountOf(rules, account)?.vatCodes;
  if (allowed && !allowed.includes(text)) {
    throw new BookiError("voucher.vat-code-not-allowed", {
      account: String(account),
      code: text,
      codes: allowed.join(", ") || msg("word.none"),
    });
  }
  return text;
}

/**
 * A department or project code from its closed list. Throws when the code is
 * not listed, naming a few that are. An empty code clears the dimension.
 */
export function resolveDimension(rules: VoucherRules, kind: VoucherDimension, code: unknown): string | undefined {
  const text = String(code ?? "").trim();
  if (text === "") return undefined;
  const options = kind === "department" ? rules.departments : rules.projects;
  if (options && !options.some((option) => option.code === text)) {
    const sample = options
      .slice(0, 5)
      .map((option) => `${option.code} ${option.name}`)
      .join(", ");
    const params = { kind: String(kind), code: describeValue(code), sample: sample || msg("word.none") };
    if (kind === "department") throw new BookiError("voucher.unknown-department", params);
    if (kind === "project") throw new BookiError("voucher.unknown-project", params);
    throw new BookiError("voucher.unknown-dimension-kind", params);
  }
  return text;
}

/**
 * Bring a line in step with its account: a missing VAT code, or one the
 * account does not allow, becomes the account's default (or none).
 */
export function applyAccountRules(line: VoucherLine, rules: VoucherRules): VoucherLine {
  const account = accountOf(rules, line.account);
  if (!account) return line;
  const legal = line.vatCode !== undefined && (!account.vatCodes || account.vatCodes.includes(line.vatCode));
  if (legal) return line;
  const { vatCode: _dropped, ...rest } = line;
  return account.defaultVatCode ? { ...rest, vatCode: account.defaultVatCode } : rest;
}

export function setLineVatCode(lines: VoucherLine[], lineId: string, vatCode: string | undefined): VoucherLine[] {
  return lines.map((line) => {
    if (line.id !== lineId) return line;
    const { vatCode: _old, ...rest } = line;
    return vatCode ? { ...rest, vatCode } : rest;
  });
}

export function setLineDimension(
  lines: VoucherLine[],
  lineId: string,
  kind: VoucherDimension,
  code: string | undefined,
): VoucherLine[] {
  return lines.map((line) => {
    if (line.id !== lineId) return line;
    const { [kind]: _old, ...rest } = line;
    return code ? ({ ...rest, [kind]: code } as VoucherLine) : (rest as VoucherLine);
  });
}

/**
 * A value for one of the further dimensions in `rules.dimensions`. Throws when
 * the dimension does not exist or the code is not in its list. An empty code
 * clears it.
 */
export function resolveCustomDimension(rules: VoucherRules, key: string, code: unknown): string | undefined {
  const definition = rules.dimensions?.find((item) => item.key === key);
  if (!definition) {
    throw new BookiError("voucher.unknown-dimension", {
      key: describeValue(key),
      keys: ["department", "project", ...(rules.dimensions ?? []).map((item) => item.key)].join(", "),
    });
  }
  const text = String(code ?? "").trim();
  if (text === "") return undefined;
  if (definition.options && !definition.options.some((option) => option.code === text)) {
    const sample = definition.options
      .slice(0, 5)
      .map((option) => `${option.code} ${option.name}`)
      .join(", ");
    throw new BookiError("voucher.unknown-dimension-value", {
      name: definition.name,
      code: describeValue(code),
      sample: sample || msg("word.none"),
    });
  }
  return text;
}

export function setLineCustomDimension(
  lines: VoucherLine[],
  lineId: string,
  key: string,
  code: string | undefined,
): VoucherLine[] {
  return lines.map((line) => {
    if (line.id !== lineId) return line;
    const { [key]: _old, ...others } = line.dimensions ?? {};
    const dimensions = code ? { ...others, [key]: code } : others;
    const { dimensions: _dropped, ...rest } = line;
    return Object.keys(dimensions).length > 0 ? { ...rest, dimensions } : rest;
  });
}

/**
 * Book a line in another currency: the base amount is worked out from the
 * foreign amount and its rate, on whichever side the line already has
 * (debit unless it is a credit line). An undefined `foreign` clears it.
 */
export function setLineForeign(
  lines: VoucherLine[],
  lineId: string,
  foreign: ForeignAmount | undefined,
  baseCurrency: string,
): VoucherLine[] {
  return lines.map((line) => {
    if (line.id !== lineId) return line;
    const { foreign: _old, ...rest } = line;
    if (!foreign) return rest;
    const base = Math.abs(convertMinor(foreign.amountMinor, foreign.currency, baseCurrency, foreign.rateScaled));
    const credit = line.creditMinor > 0 && line.debitMinor === 0;
    return {
      ...rest,
      debitMinor: credit ? 0 : base,
      creditMinor: credit ? base : 0,
      foreign: { ...foreign, currency: foreign.currency.toUpperCase() },
    };
  });
}

/**
 * Everything that stops a voucher from being posted, as sentences an agent or
 * a person can act on. Empty means postable.
 */
export function voucherIssues(lines: VoucherLine[], rules: VoucherRules = {}, posting?: PostingContext): string[] {
  const issues: string[] = [];
  if (posting && rules.periods) {
    try {
      assertPostingAllowed(rules.periods, posting.date, posting);
    } catch (error) {
      issues.push((error as Error).message);
    }
  }
  if (lines.length === 0) issues.push(msg("voucher.no-lines"));
  // Each line on its own: whole, non-negative øre, an account, one side only.
  let valid = 0;
  for (const line of lines) {
    try {
      validateVoucherLine(line);
      valid += 1;
    } catch (error) {
      issues.push((error as Error).message);
    }
  }
  if (lines.length > 0 && lines.every((line) => !line.debitMinor && !line.creditMinor)) {
    issues.push(msg("voucher.no-amount"));
  }
  if (rules.taxCodes) {
    const vatAccount = new Set([
      (rules.vatAccounts?.input ?? DEFAULT_VAT_ACCOUNTS.input).account,
      (rules.vatAccounts?.output ?? DEFAULT_VAT_ACCOUNTS.output).account,
    ]);
    const byHand = lines.find((line) => vatAccount.has(line.account) && (line.debitMinor || line.creditMinor));
    const coded = lines.find(
      (line) =>
        (rules.taxCodes!.find((code) => code.code === line.vatCode)?.percent ?? 0) > 0 && !vatAccount.has(line.account),
    );
    if (byHand && coded) {
      issues.push(
        msg("voucher.vat-twice", {
          id: coded.id,
          account: coded.account,
          code: coded.vatCode ?? "",
          percent: rules.taxCodes.find((code) => code.code === coded.vatCode)?.percent ?? 0,
          vatAccount: byHand.account,
        }),
      );
    }
  }
  // A line that is not whole øre was named above, and its sum would only throw.
  // The rest are summed exactly: a total past the safe range is an issue too.
  if (valid === lines.length) {
    try {
      const balance = sumVoucher(lines);
      if (!balance.balanced) {
        issues.push(msg("voucher.out-of-balance", { difference: balance.differenceMinor }));
      }
    } catch (error) {
      issues.push((error as Error).message);
    }
  }
  for (const line of lines) {
    if (line.foreign && rules.baseCurrency) {
      try {
        assertForeignAmount(line.foreign, rules.baseCurrency, line.debitMinor || line.creditMinor);
      } catch (error) {
        issues.push(msg("voucher.line-issue", { id: line.id, message: (error as Error).message }));
      }
    }
    const account = accountOf(rules, line.account);
    if (!account) continue;
    if (account.requiresDepartment && !line.department) {
      issues.push(msg("voucher.line-needs-department", { id: line.id, account: line.account }));
    }
    if (account.requiresProject && !line.project) {
      issues.push(msg("voucher.line-needs-project", { id: line.id, account: line.account }));
    }
    for (const key of account.requiredDimensions ?? []) {
      if (!line.dimensions?.[key]) {
        const name = rules.dimensions?.find((item) => item.key === key)?.name ?? key;
        issues.push(msg("voucher.line-needs-dimension", { id: line.id, account: line.account, name }));
      }
    }
    if (account.vatCodes && line.vatCode !== undefined && !account.vatCodes.includes(line.vatCode)) {
      issues.push(
        msg("voucher.line-vat-code", {
          id: line.id,
          account: line.account,
          code: line.vatCode,
          codes: account.vatCodes.join(", ") || msg("word.none"),
        }),
      );
    }
  }
  return issues;
}

/** Balanced, and every line satisfies its account's rules. Throws otherwise. */
export function assertPostable(
  lines: VoucherLine[],
  rules: VoucherRules = {},
  posting?: PostingContext,
): VoucherBalance {
  const issues = voucherIssues(lines, rules, posting);
  if (issues.length > 0) {
    throw new BookiError("voucher.not-postable", { issues });
  }
  return sumVoucher(lines);
}

export function assertBalanced(lines: VoucherLine[]): VoucherBalance {
  const balance = sumVoucher(lines);
  if (!balance.balanced) {
    throw new BookiError("voucher.unbalanced", { difference: balance.differenceMinor });
  }
  return balance;
}

export type SalesVoucherAccounts = {
  receivable: AccountOption;
  revenue: AccountOption;
  taxPayable: AccountOption;
};

/**
 * Build a balanced sales voucher: debit receivable (gross), credit revenue (net)
 * and tax payable (tax). Amounts are integer minor units.
 */
export function buildBalancedSalesVoucher(
  accounts: SalesVoucherAccounts,
  input: { amountMinor: number; taxPercent: number },
): VoucherLine[] {
  const netMinor = input.amountMinor;
  if (!Number.isInteger(netMinor) || netMinor < 0) {
    throw new BookiError("voucher.sales-amount-format", { value: String(netMinor) });
  }
  const bp = taxBasisPoints(input.taxPercent);
  validateTaxBasisPoints(bp);
  const taxMinor = Number(taxMinorAtBasisPoints(BigInt(netMinor), bp));
  const grossMinor = netMinor + taxMinor;
  return [
    createVoucherLine({
      id: "recv",
      account: accounts.receivable.number,
      accountName: accounts.receivable.name,
      debitMinor: grossMinor,
      creditMinor: 0,
    }),
    createVoucherLine({
      id: "rev",
      account: accounts.revenue.number,
      accountName: accounts.revenue.name,
      debitMinor: 0,
      creditMinor: netMinor,
    }),
    createVoucherLine({
      id: "tax",
      account: accounts.taxPayable.number,
      accountName: accounts.taxPayable.name,
      debitMinor: 0,
      creditMinor: taxMinor,
    }),
  ];
}

/** Where the VAT of a line with a VAT code is posted. */
export type VatAccounts = {
  /** VAT on purchases, posted on the debit side. Default 2710 Inngående merverdiavgift. */
  input?: { account: string; accountName: string };
  /** VAT on sales, posted on the credit side. Default 2700 Utgående merverdiavgift. */
  output?: { account: string; accountName: string };
};

const DEFAULT_VAT_ACCOUNTS: Required<VatAccounts> = {
  input: { account: "2710", accountName: "Inngående merverdiavgift" },
  output: { account: "2700", accountName: "Utgående merverdiavgift" },
};

/**
 * The postings a voucher makes, as the ledger receives them. A line with a
 * VAT code carries its amount including VAT, the way people enter it from an
 * invoice: 15 500 on 6800 with 25 % becomes 12 400 on 6800 and 3 100 input
 * VAT on 2710. Debit lines post input VAT, credit lines output VAT. Lines with
 * no code, or a code at 0 %, pass through. The total, and so the balance, is
 * unchanged; the VAT line carries `vatOf` with the line it came from.
 */
export function vatPostings(
  lines: VoucherLine[],
  codes: { code: string; percent: number }[],
  accounts: VatAccounts = {},
): (VoucherLine & { vatOf?: string })[] {
  const input = accounts.input ?? DEFAULT_VAT_ACCOUNTS.input;
  const output = accounts.output ?? DEFAULT_VAT_ACCOUNTS.output;
  const out: (VoucherLine & { vatOf?: string })[] = [];
  for (const line of lines) {
    const percent = codes.find((code) => code.code === line.vatCode)?.percent ?? 0;
    const gross = line.debitMinor || line.creditMinor;
    if (!line.vatCode || percent <= 0 || gross === 0) {
      out.push(line);
      continue;
    }
    // VAT inside a gross amount, rounded half away from zero to the minor unit.
    const vat = Math.round((gross * percent) / (100 + percent));
    const debit = line.debitMinor > 0;
    const target = debit ? input : output;
    out.push({ ...line, debitMinor: debit ? gross - vat : 0, creditMinor: debit ? 0 : gross - vat });
    out.push({
      id: `${line.id}-vat`,
      account: target.account,
      accountName: target.accountName,
      debitMinor: debit ? vat : 0,
      creditMinor: debit ? 0 : vat,
      vatOf: line.id,
    });
  }
  return out;
}
