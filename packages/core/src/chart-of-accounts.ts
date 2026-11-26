import { BookiError, msg } from "./msg.js";

/**
 * A chart of accounts and the country rules it is checked against: the
 * account classes and their number ranges (Norway's NS 4102, the common US
 * ranges), which types each class holds, and on Norway the SAF-T standard
 * account every active account maps to. Pure functions over plain accounts,
 * so a screen, a server and a test reach the same verdict.
 */

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export const ACCOUNT_TYPES: readonly AccountType[] = ["asset", "liability", "equity", "income", "expense"];

/** One account in the chart. `number` is its identity. */
export type ChartAccount = {
  /** Digits, like "1920". */
  number: string;
  name: string;
  /** The class the account is filed under, when the app records it. Checked against the number. */
  class?: string;
  type: AccountType;
  /** The VAT code postings to the account take by default. */
  vatCode?: string;
  /** Norway: the SAF-T standard account (NS 4102 mapping), 2 or 4 digits. */
  standardAccount?: string;
  active: boolean;
  /** The account has postings: its number and type are fixed. */
  locked?: boolean;
};

/** A class of accounts: its id, names, number range and the types it holds. */
export type AccountClass = {
  id: string;
  names: { en: string; nb: string };
  /** First account number of the range, four digits. Absent in a scheme without ranges. */
  from?: string;
  /** Last account number of the range, four digits, inclusive. */
  to?: string;
  types: readonly AccountType[];
};

export type ChartScheme = {
  id: "ns4102" | "us-common" | "by-type" | (string & {});
  classes: readonly AccountClass[];
  /** Every active account must map to a standard account (Norway: SAF-T). */
  requiresStandard: boolean;
  /** How many digits an account number has. */
  digits: { min: number; max: number };
};

/** Norway: the account classes of NS 4102, with the SAF-T mapping required. */
export const NS4102_SCHEME: ChartScheme = {
  id: "ns4102",
  requiresStandard: true,
  digits: { min: 4, max: 6 },
  classes: [
    { id: "1", names: { en: "Assets", nb: "Eiendeler" }, from: "1000", to: "1999", types: ["asset"] },
    {
      id: "2",
      names: { en: "Equity and liabilities", nb: "Egenkapital og gjeld" },
      from: "2000",
      to: "2999",
      types: ["equity", "liability"],
    },
    {
      id: "3",
      names: { en: "Sales and operating revenue", nb: "Salgs- og driftsinntekt" },
      from: "3000",
      to: "3999",
      types: ["income"],
    },
    { id: "4", names: { en: "Cost of goods sold", nb: "Varekostnad" }, from: "4000", to: "4999", types: ["expense"] },
    { id: "5", names: { en: "Payroll expenses", nb: "Lønnskostnad" }, from: "5000", to: "5999", types: ["expense"] },
    {
      id: "6",
      names: { en: "Other operating expenses, depreciation", nb: "Annen driftskostnad, avskrivning" },
      from: "6000",
      to: "6999",
      types: ["expense"],
    },
    {
      id: "7",
      names: { en: "Other operating expenses", nb: "Annen driftskostnad" },
      from: "7000",
      to: "7999",
      types: ["expense"],
    },
    {
      id: "8",
      names: { en: "Financial items and tax", nb: "Finansposter og skatt" },
      from: "8000",
      to: "8999",
      // Year-end result and transfers (8800–8990) close into equity.
      types: ["income", "expense", "equity"],
    },
  ],
};

/** United States: the number ranges most charts follow. No standard mapping. */
export const US_CHART_SCHEME: ChartScheme = {
  id: "us-common",
  requiresStandard: false,
  digits: { min: 4, max: 6 },
  classes: [
    { id: "assets", names: { en: "Assets", nb: "Eiendeler" }, from: "1000", to: "1999", types: ["asset"] },
    { id: "liabilities", names: { en: "Liabilities", nb: "Gjeld" }, from: "2000", to: "2999", types: ["liability"] },
    { id: "equity", names: { en: "Equity", nb: "Egenkapital" }, from: "3000", to: "3999", types: ["equity"] },
    { id: "revenue", names: { en: "Revenue", nb: "Inntekter" }, from: "4000", to: "4999", types: ["income"] },
    { id: "expenses", names: { en: "Expenses", nb: "Kostnader" }, from: "5000", to: "7999", types: ["expense"] },
    {
      id: "other",
      names: { en: "Other income and expense", nb: "Andre inntekter og kostnader" },
      from: "8000",
      to: "9999",
      types: ["income", "expense"],
    },
  ],
};

