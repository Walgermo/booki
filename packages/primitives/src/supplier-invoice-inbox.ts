import { minorDigitsFor, parseToMinor } from "@booki/core/money";
import { BookiError } from "@booki/core/msg";
import {
  approveSupplierInvoice,
  assertApprovable,
  confirmField,
  correctField,
  duplicatesOf,
  fieldsNeedingReview,
  proposeCoding,
  redactSupplierInvoice,
  rejectSupplierInvoice,
  supplierInvoiceIssues,
  type BookedSupplierInvoice,
  type RedactedSupplierInvoice,
  type SupplierInvoice,
  type SupplierInvoiceCoding,
  type SupplierInvoiceContext,
  type SupplierInvoiceField,
} from "@booki/core/supplier-invoice";
import { matchingRows, normalizeQuery, tableView, type TableColumn, type TableQuery } from "@booki/core/table";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { refuseDenied } from "./access.js";
import { freshQuery, queryMethods, queryOptionKinds, type QueryOptions, type TablePaging } from "./table-query.js";
import { QUERY_FORMAT, commitSecret } from "./fields.js";

/** How to code an invoice and correct a field, shown in the snapshot. Amount fields are minor units. */
export const CODING_FORMAT =
  'proposeCoding(invoiceId, "6800", "1", { department: "200" }); correctField(invoiceId, "netMinor", 125000)';

export type Options = QueryOptions & {
  invoices?: SupplierInvoice[];
  defaultInvoices?: SupplierInvoice[];
  /** Invoices already in the ledger: a second copy is flagged. */
  booked?: BookedSupplierInvoice[];
  /** Account numbers that may be coded on. Any account is accepted when left out. */
  chart?: string[];
  /** A field read with less confidence than this must be confirmed or corrected. Defaults to 0.8. */
  threshold?: number;
  /** Id of the person at the keyboard. */
  actor?: string;
  /** Person's methods their role does not allow, with the reason. Filled by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  /** Recorded on fields an agent confirms or corrects. Defaults to "agent". */
  agentActor?: string;
  /** The company's rule for approving without a person: true, or a sentence saying why not. */
  rule?: (invoice: SupplierInvoice) => boolean | string;
  /** The rule's name in the record: approved by `rule:<ruleName>`. */
  ruleName?: string;
  /** Locale a person's typed amounts are read in, e.g. "nb-NO". */
  locale?: string;
  /** Invoices a person sees per page. Defaults to 100. */
  pageSize?: number;
  onInvoicesChange?: (
    invoices: SupplierInvoice[],
    details: { reason: string; source?: string; cancel?: () => void },
  ) => void;
};

/** What an agent sees of an invoice: no payment reference, no bank account. */
export type SupplierInvoiceSummary = RedactedSupplierInvoice & {
  /** Fields that still must be confirmed or corrected. */
  needsReview: SupplierInvoiceField[];
  /** Ids of other invoices with the same supplier and invoice number. */
  duplicateOf: string[];
  /** Everything that stops approval, as sentences. */
  issues: string[];
  approvable: boolean;
};

export const AMOUNTS: readonly string[] = ["netMinor", "taxMinor", "grossMinor"];
export const SECRET_FIELD: SupplierInvoiceField = "paymentReference";

export const DEFAULT_PAGE_SIZE = 100;

/**
 * The invoice list's columns: what sort, search, filters and CSV read. No
 * payment reference and no bank account, so a search cannot find one either.
 * Gross is summed per currency, not across them.
 */
export const invoiceColumns: TableColumn<SupplierInvoice>[] = [
  { id: "supplierName", header: "Supplier", value: (invoice) => invoice.fields.supplierName.value },
  { id: "invoiceNumber", header: "Invoice no.", value: (invoice) => invoice.fields.invoiceNumber.value },
  { id: "dueDate", header: "Due", kind: "date", value: (invoice) => invoice.fields.dueDate.value },
  {
    id: "grossMinor",
    header: "Gross",
    kind: "money",
    filterable: false,
    total: false,
    value: (invoice) => invoice.fields.grossMinor.value,
  },
  { id: "currency", header: "Currency", value: (invoice) => invoice.fields.currency.value },
  { id: "status", header: "Status", value: (invoice) => invoice.status },
];

