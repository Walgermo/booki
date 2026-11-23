// Tool definitions for the in-process bookkeeping API. A model given these
// tools could do the same tasks as the screen runs, without a screen. Nothing
// here calls a model: createApiToolSet returns plain data and a plain runner.
//
// The descriptions give the units and the rules, never an answer. The task
// values (accounts, amounts, numbers) come from the task text the model reads
// and from the list_* tools, not from these descriptions.

import type Anthropic from "@anthropic-ai/sdk";
import type { ToolOutcome } from "../tools.js";
import {
  ApiError,
  type BookkeepingApi,
  type SalesInvoiceInput,
  type SupplierInvoiceInput,
  type VoucherInput,
} from "./ledger.js";

type InputSchema = Anthropic.Tool["input_schema"];

type ToolSpec = {
  name: string;
  description: string;
  input_schema: InputSchema;
  call: (api: BookkeepingApi, actor: string | undefined, input: Record<string, unknown>) => unknown;
};

export type ApiToolSet = {
  tools: Anthropic.Tool[];
  run: (name: string, input: unknown) => ToolOutcome;
};

const text = (description: string) => ({ type: "string", description });
const integer = (description: string) => ({ type: "integer", description });
const ISO_DATE = "An ISO date, yyyy-mm-dd.";
const ORE = "Integer øre (100 øre is 1,00 kroner). 250 000 means 2 500,00 kroner.";

const NO_FIELDS: InputSchema = { type: "object", properties: {}, required: [], additionalProperties: false };

const voucherLine = {
  type: "object",
  description: "One line of the voucher. Give exactly one of debitMinor or creditMinor above 0.",
  properties: {
    account: text("An account number from list_accounts."),
    debitMinor: integer(`Debit. ${ORE} Use 0 on a credit line.`),
    creditMinor: integer(`Credit. ${ORE} Use 0 on a debit line.`),
    vatCode: text("Optional. A code from list_vat_codes."),
  },
  required: ["account", "debitMinor", "creditMinor"],
  additionalProperties: false,
};

const salesLine = {
  type: "object",
  description: "One invoice line.",
  properties: {
    description: text("What is sold, as it should read on the invoice."),
    quantityMilli: integer("Quantity in thousandths: 3,5 is 3500, and 1 is 1000. Must be above 0."),
    unitPriceMinor: integer(`Price per unit, excluding VAT. ${ORE}`),
    vatCode: text("A code from list_vat_codes."),
  },
  required: ["description", "quantityMilli", "unitPriceMinor", "vatCode"],
  additionalProperties: false,
};

