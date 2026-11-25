import { textOf } from "./fields.js";
import {
  finalizeInvoice,
  invoiceIssues,
  invoiceLineFields,
  invoiceTotals,
  validateInvoiceLine,
  type Invoice,
  type InvoiceLine,
  type InvoiceTotals,
  type TaxCategory,
} from "@booki-aui/core/invoice";
import { BookiError } from "@booki-aui/core/msg";
import { parseToMinor } from "@booki-aui/core/money";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { refuseDenied } from "./access.js";

export type Options = {
  invoice?: Invoice;
  defaultInvoice?: Invoice;
  /** The rest of the ledger: needed for number reuse and credit-note limits. */
  others?: Invoice[];
  /** The number the invoice gets when a person finalizes it. */
  nextNumber?: string;
  /** A person's methods their role does not allow, each with the reason. Set by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  /** Locale a person's typed amounts are read in, e.g. "nb-NO". */
  locale?: string;
  onInvoiceChange?: (invoice: Invoice, details: { reason: string; source?: string; cancel?: () => void }) => void;
};

export const EMPTY: Invoice = { id: "", kind: "invoice", status: "draft", currency: "", lines: [] };

export type InvoiceLinePatch = Partial<Omit<InvoiceLine, "id">>;

export function safeTotals(lines: InvoiceLine[]): InvoiceTotals {
  try {
    return invoiceTotals(lines);
  } catch {
    return { netMinor: 0, taxMinor: 0, grossMinor: 0, groups: [] };
  }
}

export function derive(invoice: Invoice, others: Invoice[]) {
  const issues = invoiceIssues(invoice, others);
  return {
    totals: safeTotals(invoice.lines),
    issues,
    finalizable: invoice.status === "draft" && issues.length === 0,
  };
}

export function nextLineId(lines: InvoiceLine[]): string {
  const used = lines
    .map((line) => /^l(\d+)$/.exec(line.id)?.[1])
    .filter(Boolean)
    .map(Number);
  return `l${Math.max(0, ...used) + 1}`;
}

/**
 * A sales invoice or credit note an agent can draft. Totals are computed from
 * the lines and never typed. An agent may add, change and remove lines and set
 * the customer's VAT number while the document is a draft, and ask
 * `assertFinalizable`. Finalizing gives it a number and fixes it: that is a
 * person's button, not an agent action. A fixed invoice refuses every edit.
 */
/** How to write a line, shown in the snapshot. Money in minor units, unit price before VAT; quantity and rates as people say them. */
export const LINE_FORMAT =
  'addLine({ description: "Kursdag", quantity: 2.5, unitPriceMinor: 98000, taxRate: 25 }); price ex VAT; also taxCategory, discountPercent';