/** Gross over every matching invoice, per currency. */
export type InvoiceTotals = { grossMinor: Record<string, number> };

export const wholeAbove = (value: number | undefined, fallback: number) =>
  Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : fallback;

/** The list's page, counts and totals for a query. A query that does not fit the columns shows the list fresh. */
export function deriveList(invoices: SupplierInvoice[], query: TableQuery) {
  let fitted = query;
  try {
    normalizeQuery(invoiceColumns, query);
  } catch {
    fitted = freshQuery(invoiceColumns, query.pageSize);
  }
  const shown = tableView(invoices, invoiceColumns, fitted);
  const grossMinor: Record<string, number> = {};
  for (const invoice of matchingRows(invoices, invoiceColumns, fitted)) {
    const minor = invoice.fields.grossMinor.value;
    if (!Number.isSafeInteger(minor)) continue;
    const currency = String(invoice.fields.currency.value ?? "");
    grossMinor[currency] = (grossMinor[currency] ?? 0) + minor;
  }
  return {
    // The page as plain records: what the agent reads of the list.
    rows: shown.rows.map((invoice) => {
      const record: Record<string, unknown> = { id: invoice.id };
      for (const column of invoiceColumns) record[column.id] = column.value(invoice) ?? null;
      return record;
    }),
    view: { total: shown.total, matching: shown.matching, page: shown.page, pageCount: shown.pageCount } as TablePaging,
    totals: { grossMinor } as InvoiceTotals,
    // For the composed inbox's own render; not part of the agent's snapshot.
    pageIds: shown.rows.map((invoice) => invoice.id),
  };
}

export function contextOf(options: Options, invoices: SupplierInvoice[]): SupplierInvoiceContext {
  return { inbox: invoices, booked: options.booked, threshold: options.threshold, chart: options.chart };
}

export function derive(invoices: SupplierInvoice[], options: Options) {
  const context = contextOf(options, invoices);
  const inbox = invoices.map((invoice): SupplierInvoiceSummary => {
    const open = invoice.status === "new" || invoice.status === "coded";
    const issues = open ? supplierInvoiceIssues(invoice, context) : [];
    return {
      ...redactSupplierInvoice(invoice),
      needsReview: open ? fieldsNeedingReview(invoice, options.threshold) : [],
      duplicateOf: duplicatesOf(invoice, context),
      issues,
      approvable: open && issues.length === 0,
    };
  });
  return { inbox, approvable: inbox.filter((item) => item.approvable).map((item) => item.id) };
}

/** "invoiceId|field" → both halves. Ids may hold a "|"; field names never do. */
export function splitCell(cell: string): [string, string] {
  const at = cell.lastIndexOf("|");
  return at < 0 ? [cell, ""] : [cell.slice(0, at), cell.slice(at + 1)];
}

/**
 * The inbox of supplier invoices read from documents. An agent sees every
 * field but the payment reference and the bank account, may correct or confirm
 * a field, propose the coding and ask `assertApprovable`. Approving for
 * posting and rejecting are a person's buttons, not agent actions. An approved
 * invoice refuses every edit. The list sorts, searches, filters (by status,
 * say) and pages like a DataTable: `query`, `view`, the page as `rows` and
 * `totals` (gross per currency over every match) are in the snapshot, and
 * `inbox` still holds every invoice.
 */
