import { formatMoney, money, parseToMinor } from "@booki-aui/core/money";
import type { TaxCode } from "@booki-aui/core/locale";
import {
  applyAccountRules,
  assertBalanced,
  assertPostable,
  createVoucherLine,
  removeLine,
  resolveChartAccount,
  resolveCustomDimension,
  resolveDimension,
  resolveVatCode,
  setLineAccount,
  setLineCredit,
  setLineCustomDimension,
  setLineForeign,
  setLineDebit,
  setLineDimension,
  setLineVatCode,
  sumVoucher,
  validateVoucherLine,
  vatPostings,
  voucherIssues,
  type AccountOption,
  type DimensionOption,
  type VoucherDimension,
  type VoucherLine,
  type VoucherRules,
  type DimensionDefinition,
  type PostingContext,
} from "@booki-aui/core/voucher";
import type { PeriodState } from "@booki-aui/core/period-lock";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { BookiError } from "@booki-aui/core/msg";
import { checkFields } from "./fields.js";
import { restoreSelect } from "./lock.js";

/** How to write a line, shown in the snapshot. Amounts in minor units; with a VAT code, the amount includes VAT. */
export const LINE_FORMAT =
  'addLine({ account: "7140", debitMinor: 250000, vatCode: "11" }) is 2 500,00 incl. VAT, in minor units; setDebit/setCredit(lineId, minor)';

/** How to book a line in another currency, shown in the snapshot. Says the unit of the amount and of the rate. */
export const FOREIGN_FORMAT =
  'setForeign(lineId, "USD", 42000, 10500000) is 420,00 USD at rate 10,5: minor units, rate in millionths; or (lineId, { currency, amountMinor, rateScaled })';

/** The fields an object given to setForeign may carry. */
export const FOREIGN_FIELDS = ["currency", "amountMinor", "rateScaled"] as const;

/** A whole number written as digits counts as that number; anything else stays as given, to be refused. */
const wholeOf = (value: unknown): unknown =>
  typeof value === "string" && /^\s*-?\d+\s*$/.test(value) ? Number(value) : value;

const shownArg = (value: unknown): string => (value === undefined ? "nothing" : JSON.stringify(value));

/** The fields an object given to addLine may carry. */
export const LINE_FIELDS = [
  "account",
  "accountName",
  "debitMinor",
  "creditMinor",
  "vatCode",
  "department",
  "project",
] as const;

export type VoucherComposerOptions = {
  lines?: VoucherLine[];
  defaultLines?: VoucherLine[];
  /** Closed chart of accounts. When set, agents can only post to these. */
  accounts?: AccountOption[];
  /** Every VAT code that exists. When set, lines can only carry these. */
  taxCodes?: TaxCode[];
  /** Closed list of departments a line can be tagged with. */
  departments?: DimensionOption[];
  /** Closed list of projects a line can be tagged with. */
  projects?: DimensionOption[];
  /** Further dimensions (cost centre, region, …) and their closed lists. */
  dimensions?: DimensionDefinition[];
  /** Closed periods. With `postingDate`, a voucher dated in one is not postable. */
  periods?: PeriodState[];
  /** The date the voucher will be posted on, YYYY-MM-DD. */
  postingDate?: string;
  /** True when the person posting may adjust a soft-closed period. */
  mayAdjustClosed?: boolean;
  /** Currency and locale a person's typed amounts are read and shown in. */
  currency?: string;
  locale?: string;
  onLinesChange?: (lines: VoucherLine[], details: { reason: string; source?: string; cancel?: () => void }) => void;
};

/** A field of a line a person can edit in the editable table. */
export type LineField = "account" | "accountName" | "vatCode" | "department" | "project" | "debit" | "credit";

/**
 * Why a person's last edit was refused. `lineId` is null for the add-line
 * row. `code` marks messages the UI has its own wording for.
 */
export type RowError = {
  lineId: string | null;
  message: string;
  code?: "invalid-amount";
};

/** State only the editable table uses. None of it is in the agent snapshot. */
export type EditState = {
  rowError: RowError | null;
  /** Text being typed, by `${lineId}:${field}`, until blur or Enter. */
  drafts: Record<string, string>;
  /** Account chosen for the next line. */
  newAccount: string;
  currency: string;
  locale: string;
};