/** Any other country: grouped by type, with no number ranges. Pass a scheme of your own for real ranges. */
export const TYPE_SCHEME: ChartScheme = {
  id: "by-type",
  requiresStandard: false,
  digits: { min: 3, max: 10 },
  classes: [
    { id: "asset", names: { en: "Assets", nb: "Eiendeler" }, types: ["asset"] },
    { id: "liability", names: { en: "Liabilities", nb: "Gjeld" }, types: ["liability"] },
    { id: "equity", names: { en: "Equity", nb: "Egenkapital" }, types: ["equity"] },
    { id: "income", names: { en: "Income", nb: "Inntekter" }, types: ["income"] },
    { id: "expense", names: { en: "Expenses", nb: "Kostnader" }, types: ["expense"] },
  ],
};

/** The scheme a country's chart follows: NS 4102 for Norway, the common ranges for the US, by type elsewhere. */
export function chartSchemeFor(country?: string): ChartScheme {
  if (country === "NO") return NS4102_SCHEME;
  if (country === "US") return US_CHART_SCHEME;
  return TYPE_SCHEME;
}

/** "1000–1999", or "" in a scheme without ranges. */
export function classRange(cls: AccountClass): string {
  return cls.from && cls.to ? `${cls.from}–${cls.to}` : "";
}

/** A class as text for a sentence: `1 (1000–1999)`, or the id alone. */
function classLabel(cls: AccountClass): string {
  const range = classRange(cls);
  return range ? `${cls.id} (${range})` : cls.id;
}

/** Every class as text, for a refusal that lists them. */
export function classList(scheme: ChartScheme): string {
  return scheme.classes.map(classLabel).join(", ");
}

/** Where a number sits on a four-digit scale: "15000" and "1500" both read as 1500. */
function scaleOf(number: string): number {
  return Number(number.slice(0, 4).padEnd(4, "0"));
}

const hasRanges = (scheme: ChartScheme) => scheme.classes.some((cls) => cls.from && cls.to);

/** The class whose range holds the number, if the scheme has ranges and one does. */
export function classForNumber(scheme: ChartScheme, number: string): AccountClass | undefined {
  if (!/^\d+$/.test(number)) return undefined;
  const at = scaleOf(number);
  return scheme.classes.find((cls) => cls.from && cls.to && at >= Number(cls.from) && at <= Number(cls.to));
}

/**
 * The class an account is grouped under: by its number in a scheme with
 * ranges, else the class it names, else the first class that holds its type.
 */
export function classOf(scheme: ChartScheme, account: Pick<ChartAccount, "number" | "type" | "class">) {
  if (hasRanges(scheme)) return classForNumber(scheme, account.number);
  const named = account.class === undefined ? undefined : scheme.classes.find((cls) => cls.id === account.class);
  return named ?? scheme.classes.find((cls) => cls.types.includes(account.type));
}

/** A class id the scheme has, or the refusal that lists them. */
export function checkClass(scheme: ChartScheme, value: unknown): AccountClass {
  const id = String(value ?? "").trim();
  const found = scheme.classes.find((cls) => cls.id === id);
  if (!found) throw new BookiError("chart.no-class", { class: id, classes: classList(scheme) });
  return found;
}

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === "string" && (ACCOUNT_TYPES as readonly string[]).includes(value);
}

/** An account type, or the refusal that lists them. */
export function checkAccountType(value: unknown): AccountType {
  if (!isAccountType(value))
    throw new BookiError("chart.unknown-type", { type: String(value), types: ACCOUNT_TYPES.join(", ") });
  return value;
}

/** Account numbers sort as numbers: 1500 before 15000 before 2400. */
export function compareNumbers(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true });
}

export type ChartGroup<A extends ChartAccount = ChartAccount> = {
  /** Null for accounts outside every class. */
  class: AccountClass | null;
  accounts: A[];
};

/**
 * The accounts under their classes, in the scheme's order, each class's
 * accounts in the order given. Accounts outside every class come last.
 * Classes with no account are left out.
 */