export const invoiceEditor = definePrimitive({
  name: "invoice-editor",
  options: {
    invoice: "value",
    defaultInvoice: "value",
    others: "value",
    nextNumber: "string",
    locale: "string",
    denied: "value",
    onInvoiceChange: "callback",
  },
  controlled: ["invoice", "totals", "issues", "finalizable", "lineFormat"],
  state: (options: Options) => {
    const invoice = options.invoice ?? options.defaultInvoice ?? EMPTY;
    return {
      invoice,
      locale: options.locale ?? "en-US",
      refusal: "",
      drafts: {} as Record<string, string>,
      // Read before the first try, so an agent writes a line right the first time.
      lineFormat: LINE_FORMAT,
      ...derive(invoice, options.others ?? []),
    };
  },
  sync: (options: Options) =>
    options.invoice === undefined ? {} : { invoice: options.invoice, ...derive(options.invoice, options.others ?? []) },
  api: (context) => {
    const change = createChange(context);
    const others = () => context.options().others ?? [];
    context.onOptions(() => {
      const { locale } = context.options();
      if (locale && locale !== context.store.get().locale) context.store.set({ locale });
    });
    const commit = (next: Invoice, reason: string, event?: Event) => {
      const ok = change("invoice", next, { reason, event });
      if (ok) context.store.set({ refusal: "", ...derive(next, others()) });
      return ok;
    };
    const draft = () => {
      const invoice = context.store.get().invoice;
      if (invoice.status !== "draft") {
        throw new Error(
          `${invoice.kind === "credit-note" ? "Credit note" : "Invoice"} ${invoice.number ?? invoice.id} is ${invoice.status} and cannot be edited. Correct it with a credit note.`,
        );
      }
      return invoice;
    };
    const shown = <T>(run: () => T): T => {
      try {
        return run();
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };

    function addLine(
      description: string,
      quantityMilli: number,
      unitPriceMinor: number,
      taxCategory: TaxCategory = "S",
      taxRateBp = 0,
      discountBp = 0,
      event?: Event,
    ) {
      const invoice = draft();
      const line = validateInvoiceLine({
        id: nextLineId(invoice.lines),
        description: String(description ?? ""),
        quantityMilli,
        unitPriceMinor,
        taxCategory,
        taxRateBp,
        ...(discountBp ? { discountBp } : {}),
      });
      return commit({ ...invoice, lines: [...invoice.lines, line] }, "add-line", event);
    }

    function setLine(lineId: string, patch: InvoiceLinePatch, event?: Event) {
      const invoice = draft();
      const current = invoice.lines.find((line) => line.id === String(lineId));
      if (!current) {
        throw new BookiError("invoice.no-line", {
          id: String(lineId),
          lines: invoice.lines.map((line) => line.id).join(", ") || "none",
        });
      }
      if (typeof patch !== "object" || patch === null) {
        throw new Error("setLine takes a line id and an object of the fields to change.");
      }
      const next = validateInvoiceLine({ ...current, ...invoiceLineFields(patch, current.id), id: current.id });
      return commit(
        { ...invoice, lines: invoice.lines.map((line) => (line.id === current.id ? next : line)) },
        "set-line",
        event,
      );
    }

    function removeLine(lineId: string, event?: Event) {
      const invoice = draft();
      if (!invoice.lines.some((line) => line.id === String(lineId))) {
        throw new BookiError("invoice.no-line", {
          id: String(lineId),
          lines: invoice.lines.map((line) => line.id).join(", ") || "none",
        });
      }
      return commit(
        { ...invoice, lines: invoice.lines.filter((line) => line.id !== String(lineId)) },
        "remove-line",
        event,
      );
    }

    function setCustomerTaxId(value: string, event?: Event) {
      const invoice = draft();
      const text = String(value ?? "").trim();
      const { customerTaxId: _old, ...rest } = invoice;
      return commit(text ? { ...rest, customerTaxId: text } : rest, "set-customer-tax-id", event);
    }

    /** One line given as an object with the names people use (see invoiceLineFields). */
    function addLineFrom(input: unknown, event?: Event) {
      const invoice = draft();
      const id = nextLineId(invoice.lines);
      const fields = invoiceLineFields(input, id);
      const missing = (["quantityMilli", "unitPriceMinor"] as const).filter((key) => fields[key] === undefined);
      if (missing.length) {
        throw new BookiError("invoice.line-missing", {
          id,
          fields: missing.map((key) => (key === "quantityMilli" ? "quantity" : key)).join(", "),
        });
      }
      const line = validateInvoiceLine({
        description: "",
        taxCategory: "S",
        taxRateBp: 0,
        ...fields,
        id,
        quantityMilli: fields.quantityMilli as number,
        unitPriceMinor: fields.unitPriceMinor as number,
      } as InvoiceLine);
      return commit({ ...invoice, lines: [...invoice.lines, line] }, "add-line", event);
    }

    return {
      /**
       * Add a line: one object, `{ description, quantity, unitPriceMinor, taxRate }`
       * (also `quantityMilli`, `taxRateBp`, `taxCategory`, `discountPercent`), or the
       * positional form (description, quantityMilli, unitPriceMinor, taxCategory, taxRateBp, discountBp).
       */
      addLine: (
        description: string | Record<string, unknown>,
        quantityMilli?: number,
        unitPriceMinor?: number,
        taxCategory?: TaxCategory,
        taxRateBp?: number,
        discountBp?: number,
      ) =>
        typeof description === "object" && description !== null
          ? addLineFrom(description)
          : addLine(description, quantityMilli as number, unitPriceMinor as number, taxCategory, taxRateBp, discountBp),
      setLine: (lineId: string, patch: InvoiceLinePatch) => setLine(lineId, patch),
      removeLine: (lineId: string) => removeLine(lineId),
      setCustomerTaxId: (value: string) => setCustomerTaxId(textOf(value, "setCustomerTaxId")),
      /** Replace the lines of a draft (history and staging restore through this). */
      setInvoice: (next: Invoice) => {
        const invoice = draft();
        if (!next || !Array.isArray(next.lines)) throw new Error("setInvoice expects an invoice with lines.");
        // Status and number are never taken from the caller.
        const { customerTaxId: _old, ...rest } = invoice;
        return commit(
          {
            ...rest,
            lines: next.lines.map((line, i) => {
              const id = String((line as { id?: unknown }).id ?? `l${i + 1}`);
              return validateInvoiceLine({
                description: "",
                taxCategory: "S",
                taxRateBp: 0,
                ...invoiceLineFields(line, id),
                id,
              } as InvoiceLine);
            }),
            ...(next.customerTaxId ? { customerTaxId: next.customerTaxId } : {}),
          },
          "set-invoice",
        );
      },
      /** Agent: throws with everything that still stops the invoice from being finalized. */
      assertFinalizable: () => {
        const invoice = draft();
        const issues = invoiceIssues(invoice, others());
        if (issues.length > 0) throw new Error(`Not ready to finalize: ${issues.join(" ")}`);
        return invoiceTotals(invoice.lines);
      },
      // Everything below is for a person using the composed editor. It is not
      // in `agent.actions`, so the bridge refuses a step that names it.
      addLineByPerson: (event?: Event) => shown(() => addLine("", 1000, 0, "S", 2500, 0, event)),
      removeLineByPerson: (lineId: string, event?: Event) => shown(() => removeLine(lineId, event)),
      pickTax: (lineId: string, value: string, event?: Event) =>
        shown(() => {
          const [category = "S", rate = "0"] = value.split(":");
          return setLine(lineId, { taxCategory: category as TaxCategory, taxRateBp: Number(rate) }, event);
        }),
      /** Hold what is being typed in a cell until blur or Enter. */
      setDraft: (cell: string, text: string) => {
        context.store.set({ drafts: { ...context.store.get().drafts, [cell]: text } });
      },
      /** Commit a typed cell. Refused text is dropped and the cell shows the invoice again. */
      commitDraft: (cell: string, event?: Event) => {
        const { drafts } = context.store.get();
        if (!(cell in drafts)) return false;
        const { [cell]: text = "", ...rest } = drafts;
        context.store.set({ drafts: rest });
        const [lineId = "", field = ""] = cell.split("|");
        return shown(() => {
          if (field === "taxId") return setCustomerTaxId(text, event);
          if (field === "description") return setLine(lineId, { description: text }, event);
          if (field === "unitPrice") {
            const invoice = context.store.get().invoice;
            const minor = parseToMinor(text, invoice.currency as Parameters<typeof parseToMinor>[1], {
              locale: context.options().locale,
            });
            if (minor === null || minor < 0) throw new Error(`"${text}" is not an amount.`);
            return setLine(lineId, { unitPriceMinor: minor }, event);
          }
          const n = Number(text.trim().replace(",", "."));
          if (text.trim() === "" || !Number.isFinite(n) || n < 0) throw new Error(`"${text}" is not a number.`);
          return field === "quantity"
            ? setLine(lineId, { quantityMilli: Math.round(n * 1000) }, event)
            : setLine(lineId, { discountBp: Math.round(n * 100) }, event);
        });
      },
      /** Person only. Fixes the invoice under `nextNumber`. */
      finalize: (event?: Event) =>
        shown(() => {
          refuseDenied(context.options(), "finalize");
          const number = String(context.options().nextNumber ?? "").trim();
          if (number === "") throw new Error("Pass `nextNumber`: a finalized invoice needs a number.");
          return commit(finalizeInvoice(draft(), number, others()), "finalize", event);
        }),
    };
  },
  slots: (slot) => {
    const read = (state: { invoice: Invoice; locale: string; drafts: Record<string, string> }, cell: string) => {
      if (cell in state.drafts) return state.drafts[cell] ?? "";
      const [lineId, field] = cell.split("|");
      if (field === "taxId") return state.invoice.customerTaxId ?? "";
      const line = state.invoice.lines.find((item) => item.id === lineId);
      if (!line) return "";
      if (field === "description") return line.description;
      if (field === "quantity") return String(line.quantityMilli / 1000);
      if (field === "discount") return String((line.discountBp ?? 0) / 100);
      return new Intl.NumberFormat(state.locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(line.unitPriceMinor / 100);
    };
    return {
      root: slot({
        role: "group",
        attrs: (state) => ({ "data-status": state.invoice.status }),
        state: (state) => ({
          invoice: state.invoice,
          totals: state.totals,
          issues: state.issues,
          finalizable: state.finalizable,
          refusal: state.refusal,
        }),
      }),
      // One text cell per line and field. `value` is "lineId|field" and is the part's key.
      cell: slot<{ value: string }>({
        props: { value: "string" },
        attrs: (state, part) => ({
          type: "text",
          autoComplete: "off",
          value: read(state, String(part.key)),
          disabled: state.invoice.status !== "draft" ? "" : undefined,
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
      tax: slot<{ value: string }>({
        props: { value: "string" },
        attrs: (state, part) => {
          const line = state.invoice.lines.find((item) => item.id === String(part.key));
          return {
            value: line ? `${line.taxCategory}:${line.taxRateBp}` : "",
            disabled: state.invoice.status !== "draft" ? "" : undefined,
          };
        },
        on: {
          input: (event, { api, key }) => {
            try {
              api.pickTax(String(key), (event.target as HTMLSelectElement).value, event);
            } catch {
              /* shown in the control */
            }
          },
        },
      }),
      add: slot({
        attrs: () => ({ type: "button", "data-variant": "secondary" }),
        press: ({ api }, event) => {
          try {
            api.addLineByPerson(event);
          } catch {
            /* shown in the control */
          }
        },
      }),
      remove: slot<{ value: string }>({
        props: { value: "string" },
        attrs: () => ({ type: "button", "data-variant": "secondary" }),
        press: ({ api, key }, event) => {
          try {
            api.removeLineByPerson(String(key), event);
          } catch {
            /* shown in the control */
          }
        },
      }),
      finalize: slot({
        attrs: () => ({ type: "button" }),
        press: ({ api }, event) => {
          try {
            api.finalize(event);
          } catch {
            /* shown in the control */
          }
        },
      }),
    };
  },
  agent: {
    actions: ["addLine", "setLine", "removeLine", "setCustomerTaxId", "setInvoice", "assertFinalizable"],
  },
});