export class InvalidAmountError extends Error {}

export const draftKey = (lineId: string, field: LineField) => `${lineId}:${field}`;

// Lines by id, per lines array: every cell of every row looks its line up, so a
// scan per lookup made one update of 200 lines cost 200 × 200. A new array
// (every change makes one) gets a new index. The first line with an id wins, as with find.
const indexes = new WeakMap<readonly VoucherLine[], Map<string, VoucherLine>>();

export function lineOf(state: { lines: VoucherLine[] }, lineId: string) {
  let index = indexes.get(state.lines);
  if (!index) {
    index = new Map();
    for (const line of state.lines) if (!index.has(line.id)) index.set(line.id, line);
    indexes.set(state.lines, index);
  }
  return index.get(lineId);
}

/** An amount as a person types it: major units, no currency, empty for zero. */
export function amountText(minor: number, currency: string, locale: string): string {
  return minor ? formatMoney(money(minor, currency), { locale, withCurrency: false }) : "";
}

/** Optional per-line extras an agent may pass as addLine's fifth argument. */
export type LineExtras = { vatCode?: string; department?: string; project?: string };

export function rulesOf(options: VoucherComposerOptions): VoucherRules {
  return {
    accounts: options.accounts,
    vatCodes: options.taxCodes?.map((tax) => tax.code),
    // With the rates, a line with a VAT code is read as its amount including
    // VAT, and a separate line on a VAT account counts that VAT twice.
    taxCodes: options.taxCodes?.map((tax) => ({ code: tax.code, percent: tax.percent })),
    departments: options.departments,
    projects: options.projects,
    dimensions: options.dimensions,
    periods: options.periods,
    baseCurrency: options.currency,
  };
}

export function postingOf(options: VoucherComposerOptions): PostingContext | undefined {
  return options.postingDate
    ? { date: options.postingDate, mayAdjustClosed: options.mayAdjustClosed === true }
    : undefined;
}

export function withBalance(lines: VoucherLine[], rules: VoucherRules = {}, posting?: PostingContext) {
  const balance = sumVoucher(lines);
  const issues = voucherIssues(lines, rules, posting);
  return {
    lines,
    balanced: balance.balanced,
    debitMinor: balance.debitMinor,
    creditMinor: balance.creditMinor,
    differenceMinor: balance.differenceMinor,
    /** What still stops this voucher from being posted. Empty when postable. */
    issues,
    postable: issues.length === 0,
    /**
     * What the ledger receives: each line with a VAT code split into its net
     * amount and a VAT line (2710 on debit, 2700 on credit). Read-only.
     */
    postings: vatPostings(lines, rules.taxCodes ?? [], rules.vatAccounts),
  };
}

/**
 * Agent-operable journal. The snapshot exposes `lines` and `postable`;
 * `assertPostable` names what blocks posting. Actions: addLine / setDebit / setCredit /
 * setAccount / setVatCode / setDepartment / setProject / removeLine / clear /
 * assertBalance / assertPostable. Accounts, VAT codes, departments and
 * projects are closed lists when supplied, and an account can restrict its VAT
 * codes and require a department or project.
 */
/** The fields of a voucher line, for restoring lines through `setLines`. */
const RESTORE_FIELDS = [
  "id",
  "account",
  "accountName",
  "debitMinor",
  "creditMinor",
  "dims",
  "vatCode",
  "department",
  "project",
  "dimensions",
  "foreign",
] as const;
const LINE_EXAMPLE = '{ "id": "l1", "account": "7140", "debitMinor": 250000, "creditMinor": 0, "vatCode": "11" }';