export function groupAccounts<A extends ChartAccount>(scheme: ChartScheme, accounts: readonly A[]): ChartGroup<A>[] {
  const groups: ChartGroup<A>[] = scheme.classes.map((cls) => ({ class: cls, accounts: [] }));
  const outside: A[] = [];
  for (const account of accounts) {
    const cls = classOf(scheme, account);
    const group = cls ? groups.find((item) => item.class === cls) : undefined;
    if (group) group.accounts.push(account);
    else outside.push(account);
  }
  const out = groups.filter((group) => group.accounts.length > 0);
  if (outside.length > 0) out.push({ class: null, accounts: outside });
  return out;
}

/** The accounts sorted by class, then number: the order a chart is read in. */
export function chartOrder<A extends ChartAccount>(scheme: ChartScheme, accounts: readonly A[]): A[] {
  const index = (account: A) => {
    const cls = classOf(scheme, account);
    return cls ? scheme.classes.indexOf(cls) : scheme.classes.length;
  };
  return [...accounts].sort((a, b) => index(a) - index(b) || compareNumbers(a.number, b.number));
}

export type AccountIssueCode =
  | "duplicate"
  | "number-format"
  | "no-class"
  | "unknown-class"
  | "class-mismatch"
  | "type-mismatch"
  | "name-empty"
  | "missing-standard"
  | "standard-format";

/** Something wrong with one account. An error blocks a change to the chart; a warning is shown. */
export type AccountIssue = {
  number: string;
  code: AccountIssueCode;
  level: "error" | "warning";
  message: string;
};

/** A SAF-T standard account is 2 digits (a grouping) or 4 digits. */
export const STANDARD_ACCOUNT = /^(\d{2}|\d{4})$/;

/** What is wrong with each account, in the order of the chart. */
export function accountIssues(scheme: ChartScheme, accounts: readonly ChartAccount[]): AccountIssue[] {
  const out: AccountIssue[] = [];
  const counts = new Map<string, number>();
  for (const account of accounts) counts.set(account.number, (counts.get(account.number) ?? 0) + 1);
  const reported = new Set<string>();
  for (const account of accounts) {
    out.push(...issuesOf(scheme, account, counts.get(account.number) ?? 1, reported));
  }
  return out;
}

function issuesOf(scheme: ChartScheme, account: ChartAccount, count: number, reported: Set<string>): AccountIssue[] {
  const { number } = account;
  const out: AccountIssue[] = [];
  const add = (code: AccountIssueCode, level: AccountIssue["level"], message: string) =>
    out.push({ number, code, level, message });

  if (count > 1 && !reported.has(number)) {
    reported.add(number);
    add("duplicate", "error", msg("chart.duplicate", { number, count }));
  }
  const { min, max } = scheme.digits;
  const digits = new RegExp(`^\\d{${min},${max}}$`);
  if (!digits.test(number)) {
    add("number-format", "error", msg("field.account-length", { value: number, min, max }));
  }
  if (String(account.name ?? "").trim() === "") add("name-empty", "error", msg("chart.name-empty", { number }));

  const named = account.class === undefined || account.class === "" ? undefined : account.class;
  const namedClass = named === undefined ? undefined : scheme.classes.find((cls) => cls.id === named);
  if (named !== undefined && !namedClass) {
    add("unknown-class", "error", msg("chart.no-class", { class: named, classes: classList(scheme) }));
  }
  if (hasRanges(scheme) && digits.test(number)) {
    const cls = classForNumber(scheme, number);
    if (!cls) {
      add("no-class", "error", msg("chart.no-class-for-number", { number, classes: classList(scheme) }));
    } else {
      if (namedClass && namedClass !== cls) {
        add(
          "class-mismatch",
          "error",
          msg("chart.class-mismatch", { number, class: namedClass.id, range: classRange(namedClass) }),
        );
      }
      if (isAccountType(account.type) && !cls.types.includes(account.type)) {
        add(
          "type-mismatch",
          "error",
          msg("chart.type-mismatch", {
            number,
            // Quoted: the codes an agent sends, never translated as words.
            type: `"${account.type}"`,
            class: cls.id,
            range: classRange(cls),
            types: cls.types.map((type) => `"${type}"`).join(", "),
          }),
        );
      }
    }
  }
  if (!hasRanges(scheme) && namedClass && isAccountType(account.type) && !namedClass.types.includes(account.type)) {
    add(
      "type-mismatch",
      "error",
      msg("chart.type-not-in-class", {
        number,
        type: `"${account.type}"`,
        class: namedClass.id,
        types: namedClass.types.map((type) => `"${type}"`).join(", "),
      }),
    );
  }
  if (!isAccountType(account.type)) {
    add(
      "type-mismatch",
      "error",
      msg("chart.unknown-type", { type: String(account.type), types: ACCOUNT_TYPES.join(", ") }),
    );
  }
  const standard = account.standardAccount ?? "";
  if (standard !== "" && !STANDARD_ACCOUNT.test(standard)) {
    add("standard-format", "error", msg("chart.standard-format", { value: standard }));
  }
  if (scheme.requiresStandard && account.active && standard === "") {
    add("missing-standard", "warning", msg("chart.missing-standard", { number }));
  }
  return out;
}