export const supplierInvoiceInbox = definePrimitive({
  name: "supplier-invoice-inbox",
  options: {
    invoices: "value",
    defaultInvoices: "value",
    booked: "value",
    chart: "value",
    threshold: "number",
    actor: "string",
    denied: "value",
    agentActor: "string",
    /**
     * The company's rule for approving without a person: `(invoice) => true`,
     * or a sentence saying why not. Code the ERP owns, never the agent. Without
     * it, approveUnderRule is refused.
     */
    rule: "action",
    /** The rule's name in the record: approved by `rule:<ruleName>`. */
    ruleName: "string",
    locale: "string",
    onInvoicesChange: "callback",
    pageSize: "number",
    ...queryOptionKinds,
  },
  // `invoices` itself is left out: it carries payment references and bank accounts.
  controlled: ["inbox", "approvable", "query", "view", "rows", "totals", "queryFormat", "codingFormat"],
  state: (options: Options) => {
    const invoices = options.invoices ?? options.defaultInvoices ?? [];
    const query =
      options.query ??
      freshQuery(invoiceColumns, wholeAbove(options.pageSize, DEFAULT_PAGE_SIZE), options.defaultQuery);
    return {
      invoices,
      selected: invoices[0]?.id ?? "",
      locale: options.locale ?? "en-US",
      refusal: "",
      queryFormat: QUERY_FORMAT,
      codingFormat: CODING_FORMAT,
      drafts: {} as Record<string, string>,
      query,
      ...derive(invoices, options),
      ...deriveList(invoices, query),
    };
  },
  sync: (options: Options) => ({
    ...(options.invoices === undefined ? {} : { invoices: options.invoices, ...derive(options.invoices, options) }),
    ...(options.query === undefined ? {} : { query: options.query }),
  }),
  api: (context) => {
    const change = createChange(context);
    const pick = ({ booked, chart, threshold }: Options) => ({ booked, chart, threshold });
    let seen = pick(context.options());
    context.onOptions(() => {
      const options = context.options();
      if (options.locale && options.locale !== context.store.get().locale)
        context.store.set({ locale: options.locale });
      // New booked invoices, chart or threshold change the issues of what is in the inbox.
      if (options.booked !== seen.booked || options.chart !== seen.chart || options.threshold !== seen.threshold) {
        context.store.set(derive(context.store.get().invoices, options));
      }
      seen = pick(options);
      const state = context.store.get();
      const invoices = options.invoices ?? state.invoices;
      const query = options.query ?? state.query;
      context.store.set({ query, ...deriveList(invoices, query) });
    });
    const commit = (next: SupplierInvoice[], reason: string, event?: Event) => {
      // The bridge hears the invoices without bank account or payment reference; the owner hears all of it.
      const ok = commitSecret(context as never, change as never, "invoices", next, next.map(redactSupplierInvoice), {
        reason,
        event,
      });
      if (ok && context.options().invoices === undefined) {
        context.store.set({
          refusal: "",
          ...derive(next, context.options()),
          ...deriveList(next, context.store.get().query),
        });
      } else if (ok) context.store.set({ refusal: "" });
      return ok;
    };
    const table = queryMethods({
      columns: () => invoiceColumns as TableColumn<never>[],
      query: () => context.store.get().query,
      pageCount: () => context.store.get().view.pageCount,
      apply: (next, reason, event) => {
        // Throws on a bad query, before anything changes.
        normalizeQuery(invoiceColumns, next);
        const ok = change("query", next, { reason, event });
        if (ok) context.store.set(deriveList(context.store.get().invoices, context.store.get().query));
        return ok;
      },
      refuse: (message) => {
        if (context.store.get().refusal !== message) context.store.set({ refusal: message });
      },
    });
    const shown = <T>(run: () => T): T => {
      try {
        return run();
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };
    /** A person's button their role does not allow is refused before it runs. */
    const gated = <T>(method: string, run: () => T): T =>
      shown(() => {
        refuseDenied(context.options(), method);
        return run();
      });
    const find = (id: string) => {
      const invoices = context.store.get().invoices;
      const invoice = invoices.find((item) => item.id === String(id));
      if (!invoice) {
        throw new BookiError("supplier-invoice.no-invoice", {
          id: String(id),
          ids: invoices.map((item) => item.id).join(", ") || "none",
        });
      }
      return invoice;
    };
    const put = (next: SupplierInvoice, reason: string, event?: Event) =>
      commit(
        context.store.get().invoices.map((item) => (item.id === next.id ? next : item)),
        reason,
        event,
      );
    const person = () => {
      const actor = String(context.options().actor ?? "").trim();
      if (actor === "") throw new Error("Nobody is signed in. Pass `actor` with the person's id.");
      return actor;
    };
    const agent = () => context.options().agentActor ?? "agent";
    const notSecret = (field: string) => {
      if (field === SECRET_FIELD) {
        throw new Error(
          "The payment reference is hidden from agents, so an agent cannot confirm or correct it. A person must.",
        );
      }
    };
    const code = (id: string, coding: SupplierInvoiceCoding, event?: Event) =>
      put(proposeCoding(find(id), coding, context.options().chart), "propose-coding", event);

    return {
      ...table,
      /** Agent: replace a value read from the document. Not the payment reference. */
      correctField: (invoiceId: string, field: SupplierInvoiceField, value: string | number) => {
        notSecret(field);
        return put(correctField(find(invoiceId), field, value, agent()), "correct-field");
      },
      /** Agent: say a value read with low confidence is right. Not the payment reference. */
      confirmField: (invoiceId: string, field: SupplierInvoiceField) => {
        notSecret(field);
        return put(confirmField(find(invoiceId), field, agent()), "confirm-field");
      },
      /** Agent: set the account, VAT code and dimensions. A new invoice becomes coded. */
      proposeCoding: (invoiceId: string, account: string, vatCode?: string, dimensions?: Record<string, string>) =>
        code(invoiceId, { account, vatCode, dimensions }),
      /**
       * Agent: approve under the company's rule. The rule (the `rule` option,
       * the ERP's code) decides, not the agent; the record names the rule as
       * the approver. Without a rule, or when it says no, it is refused.
       */
      approveUnderRule: (invoiceId: string) => {
        const options = context.options();
        const rule = options.rule;
        if (typeof rule !== "function") throw new BookiError("supplier-invoice.no-rule", { id: String(invoiceId) });
        const invoice = find(invoiceId);
        const ctx = contextOf(options, context.store.get().invoices);
        assertApprovable(invoice, ctx);
        const verdict = rule(invoice);
        if (verdict !== true) {
          throw new BookiError("supplier-invoice.rule-says-no", {
            id: invoice.id,
            reason: typeof verdict === "string" ? verdict : "",
          });
        }
        const by = `rule:${String(options.ruleName ?? "company")}`;
        return put(approveSupplierInvoice(invoice, by, new Date().toISOString(), ctx), "approve-under-rule");
      },
      /**
       * Agent: propose rejecting an invoice, with the reason a person will read.
       * Nothing is rejected: the reason waits in the invoice for the person.
       */
      proposeRejection: (invoiceId: string, reason: string) => {
        const invoice = find(invoiceId);
        if (invoice.status !== "new" && invoice.status !== "coded") {
          throw new BookiError("supplier-invoice.not-open", { id: invoice.id, status: invoice.status });
        }
        const text = String(reason ?? "").trim();
        if (!text) throw new BookiError("supplier-invoice.reason-needed", { id: invoice.id });
        return put(
          { ...invoice, proposedRejection: { reason: text, by: agent(), at: new Date().toISOString() } },
          "propose-rejection",
        );
      },
      /** Agent: throws with everything that still stops the invoice from being approved. */
      assertApprovable: (invoiceId: string) => {
        const invoice = find(invoiceId);
        assertApprovable(invoice, contextOf(context.options(), context.store.get().invoices));
        return { approvable: true };
      },
      // Everything below is for a person using the composed inbox. It is not
      // in `agent.actions`, so the bridge refuses a step that names it.
      select: (invoiceId: string) => {
        context.store.set({ selected: String(invoiceId), refusal: "" });
      },
      confirmByPerson: (cell: string, event?: Event) =>
        shown(() => {
          const [id, field] = splitCell(cell);
          return put(confirmField(find(id), field as SupplierInvoiceField, person()), "confirm-field", event);
        }),
      pickAccount: (invoiceId: string, account: string, event?: Event) =>
        shown(() => code(invoiceId, { ...find(invoiceId).coding, account }, event)),
      /** Hold what is being typed in a cell until blur or Enter. */
      setDraft: (cell: string, text: string) => {
        const status = context.store.get().invoices.find((item) => item.id === splitCell(cell)[0])?.status;
        if (status !== "new" && status !== "coded") return;
        context.store.set({ drafts: { ...context.store.get().drafts, [cell]: text } });
      },
      /** Commit a typed cell. Refused text is dropped and the cell shows the invoice again. */
      commitDraft: (cell: string, event?: Event) => {
        const { drafts } = context.store.get();
        const [id, field] = splitCell(cell);
        // The reason for a rejection stays a draft until Reject is pressed.
        if (!(cell in drafts) || field === "reason") return false;
        const { [cell]: text = "", ...rest } = drafts;
        context.store.set({ drafts: rest });
        return shown(() => {
          const invoice = find(id);
          if (field === "account") {
            if (text.trim() === (invoice.coding?.account ?? "")) return false;
            return code(id, { ...invoice.coding, account: text }, event);
          }
          if (field === "vatCode") {
            if (text.trim() === (invoice.coding?.vatCode ?? "")) return false;
            if (!invoice.coding) throw new Error(`Invoice "${id}": set the account before the VAT code.`);
            return code(id, { ...invoice.coding, vatCode: text }, event);
          }
          const key = field as SupplierInvoiceField;
          let value: string | number = text.trim();
          if (AMOUNTS.includes(field)) {
            const minor = parseToMinor(text, invoice.fields.currency.value, { locale: context.store.get().locale });
            if (minor === null) throw new Error(`"${text}" is not an amount.`);
            value = minor;
          }
          if (invoice.fields[key]?.value === value) return false;
          return put(correctField(invoice, key, value, person()), "correct-field", event);
        });
      },
      /** Person only. Approves the invoice for posting; after this it refuses edits. */
      approve: (invoiceId: string, event?: Event) =>
        gated("approve", () =>
          put(
            approveSupplierInvoice(
              find(invoiceId),
              person(),
              new Date().toISOString(),
              contextOf(context.options(), context.store.get().invoices),
            ),
            "approve-invoice",
            event,
          ),
        ),
      /** Person only. The reason is what the reason cell shows: typed, or the agent's proposal left as it was. */
      reject: (invoiceId: string, event?: Event) =>
        gated("reject", () => {
          const cell = `${String(invoiceId)}|reason`;
          const { [cell]: typed, ...rest } = context.store.get().drafts;
          const invoice = find(invoiceId);
          // What the field shows: the person's text, or the agent's proposed reason they left as it was.
          const reason = typed ?? invoice.proposedRejection?.reason ?? "";
          const next = rejectSupplierInvoice(invoice, person(), reason, new Date().toISOString());
          const ok = put(next, "reject-invoice", event);
          if (ok) context.store.set({ drafts: rest });
          return ok;
        }),
    };
  },
  slots: (slot) => {
    type CellState = { invoices: SupplierInvoice[]; locale: string; drafts: Record<string, string> };
    const read = (state: CellState, cell: string) => {
      if (cell in state.drafts) return state.drafts[cell] ?? "";
      const [id, field] = splitCell(cell);
      const invoice = state.invoices.find((item) => item.id === id);
      if (!invoice) return "";
      if (field === "account") return invoice.coding?.account ?? "";
      if (field === "vatCode") return invoice.coding?.vatCode ?? "";
      // An agent's proposed rejection fills the reason the person reads before pressing Reject.
      if (field === "reason") return invoice.proposedRejection?.reason ?? "";
      const entry = invoice.fields[field as SupplierInvoiceField];
      if (!entry) return "";
      if (!AMOUNTS.includes(field)) return String(entry.value);
      const digits = minorDigitsFor(invoice.fields.currency.value);
      return new Intl.NumberFormat(state.locale, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(Number(entry.value) / 10 ** digits);
    };
    const closed = (state: CellState, id: string) => {
      const status = state.invoices.find((item) => item.id === id)?.status;
      return status !== "new" && status !== "coded";
    };
    return {
      root: slot({
        role: "group",
        state: (state) => ({
          invoices: state.invoices,
          inbox: state.inbox,
          selected: state.selected,
          refusal: state.refusal,
          query: state.query,
          view: state.view,
          totals: state.totals,
          pageIds: state.pageIds,
        }),
      }),
      search: slot({
        attrs: (state) => ({ type: "search", value: state.query.search, autoComplete: "off" }),
        on: {
          input: (event, { api }) => {
            try {
              api.searchByPerson((event.target as HTMLInputElement).value, event);
            } catch {
              /* shown in the control */
            }
          },
        },
      }),
      // Show one status only, as a select: "" for every status. (`status` is the count's data-slot.)
      statusfilter: slot({
        attrs: (state) => ({ value: state.query.filters.status ?? "" }),
        on: {
          input: (event, { api }) => {
            try {
              api.filterByPerson("status", (event.target as HTMLSelectElement).value, event);
            } catch {
              /* shown in the control */
            }
          },
        },
      }),
      // The sort button in a header cell. `value` is the column id.
      sort: slot<{ value: string }>({
        props: { value: "string" },
        attrs: (state, part) => ({
          type: "button",
          "data-sorted": state.query.sort?.column === part.key ? state.query.sort.direction : undefined,
        }),
        press: ({ api, key }, event) => {
          try {
            api.sortByPerson(String(key), event);
          } catch {
            /* shown in the control */
          }
        },
      }),
      prev: slot({
        attrs: (state) => ({
          type: "button",
          "data-variant": "secondary",
          disabled: state.view.page <= 1 ? "" : undefined,
        }),
        press: ({ api, store }, event) => {
          try {
            api.pageByPerson(store.get().view.page - 1, event);
          } catch {
            /* shown in the control */
          }
        },
      }),
      next: slot({
        attrs: (state) => ({
          type: "button",
          "data-variant": "secondary",
          disabled: state.view.page >= state.view.pageCount ? "" : undefined,
        }),
        press: ({ api, store }, event) => {
          try {
            api.pageByPerson(store.get().view.page + 1, event);
          } catch {
            /* shown in the control */
          }
        },
      }),
      // Opens one invoice in the detail pane. `value` is the invoice id.
      select: slot<{ value: string }>({
        props: { value: "string" },
        attrs: (state, part) => ({
          type: "button",
          "data-variant": "secondary",
          "aria-pressed": state.selected === String(part.key) ? "true" : "false",
        }),
        press: ({ api, key }) => api.select(String(key)),
      }),
      // One text cell per invoice and field. `value` is "invoiceId|field" and is the part's key.
      cell: slot<{ value: string }>({
        props: { value: "string" },
        attrs: (state, part) => ({
          type: "text",
          autoComplete: "off",
          value: read(state, String(part.key)),
          // Read-only, not disabled: ui-sdk treats a component whose fields are
          // all disabled as switched off, and the other invoices must stay open.
          // `setDraft` ignores typing in a closed invoice, so the text cannot change.
          "aria-readonly": closed(state, splitCell(String(part.key))[0]) ? "true" : undefined,
        }),
        on: {
          // "input" is the adapter's name for React's onChange.
          input: (event, { api, key }) => {
            api.setDraft(String(key), (event.target as HTMLInputElement).value);
          },
          blur: (event, { api, key }) => {
            try {
              api.commitDraft(String(key), event);
            } catch {
              /* shown in the control */
            }
          },
          keydown: (event, { api, key }) => {
            if ((event as KeyboardEvent).key !== "Enter") return;
            event.preventDefault();
            try {
              api.commitDraft(String(key), event);
            } catch {
              /* shown in the control */
            }
          },
        },
      }),
      // The coding account as a list, used when a chart is given. `value` is the invoice id.
      account: slot<{ value: string }>({
        props: { value: "string" },
        attrs: (state, part) => ({
          value: state.invoices.find((item) => item.id === String(part.key))?.coding?.account ?? "",
        }),
        on: {
          input: (event, { api, key }) => {
            try {
              api.pickAccount(String(key), (event.target as HTMLSelectElement).value, event);
            } catch {
              /* shown in the control */
            }
          },
        },
      }),
      // `value` is "invoiceId|field".
      confirm: slot<{ value: string }>({
        props: { value: "string" },
        attrs: () => ({ type: "button", "data-variant": "secondary" }),
        press: ({ api, key }, event) => {
          try {
            api.confirmByPerson(String(key), event);
          } catch {
            /* shown in the control */
          }
        },
      }),
      approve: slot<{ value: string }>({
        props: { value: "string" },
        attrs: () => ({ type: "button" }),
        press: ({ api, key }, event) => {
          try {
            api.approve(String(key), event);
          } catch {
            /* shown in the control */
          }
        },
      }),
      reject: slot<{ value: string }>({
        props: { value: "string" },
        attrs: () => ({ type: "button", "data-variant": "secondary" }),
        press: ({ api, key }, event) => {
          try {
            api.reject(String(key), event);
          } catch {
            /* shown in the control */
          }
        },
      }),
    };
  },
  agent: {
    actions: [
      "correctField",
      "confirmField",
      "proposeCoding",
      "assertApprovable",
      "setSort",
      "clearSort",
      "setSearch",
      "setFilter",
      "clearFilters",
      "setPage",
      "setPageSize",
      "approveUnderRule",
      "proposeRejection",
    ],
  },
});