const catalogue: ToolSpec[] = [
  {
    name: "list_suppliers",
    description: "List the suppliers a supplier invoice can be registered against: number and name. Read only.",
    input_schema: NO_FIELDS,
    call: (api) => api.listSuppliers(),
  },
  {
    name: "list_customers",
    description: "List the customers a sales invoice can be made out to: number and name. Read only.",
    input_schema: NO_FIELDS,
    call: (api) => api.listCustomers(),
  },
  {
    name: "list_accounts",
    description: "List the chart of accounts: number and name for each account. Read only.",
    input_schema: NO_FIELDS,
    call: (api) => api.listAccounts(),
  },
  {
    name: "list_vat_codes",
    description: "List the VAT codes with the percentage each one stands for. Read only.",
    input_schema: NO_FIELDS,
    call: (api) => api.listVatCodes(),
  },
  {
    name: "get_state",
    description:
      "Read everything registered so far in this session: vouchers, supplier invoices, sales invoices and the audit trail. Amounts are integer øre. Read only.",
    input_schema: NO_FIELDS,
    call: (api) => api.state(),
  },
  {
    name: "post_voucher",
    description:
      "Post a manual voucher. date is an ISO date (yyyy-mm-dd). Each line has exactly one of debitMinor or creditMinor above 0, in integer øre, and the debits must equal the credits in total. account is a number from list_accounts; vatCode, when given, is a code from list_vat_codes.",
    input_schema: {
      type: "object",
      properties: {
        date: text(ISO_DATE),
        lines: {
          type: "array",
          description: "The voucher lines, at least two.",
          items: voucherLine,
          minItems: 2,
        },
      },
      required: ["date", "lines"],
      additionalProperties: false,
    },
    call: (api, actor, input) => api.postVoucher(input as unknown as VoucherInput, actor),
  },
  {
    name: "register_supplier_invoice",
    description:
      "Register a supplier invoice. grossMinor is the total including VAT, in integer øre. supplier is a number from list_suppliers, account a number from list_accounts, and vatCode a code from list_vat_codes. invoiceDate and dueDate are ISO dates (yyyy-mm-dd), and dueDate may not be before invoiceDate. kid is the payment reference and must pass its check digit. An invoice number can be registered once per supplier.",
    input_schema: {
      type: "object",
      properties: {
        supplier: text("A number from list_suppliers."),
        invoiceNumber: text("The invoice number as printed on the supplier's invoice."),
        invoiceDate: text(ISO_DATE),
        dueDate: text(ISO_DATE),
        kid: text("The KID payment reference as printed on the invoice."),
        grossMinor: integer(`Total including VAT. ${ORE}`),
        account: text("An account number from list_accounts."),
        vatCode: text("A code from list_vat_codes."),
      },
      required: ["supplier", "invoiceNumber", "invoiceDate", "dueDate", "kid", "grossMinor", "account", "vatCode"],
      additionalProperties: false,
    },
    call: (api, actor, input) => api.registerSupplierInvoice(input as unknown as SupplierInvoiceInput, actor),
  },
  {
    name: "create_sales_invoice",
    description:
      "Create a sales invoice as a draft for a customer. customer is a number from list_customers. Each line gives quantityMilli in thousandths (3,5 is 3500), unitPriceMinor in integer øre per unit excluding VAT, and a vatCode from list_vat_codes. The invoice is created as a draft and is not sent.",
    input_schema: {
      type: "object",
      properties: {
        customer: text("A number from list_customers."),
        lines: {
          type: "array",
          description: "The invoice lines, at least one.",
          items: salesLine,
          minItems: 1,
        },
      },
      required: ["customer", "lines"],
      additionalProperties: false,
    },
    call: (api, actor, input) => api.createSalesInvoice(input as unknown as SalesInvoiceInput, actor),
  },
];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fieldsOf = (schema: InputSchema): string[] => Object.keys((schema.properties ?? {}) as Record<string, unknown>);

const refuse = (content: string): ToolOutcome => ({ content, isError: true });

/**
 * The tools and a runner for them, bound to one API instance. Calls are
 * refused in plain text when the input is wrong, and a bug (anything that is
 * not an ApiError) is thrown on, so it cannot pass as a refusal.
 *
 * actor is recorded on every write made through these tools. When it is left
 * out, the API's own default is used.
 */
export function createApiToolSet(api: BookkeepingApi, actor?: string): ApiToolSet {
  const names = catalogue.map((tool) => tool.name);

  return {
    tools: catalogue.map(({ name, description, input_schema }) => ({ name, description, input_schema })),
    run(name, input) {
      const tool = catalogue.find((candidate) => candidate.name === name);
      if (!tool) return refuse(`Unknown tool "${name}". Tools: ${names.join(", ")}`);

      if (!isPlainObject(input)) {
        const got = input === null ? "null" : Array.isArray(input) ? "a list" : typeof input;
        return refuse(`${name} takes an object as input, such as {}; got ${got}.`);
      }

      const valid = fieldsOf(tool.input_schema);
      for (const key of Object.keys(input)) {
        if (!valid.includes(key)) {
          return refuse(
            `Unknown field "${key}" in ${name}. Valid fields: ${valid.length > 0 ? valid.join(", ") : "none"}.`,
          );
        }
      }

      try {
        return { content: JSON.stringify(tool.call(api, actor, input)), isError: false };
      } catch (error) {
        if (error instanceof ApiError) return refuse(error.message);
        throw error;
      }
    },
  };
}