/** What an agent may propose for one account. `number` names it; a number not in the chart adds it. */
export type AccountChange = {
  number: string;
  /** A new number for an account without postings. */
  newNumber?: string;
  name?: string;
  type?: AccountType;
  class?: string;
  vatCode?: string;
  standardAccount?: string;
};

export const ACCOUNT_CHANGE_FIELDS = [
  "number",
  "newNumber",
  "name",
  "type",
  "class",
  "vatCode",
  "standardAccount",
] as const;

/** A checked change: an account to add, or one to edit, with what it was. */
export type ProposedChange = AccountChange & { kind: "add" | "edit" };

/** An account number from an agent: digits as text, never a number that lost its leading zero. */
export function accountNumberOf(raw: unknown): string {
  if (typeof raw !== "string" || !/^\d+$/.test(raw.trim())) {
    throw new BookiError("chart.number-text", { got: raw === undefined ? "nothing" : JSON.stringify(raw) });
  }
  return raw.trim();
}

/** The account with this number, or the refusal that lists what the chart has. */
export function findAccount<A extends ChartAccount>(accounts: readonly A[], number: unknown): A {
  const wanted = String(number ?? "").trim();
  const found = accounts.find((account) => account.number === wanted);
  if (found) return found;
  if (accounts.length <= 30) {
    throw new BookiError("chart.no-account", {
      number: wanted,
      numbers: accounts.map((account) => account.number).join(", ") || msg("word.none"),
    });
  }
  // A large chart: the numbers that share the most leading digits with the one asked for.
  const shared = (other: string) => {
    let n = 0;
    while (n < wanted.length && n < other.length && wanted[n] === other[n]) n++;
    return n;
  };
  const closest = [...accounts]
    .sort((a, b) => shared(b.number) - shared(a.number) || compareNumbers(a.number, b.number))
    .slice(0, 10)
    .map((account) => account.number)
    .sort(compareNumbers);
  throw new BookiError("chart.no-account-more", {
    number: wanted,
    count: accounts.length,
    numbers: closest.join(", "),
  });
}

/**
 * Check one proposed change against the chart. Refuses an unknown type or
 * class, a number or type change on an account with postings, a new account
 * without a name and type, and a new number that is taken.
 */
export function checkChange(
  scheme: ChartScheme,
  accounts: readonly ChartAccount[],
  change: AccountChange,
  /** The proposal so far: a later change to an account it adds needs no name or type again. */
  pending: readonly ProposedChange[] = [],
): ProposedChange {
  const number = accountNumberOf(change.number);
  // Checked against the chart as the proposal so far leaves it, so changes apply in order:
  // a number freed by a renumbering is free, and one taken by it or by an addition is taken.
  const chart = applyChanges(accounts, pending);
  const existing = chart.find((account) => account.number === number);
  const adding = pending.some((item) => item.kind === "add" && item.number === number);
  const original = accounts.some((account) => account.number === number);
  // Taken by a renumbering earlier in the proposal: a new account there would collide with it.
  if (existing && !original && !adding) throw new BookiError("chart.exists", { number });
  const out: ProposedChange = { kind: existing && original ? "edit" : "add", number };
  if (change.name !== undefined) {
    const name = String(change.name).trim();
    if (name === "") throw new BookiError("chart.name-empty", { number });
    out.name = name;
  }
  if (change.type !== undefined) out.type = checkAccountType(change.type);
  if (change.class !== undefined && change.class !== "") out.class = checkClass(scheme, change.class).id;
  if (change.vatCode !== undefined) out.vatCode = String(change.vatCode).trim();
  if (change.standardAccount !== undefined) {
    const standard = String(change.standardAccount).trim();
    if (standard !== "" && !STANDARD_ACCOUNT.test(standard)) {
      throw new BookiError("chart.standard-format", { value: standard });
    }
    out.standardAccount = standard;
  }
  if (change.newNumber !== undefined) {
    const next = accountNumberOf(change.newNumber);
    if (next !== number) {
      if (!existing)
        throw new BookiError("chart.no-account", {
          number,
          numbers: chart.map((a) => a.number).join(", ") || msg("word.none"),
        });
      if (chart.some((account) => account.number === next)) throw new BookiError("chart.exists", { number: next });
      out.newNumber = next;
    }
  }
  if (existing?.locked) {
    if (out.newNumber !== undefined) throw new BookiError("chart.locked", { number, field: "number" });
    if (out.type !== undefined && out.type !== existing.type)
      throw new BookiError("chart.locked", { number, field: "type" });
  }
  if (!existing && (out.name === undefined || out.type === undefined)) {
    throw new BookiError("chart.new-needs", { number, types: ACCOUNT_TYPES.join(", ") });
  }
  return out;
}