export const voucherComposer = definePrimitive({
  name: "voucher-composer",
  options: {
    lines: "value",
    defaultLines: "value",
    accounts: "value",
    taxCodes: "value",
    departments: "value",
    projects: "value",
    dimensions: "value",
    periods: "value",
    postingDate: "string",
    mayAdjustClosed: "boolean",
    currency: "string",
    locale: "string",
    onLinesChange: "callback",
  },
  // Keys listed here are what the agent snapshot and every step result carry.
  // `postable` and `postings` (what the ledger receives, VAT split out) are
  // added: the full list of issues comes back from `assertPostable`, so
  // ordinary edits stay cheap for an agent to read.
  controlled: ["lines", "postable", "postings", "lineFormat", "foreignFormat"],
  state: (options: VoucherComposerOptions) => {
    const edit: EditState = {
      rowError: null,
      drafts: {},
      newAccount: "",
      currency: options.currency ?? "NOK",
      locale: options.locale ?? "en-US",
    };
    return {
      ...withBalance(options.lines ?? options.defaultLines ?? [], rulesOf(options)),
      ...edit,
      // Read before the first try, so an agent writes a line right the first time.
      lineFormat: LINE_FORMAT,
      foreignFormat: FOREIGN_FORMAT,
    };
  },
  sync: (options: VoucherComposerOptions) => ({
    ...(options.lines === undefined ? {} : withBalance(options.lines, rulesOf(options), postingOf(options))),
    ...(options.currency === undefined ? {} : { currency: options.currency }),
    ...(options.locale === undefined ? {} : { locale: options.locale }),
  }),
  api: (context) => {
    const change = createChange(context);

    const rules = () => rulesOf(context.options());

    // The DOM event behind a person's edit, so the change reports how the
    // person made it (mouse, keyboard, …) instead of "programmatic".
    let personEvent: Event | undefined;

    function commit(next: VoucherLine[], reason: string) {
      const ok = change("lines", next, { reason, event: personEvent });
      if (ok) {
        const { lines: _lines, ...derived } = withBalance(next, rules(), postingOf(context.options()));
        context.store.set(derived);
      }
      return ok;
    }

    /** Validate optional VAT code and dimensions for a line on `account`. */
    function resolveExtras(account: string, extras: unknown): LineExtras {
      if (extras === undefined || extras === null) return {};
      if (typeof extras !== "object") {
        throw new BookiError("voucher.extras-not-object", { got: JSON.stringify(extras) });
      }
      const given = checkFields("addLine", extras, ["vatCode", "department", "project"], LINE_FORMAT) as LineExtras;
      return {
        vatCode: resolveVatCode(rules(), account, given.vatCode),
        department: resolveDimension(rules(), "department", given.department),
        project: resolveDimension(rules(), "project", given.project),
      };
    }

    function setDimension(lineId: string, kind: VoucherDimension, code: string) {
      const { lines } = context.store.get();
      assertLine(lines, String(lineId));
      return commit(
        setLineDimension(lines, String(lineId), kind, resolveDimension(rules(), kind, code)),
        `set-${kind}`,
      );
    }

    /**
     * Account number + name to post. With a closed chart, the account must be
     * in it and the chart's name wins over an omitted or mismatched one.
     */
    function resolveAccount(
      account: unknown,
      accountName: unknown,
    ): { account: string; accountName: string | undefined } {
      const number = String(account ?? "").trim();
      const chart = context.options().accounts;
      if (chart) {
        const found = resolveChartAccount(chart, number);
        return { account: found.number, accountName: found.name };
      }
      return {
        account: number,
        accountName: accountName === undefined || accountName === null ? undefined : String(accountName),
      };
    }

    function assertLine(lines: VoucherLine[], lineId: string) {
      if (!lines.some((line) => line.id === lineId)) {
        const ids = lines.map((line) => line.id).join(", ");
        throw new BookiError("voucher.no-line", { id: lineId, ids: ids || "none" });
      }
    }

    const actions = {
      /**
       * Add a line: positional (account, accountName, debitMinor, creditMinor,
       * { vatCode, department, project }), or one object with the same names.
       */
      addLine: (
        account: string | Record<string, unknown>,
        accountName?: string,
        debitMinor?: number,
        creditMinor?: number,
        extras?: LineExtras,
      ) => {
        if (typeof account === "object" && account !== null) {
          const given = checkFields("addLine", account, LINE_FIELDS, LINE_FORMAT);
          const { vatCode, department, project } = given as LineExtras;
          account = String(given.account ?? "");
          accountName = given.accountName as string | undefined;
          debitMinor = given.debitMinor as number | undefined;
          creditMinor = given.creditMinor as number | undefined;
          extras = {
            ...(vatCode === undefined ? {} : { vatCode }),
            ...(department === undefined ? {} : { department }),
            ...(project === undefined ? {} : { project }),
          };
        }
        const { lines } = context.store.get();
        const resolved = resolveAccount(account, accountName);
        // createVoucherLine validates amounts (non-negative safe integers in
        // minor units, not both sides) and throws a repairable message.
        const line = createVoucherLine({
          account: resolved.account,
          accountName: resolved.accountName ?? "",
          debitMinor,
          creditMinor,
          ...resolveExtras(resolved.account, extras),
        });
        // A line without a VAT code takes its account's default.
        return commit([...lines, applyAccountRules(line, rules())], "add-line");
      },
      setDebit: (lineId: string, debitMinor: number) => {
        const { lines } = context.store.get();
        assertLine(lines, String(lineId));
        return commit(setLineDebit(lines, String(lineId), debitMinor), "set-debit");
      },
      setCredit: (lineId: string, creditMinor: number) => {
        const { lines } = context.store.get();
        assertLine(lines, String(lineId));
        return commit(setLineCredit(lines, String(lineId), creditMinor), "set-credit");
      },
      setAccount: (lineId: string, account: string, accountName?: string) => {
        const { lines } = context.store.get();
        assertLine(lines, String(lineId));
        const resolved = resolveAccount(account, accountName);
        // Moving a line to another account drops a VAT code the new account
        // does not allow and applies that account's default instead.
        return commit(
          setLineAccount(lines, String(lineId), resolved.account, resolved.accountName).map((line) =>
            line.id === String(lineId) ? applyAccountRules(line, rules()) : line,
          ),
          "set-account",
        );
      },
      setVatCode: (lineId: string, vatCode: string) => {
        const { lines } = context.store.get();
        assertLine(lines, String(lineId));
        const line = lines.find((item) => item.id === String(lineId))!;
        return commit(
          setLineVatCode(lines, String(lineId), resolveVatCode(rules(), line.account, vatCode)),
          "set-vat-code",
        );
      },
      setDepartment: (lineId: string, department: string) => setDimension(lineId, "department", department),
      setProject: (lineId: string, project: string) => setDimension(lineId, "project", project),
      /**
       * Replace every line at once (history / staging restore key `lines`).
       * Each line is validated like addLine, and against the chart when set.
       */
      setLines: (next: VoucherLine[]) => {
        if (!Array.isArray(next)) {
          throw new BookiError("voucher.lines-not-list", { got: JSON.stringify(next) ?? String(next) });
        }
        const ids = new Set<string>();
        const checked = next.map((line, index) => {
          if (!line || typeof line !== "object" || typeof line.id !== "string") {
            throw new BookiError("voucher.line-no-id", { index });
          }
          if (ids.has(line.id)) {
            throw new BookiError("voucher.line-twice", { id: line.id });
          }
          ids.add(line.id);
          // A restored line has a line's fields and nothing else: an unknown one
          // (approvedBy, postedBy) is refused, never stored or passed to the owner.
          checkFields("setLines", line, RESTORE_FIELDS, LINE_EXAMPLE);
          validateVoucherLine(line);
          const resolved = resolveAccount(line.account, line.accountName);
          resolveVatCode(rules(), resolved.account, line.vatCode);
          resolveDimension(rules(), "department", line.department);
          resolveDimension(rules(), "project", line.project);
          const known = Object.fromEntries(
            RESTORE_FIELDS.filter((key) => key in line).map((key) => [key, (line as Record<string, unknown>)[key]]),
          );
          return {
            ...(known as typeof line),
            account: resolved.account,
            accountName: resolved.accountName ?? line.accountName ?? "",
          };
        });
        return commit(checked, "set-lines");
      },
      removeLine: (lineId: string) => {
        const { lines } = context.store.get();
        assertLine(lines, String(lineId));
        return commit(removeLine(lines, String(lineId)), "remove-line");
      },
      clear: () => commit([], "clear"),
      assertBalance: () => {
        const { lines } = context.store.get();
        return assertBalanced(lines);
      },
      /** Balanced, and every line satisfies its account's rules. */
      assertPostable: () => {
        const { lines } = context.store.get();
        return assertPostable(lines, rules(), postingOf(context.options()));
      },
      /**
       * Set any dimension on a line: "department", "project", or a key from
       * `dimensions`. An empty code clears it.
       */
      /**
       * Book a line in another currency. `rateScaled` is the rate in
       * millionths (11.5 is 11500000); the base amount is worked out from it.
       * The three values may come as arguments or as one object. Pass no
       * currency to clear it. Each refusal says which value is wrong, its
       * unit, and the whole call written out.
       */
      setForeign: (
        lineId: string,
        currency?: string | { currency?: unknown; amountMinor?: unknown; rateScaled?: unknown },
        amountMinor?: number,
        rateScaled?: number,
      ) => {
        const { lines } = context.store.get();
        assertLine(lines, String(lineId));
        const base = context.options().currency;
        if (!base) throw new BookiError("voucher.no-base-currency");
        const given =
          typeof currency === "object" && currency !== null
            ? checkFields("setForeign", currency, FOREIGN_FIELDS, FOREIGN_FORMAT)
            : currency === undefined || currency === null || currency === ""
              ? undefined
              : { currency, amountMinor, rateScaled };
        if (!given) return commit(setLineForeign(lines, String(lineId), undefined, base), "set-foreign");
        const code = given.currency;
        const amount = wholeOf(given.amountMinor);
        const rate = wholeOf(given.rateScaled);
        if (typeof code !== "string" || !/^[A-Za-z]{3}$/.test(code)) {
          throw new BookiError("voucher.foreign-currency", { got: shownArg(code), format: FOREIGN_FORMAT });
        }
        if (typeof amount !== "number" || !Number.isSafeInteger(amount)) {
          throw new BookiError("voucher.foreign-amount", { got: shownArg(given.amountMinor), format: FOREIGN_FORMAT });
        }
        if (typeof rate !== "number" || !Number.isSafeInteger(rate) || rate <= 0) {
          throw new BookiError("voucher.foreign-rate", { got: shownArg(given.rateScaled), format: FOREIGN_FORMAT });
        }
        return commit(
          setLineForeign(lines, String(lineId), { currency: code, amountMinor: amount, rateScaled: rate }, base),
          "set-foreign",
        );
      },
      setDimension: (lineId: string, key: string, code: string) => {
        if (key === "department" || key === "project") return setDimension(lineId, key, code);
        const { lines } = context.store.get();
        assertLine(lines, String(lineId));
        return commit(
          setLineCustomDimension(
            lines,
            String(lineId),
            String(key),
            resolveCustomDimension(rules(), String(key), code),
          ),
          "set-dimension",
        );
      },
    };

    /**
     * Run a person's edit through the same action an agent calls. A refusal
     * is caught and kept as `rowError` for that row; it never reaches React.
     */
    function byPerson(lineId: string | null, event: Event | undefined, run: () => unknown): boolean {
      personEvent = event;
      try {
        run();
        context.store.set({ rowError: null });
        return true;
      } catch (error) {
        context.store.set({
          rowError: {
            lineId,
            message: error instanceof Error ? error.message : String(error),
            ...(error instanceof InvalidAmountError ? { code: "invalid-amount" as const } : {}),
          },
        });
        return false;
      } finally {
        personEvent = undefined;
      }
    }

    /** Typed major-unit text to minor units. Empty means zero. */
    function typedAmount(raw: string): number {
      const text = raw.trim();
      if (text === "") return 0;
      const { currency, locale } = context.store.get();
      const minor = parseToMinor(text, currency, { locale });
      if (minor === null || minor < 0) {
        throw new InvalidAmountError(`Invalid amount ${JSON.stringify(raw)}`);
      }
      return minor;
    }

    function editLine(lineId: string, field: LineField, raw: string, event?: Event): boolean {
      return byPerson(lineId, event, () => {
        switch (field) {
          case "account":
            return actions.setAccount(lineId, raw);
          case "accountName": {
            const line = lineOf(context.store.get(), lineId);
            return actions.setAccount(lineId, line?.account ?? "", raw);
          }
          case "vatCode":
            return actions.setVatCode(lineId, raw);
          case "department":
            return actions.setDepartment(lineId, raw);
          case "project":
            return actions.setProject(lineId, raw);
          case "debit":
            return actions.setDebit(lineId, typedAmount(raw));
          case "credit":
            return actions.setCredit(lineId, typedAmount(raw));
        }
      });
    }

    return {
      ...actions,
      // Everything below is for a person using the editable table. It is not
      // in `agent.actions`, so the bridge refuses a step that names it.
      /** Change one field of a line. Never throws. */
      editLine,
      /** A person picks a value for a further dimension. Never throws. */
      editDimension: (lineId: string, key: string, code: string, event?: Event) =>
        byPerson(lineId, event, () => actions.setDimension(lineId, key, code)),
      /** Hold what is being typed in a cell until blur or Enter. */
      setDraft: (lineId: string, field: LineField, text: string) => {
        const { drafts } = context.store.get();
        context.store.set({
          drafts: { ...drafts, [draftKey(lineId, field)]: text },
        });
      },
      /** Commit a typed cell. Refused text is dropped and the cell shows the line again. */
      commitDraft: (lineId: string, field: LineField, event?: Event) => {
        const key = draftKey(lineId, field);
        const { drafts } = context.store.get();
        if (!(key in drafts)) return false;
        const { [key]: text = "", ...rest } = drafts;
        context.store.set({ drafts: rest });
        return editLine(lineId, field, text, event);
      },
      setNewAccount: (account: string) => {
        context.store.set({ newAccount: account });
      },
      /** Add a line on the account chosen in the add-line row. Never throws. */
      addLineByPerson: (event?: Event) => {
        const account = context.store.get().newAccount.trim();
        if (account === "") return false;
        const ok = byPerson(null, event, () => actions.addLine(account));
        if (ok) context.store.set({ newAccount: "" });
        return ok;
      },
      /** Remove a line. Never throws. */
      removeLineByPerson: (lineId: string, event?: Event) => byPerson(lineId, event, () => actions.removeLine(lineId)),
    };
  },
  slots: (slot) => {
    // One part per line and field. `value` is the line id and becomes the
    // part's key, so each control edits its own line (ui-sdk's list pattern).
    type Line = { value: string };
    const keyed = { value: "string" } as const;

    /** A `<select>` that commits when the person picks. */
    const lineSelect = (field: LineField, name: string, read: (line: VoucherLine) => string | undefined) =>
      slot<Line>({
        props: keyed,
        attrs: (state, part) => {
          const line = lineOf(state, String(part.key));
          return {
            "data-slot": name,
            value: (line && read(line)) ?? "",
          };
        },
        on: {
          // "input" is the adapter's name for React's onChange (see TaxCodeSelect).
          input: (event, { api, key, store }) => {
            const lineId = String(key);
            api.editLine(lineId, field, (event.target as HTMLSelectElement).value, event);
            // Refused or adjusted: show what the line really holds.
            const line = lineOf(store.get(), lineId);
            restoreSelect(event, (line && read(line)) ?? "");
          },
        },
      });

    /** A text cell that commits on blur or Enter, not on every keystroke. */
    const lineInput = (
      field: LineField,
      name: string,
      read: (line: VoucherLine, state: { currency: string; locale: string }) => string,
      extra: Record<string, string> = {},
    ) =>
      slot<Line>({
        props: keyed,
        attrs: (state, part) => {
          const lineId = String(part.key);
          const line = lineOf(state, lineId);
          return {
            "data-slot": name,
            type: "text",
            autoComplete: "off",
            ...extra,
            value: state.drafts[draftKey(lineId, field)] ?? (line ? read(line, state) : ""),
          };
        },
        on: {
          input: (event, { api, key }) => {
            api.setDraft(String(key), field, (event.target as HTMLInputElement).value);
          },
          blur: (event, { api, key }) => {
            api.commitDraft(String(key), field, event);
          },
          keydown: (event, { api, key }) => {
            if ((event as KeyboardEvent).key !== "Enter") return;
            // Enter commits the cell; it must not submit a surrounding form.
            event.preventDefault();
            api.commitDraft(String(key), field, event);
          },
        },
      });

    const amount = { inputMode: "decimal", "data-align": "end" };

    return {
      root: slot({
        attrs: (state) => ({
          "data-slot": "voucher-composer",
          "data-balanced": state.balanced ? "true" : "false",
        }),
        state: (state) => ({
          lines: state.lines,
          balanced: state.balanced,
          debitMinor: state.debitMinor,
          creditMinor: state.creditMinor,
          differenceMinor: state.differenceMinor,
          issues: state.issues,
          postable: state.postable,
          rowError: state.rowError,
        }),
      }),
      accountSelect: lineSelect("account", "voucher-line-account", (line) => line.account),
      accountInput: lineInput("account", "voucher-line-account", (line) => line.account),
      nameInput: lineInput("accountName", "voucher-line-name", (line) => line.accountName),
      vat: lineSelect("vatCode", "voucher-line-vat", (line) => line.vatCode),
      department: lineSelect("department", "voucher-line-department", (line) => line.department),
      project: lineSelect("project", "voucher-line-project", (line) => line.project),
      // A further dimension. `value` is "lineId|dimensionKey".
      dimension: slot<Line>({
        props: keyed,
        attrs: (state, part) => {
          const [lineId = "", dim = ""] = String(part.key).split("|");
          return {
            "data-slot": "voucher-line-dimension",
            value: lineOf(state, lineId)?.dimensions?.[dim] ?? "",
          };
        },
        on: {
          input: (event, { api, key, store }) => {
            const [lineId = "", dim = ""] = String(key).split("|");
            api.editDimension(lineId, dim, (event.target as HTMLSelectElement).value, event);
            restoreSelect(event, lineOf(store.get(), lineId)?.dimensions?.[dim] ?? "");
          },
        },
      }),
      debit: lineInput(
        "debit",
        "voucher-line-debit",
        (line, state) => amountText(line.debitMinor, state.currency, state.locale),
        amount,
      ),
      credit: lineInput(
        "credit",
        "voucher-line-credit",
        (line, state) => amountText(line.creditMinor, state.currency, state.locale),
        amount,
      ),
      remove: slot<Line>({
        props: keyed,
        attrs: () => ({
          "data-slot": "voucher-line-remove",
          type: "button",
          "data-variant": "ghost",
        }),
        press: ({ api, key }, event) => {
          api.removeLineByPerson(String(key), event);
        },
      }),
      newAccountSelect: slot({
        attrs: (state) => ({
          "data-slot": "voucher-new-account",
          value: state.newAccount,
        }),
        on: {
          input: (event, { api }) => {
            api.setNewAccount((event.target as HTMLSelectElement).value);
          },
        },
      }),
      newAccountInput: slot({
        attrs: (state) => ({
          "data-slot": "voucher-new-account",
          type: "text",
          inputMode: "numeric",
          autoComplete: "off",
          value: state.newAccount,
        }),
        on: {
          input: (event, { api }) => {
            api.setNewAccount((event.target as HTMLInputElement).value);
          },
          keydown: (event, { api }) => {
            if ((event as KeyboardEvent).key !== "Enter") return;
            event.preventDefault();
            api.addLineByPerson(event);
          },
        },
      }),
      add: slot({
        attrs: (state) => ({
          "data-slot": "voucher-line-add",
          type: "button",
          "data-variant": "secondary",
          disabled: state.newAccount.trim() === "" ? "" : undefined,
        }),
        press: ({ api }, event) => {
          api.addLineByPerson(event);
        },
      }),
    };
  },
  agent: {
    actions: [
      "addLine",
      "setDebit",
      "setCredit",
      "setAccount",
      "setVatCode",
      "setDepartment",
      "setProject",
      "setDimension",
      "setForeign",
      "setLines",
      "removeLine",
      "clear",
      "assertBalance",
      "assertPostable",
    ],
  },
});