/** Fold new changes into a proposal: a later change to the same account adds to the earlier one. */
export function mergeChanges(before: readonly ProposedChange[], next: readonly ProposedChange[]): ProposedChange[] {
  const out = before.map((change) => ({ ...change }));
  for (const change of next) {
    // The same account: an addition and its later changes, or edits of one account. A new
    // account at a number an earlier renumbering freed is a change of its own.
    const at = out.findIndex((item) => item.number === change.number && item.kind === change.kind);
    if (at < 0) out.push({ ...change });
    else out[at] = { ...out[at]!, ...change, kind: out[at]!.kind };
  }
  return out;
}

/** The chart with a proposal applied. New accounts are added active. */
export function applyChanges(accounts: readonly ChartAccount[], changes: readonly ProposedChange[]): ChartAccount[] {
  const out = accounts.map((account) => ({ ...account }));
  for (const change of changes) {
    const { kind, number, newNumber, ...fields } = change;
    const patch = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    const earlier = changes.slice(0, changes.indexOf(change));
    // An addition is always a new account, never a patch of whatever holds the number by now:
    // if the number is taken, the duplicate shows and blocks the commit.
    if (kind === "add" && !earlier.some((item) => item.kind === "add" && item.number === number)) {
      out.push(clean({ active: true, ...(patch as unknown as Omit<ChartAccount, "number" | "active">), number }));
      continue;
    }
    // A later change to an account added earlier adds to the newest one with that number.
    const at =
      kind === "add"
        ? out.map((account) => account.number).lastIndexOf(number)
        : out.findIndex((account) => account.number === number);
    // An edit of an account that is no longer there changes nothing; commit checks the proposal again.
    if (at < 0) continue;
    out[at] = clean({ ...out[at]!, ...patch, ...(newNumber ? { number: newNumber } : {}) });
  }
  return out;
}

/** An account without empty optional fields: a cleared VAT code is no VAT code. */
function clean(account: ChartAccount): ChartAccount {
  const out = { ...account };
  for (const key of ["vatCode", "standardAccount", "class"] as const) if (out[key] === "") delete out[key];
  return out;
}

/**
 * The chart with one row's fields changed. The row is its place in the chart,
 * not its number: a duplicated number is two rows, and an edit changes one.
 */
export function editAccount(
  accounts: readonly ChartAccount[],
  at: number,
  patch: Partial<Pick<ChartAccount, "name" | "vatCode" | "standardAccount" | "active">>,
): ChartAccount[] {
  if (!Number.isInteger(at) || at < 0 || at >= accounts.length) {
    throw new BookiError("chart.no-row", { row: String(at), rows: accounts.length });
  }
  return accounts.map((account, index) => (index === at ? clean({ ...account, ...patch }) : account));
}

/**
 * The one row with this number, for a change named by number. A number that
 * is in the chart twice is refused: which row is meant cannot be told.
 */
export function rowOfNumber(accounts: readonly ChartAccount[], number: unknown): number {
  const found = findAccount(accounts, number);
  const count = accounts.filter((account) => account.number === found.number).length;
  if (count > 1) throw new BookiError("chart.ambiguous", { number: found.number, count });
  return accounts.indexOf(found);
}

/**
 * The issues a proposal would leave on the accounts it touches: its errors
 * stop a person from committing it. Issues on accounts it leaves alone do not.
 */
export function proposalIssues(
  scheme: ChartScheme,
  accounts: readonly ChartAccount[],
  changes: readonly ProposedChange[],
): AccountIssue[] {
  const touched = new Set(changes.map((change) => change.newNumber ?? change.number));
  return accountIssues(scheme, applyChanges(accounts, changes)).filter((issue) => touched.has(issue.number));
}
