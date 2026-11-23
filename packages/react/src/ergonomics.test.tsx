import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { localize } from "@booki/core/messages";
import { GENERIC_VAT_SCHEMA_EXAMPLE } from "@booki/core/vat-return";
import { mount } from "@ui-sdk/core/testing";
import { describe, expect, it } from "vitest";
import * as library from "./index.js";

/**
 * The agent ergonomics of every control, as `spec/agent-contract.md`
 * section 12 states them. Real-model runs showed each gap costs calls:
 *
 * 1. An object argument takes the names people use and refuses an unknown one.
 * 2. A refusal of an unknown field, column, account, code, row or option lists
 *    the ones that exist, in English and Norwegian.
 * 3. A number that could mean two things says which by its name (`…Minor`).
 * 4. An action that takes structured input has a short format hint in the
 *    snapshot, read before the first try.
 *
 * Every agent action of every control needs a probe below: a call with an
 * unknown argument and what its refusal must name, an object probe, or a
 * reason it takes nothing that can be unknown. A new control or action
 * without one fails here, like a removed one fails the contract test.
 */

type State = Record<string, unknown>;

type Probe =
  /** Refused, naming every one of `names` (or the names `names(state)` gives). */
  | { args: unknown[]; names: string[] | ((state: State) => string[]); format?: string }
  /** An object argument: `args(extra)` with an unknown field is refused, listing `fields`; `format` is its hint key. */
  | { object: (extra: Record<string, unknown>) => unknown[]; fields: string[]; format: string }
  /** Nothing the agent passes can be unknown; why. */
  | { none: string };

type Control = {
  options: Record<string, unknown>;
  /** Runs before the probes, e.g. to draw a sample so items exist. */
  prepare?: (api: Record<string, (...args: unknown[]) => unknown>) => void;
  probes: Record<string, Probe | Probe[]>;
};

const NOTHING = { none: "takes no argument" } as const;
const FREE_TEXT = { none: "free text; an empty string clears it" } as const;
const RESTORE = { none: "restores a value from history or staging; checked like the edits it restores" } as const;
const FREE_DIGITS = { none: "takes digits; the snapshot says isValid instead of refusing a partial number" } as const;

/** The table actions every list control shares through `@booki/core/table`. */
function tableProbes(column: string, pages = "1"): Record<string, Probe | Probe[]> {
  return {
    setSort: [
      { args: ["nope"], names: [column], format: "queryFormat" },
      { args: [column, "down"], names: ["asc", "desc"] },
    ],
    clearSort: NOTHING,
    setSearch: FREE_TEXT,
    setFilter: { args: ["nope", "x"], names: [column] },
    clearFilters: NOTHING,
    setPage: { args: [0], names: [pages], format: "queryFormat" },
    setPageSize: { args: [0], names: ["1"] },
  };
}

const accounts = [
  { number: "6800", name: "Kontorrekvisita", vatCodes: ["1", "0"] },
  { number: "1920", name: "Bank" },
  { number: "2710", name: "Inngående merverdiavgift" },
];
const taxCodes = [
  { code: "1", label: "Input VAT 25 %", percent: 25 },
  { code: "0", label: "No VAT", percent: 0 },
];
const openItem = (id: string, partyId: string, dueDate: string, amountMinor: number) => ({
  id,
  partyId,
  partyName: `Party ${partyId}`,
  documentNumber: `INV-${id}`,
  dueDate,
  amountMinor,
  kind: "receivable",
});
const openItems = [openItem("1", "acme", "2026-03-15", 100_00), openItem("2", "birch", "2026-01-10", 300_00)];
const f = <T,>(value: T) => ({ value, confidence: 0.99 });
const supplierInvoice = {
  id: "s1",
  status: "new",
  document: { id: "doc-s1", fileName: "s1.pdf", page: 1 },
  bankAccount: "8601 11 17947",
  fields: {
    supplierName: f("Acme Inc"),
    supplierOrgNumber: f("12-3456789"),
    invoiceNumber: f("INV-100"),
    invoiceDate: f("2026-01-10"),
    dueDate: f("2026-02-09"),
    netMinor: f(800_00),
    taxMinor: f(200_00),
    grossMinor: f(1000_00),
    currency: f("USD"),
    paymentReference: f("KID-99887766"),
  },
};
const ledgerEntries = [
  {
    id: "e1d",
    voucherId: "v1",
    voucherNumber: "1000",
    date: "2026-01-05",
    description: "Paper",
    account: "6800",
    accountName: "Kontor",
    debitMinor: 100_00,
    creditMinor: 0,
  },
  {
    id: "e1c",
    voucherId: "v1",
    voucherNumber: "1000",
    date: "2026-01-05",
    description: "Paper",
    account: "1920",
    accountName: "Bank",
    debitMinor: 0,
    creditMinor: 100_00,
  },
];
const file = (id: string, kind?: string) => ({
  id,
  fileName: `${id}.pdf`,
  mediaType: "application/pdf",
  sizeBytes: 20_480,
  sha256: id.padEnd(64, "0"),
  ...(kind ? { kind } : {}),
});

const CONTROLS: Record<string, Control> = {
  "field-amount": {
    options: { currency: "NOK" },
    probes: { setMinor: { args: [125.5], names: ["minor units", "12500"] } },
  },
  "field-code": {
    options: {
      value: "100",
      options: [
        { value: "100", label: "Drift" },
        { value: "200", label: "Prosjekt" },
      ],
    },
    probes: { setCode: { args: ["300"], names: ["Drift", "Prosjekt"] } },
  },
  "field-date": {
    options: { value: "" },
    probes: { setDate: { args: ["Smarch 3rd"], names: ["YYYY-MM-DD"] } },
  },
  "account-picker": {
    options: { accounts },
    probes: {
      setAccount: { args: ["9999"], names: ["6800", "1920"] },
      setValue: { args: ["9999"], names: ["6800", "1920"] },
      clear: NOTHING,
    },
  },
  "accounting-period": {
    options: { year: 2026, granularity: "month" },
    probes: {
      setPeriod: { args: ["Smarch"], names: ["2026-01", "2026-12"] },
      setValue: { args: ["Smarch"], names: ["2026-01", "2026-12"] },
      clear: NOTHING,
    },
  },
  "aged-balances": {
    options: { items: openItems, defaultAsOf: "2026-04-30" },
    probes: {
      ...tableProbes("partyName"),
      openParty: { args: ["nope"], names: ["acme", "birch"] },
      setAsOf: { args: ["30.04.2026"], names: ["YYYY-MM-DD"] },
      overdue: { none: "a whole number of days, 1 by default" },
      back: NOTHING,
    },
  },
  "aging-chart": {
    options: { items: openItems, defaultAsOf: "2026-04-30" },
    probes: { drill: { args: ["nope"], names: ["1-30", "over-90"] } },
  },
  "amount-field": {
    options: { currency: "NOK" },
    probes: { setMinor: { args: [125.5], names: ["minor units", "12500"] }, clear: NOTHING },
  },
  "approval-chain": {
    options: {
      chain: [{ id: "l1", name: "Manager", approvers: [{ id: "kari" }] }],
      defaultRequest: { id: "r1", amountMinor: 250_000, requesterId: "nina", decisions: [] },
    },
    probes: { assertApproved: NOTHING },
  },
  "attestation-status": {
    options: {},
    probes: { setStatus: { args: ["maybe"], names: ["pending", "approved", "rejected", "escalated"] } },
  },
  "document-signoff": {
    options: { defaultDocument: { id: "05.3", version: 2, saveState: "saved", openPoints: [], signatures: [] } },
    probes: { assertSignable: NOTHING },
  },
  "sheet-stack": {
    options: {
      defaultSheets: [
        { key: "page", title: "05.3" },
        { key: "gl", title: "Ledger 1500" },
      ],
    },
    probes: { back: { args: ["nope"], names: ["page", "gl"] }, close: NOTHING },
  },
  "audit-findings": {
    options: {
      defaultFindings: [
        {
          id: "F-1",
          title: "Revenue cut-off",
          category: "misstatement",
          status: "draft",
          basis: "documented",
          sources: [],
          confidential: false,
          raisedBy: "kari",
          log: [],
        },
      ],
      evidence: [{ id: "E1" }, { id: "E2" }],
      currency: "NOK",
    },
    probes: {
      draftFinding: {
        object: (extra) => [{ title: "Unrecorded liability", category: "misstatement", basis: "hypothesis", ...extra }],
        fields: ["title", "category", "basis", "amountMinor"],
        format: "findingFormat",
      },
      editFinding: [
        {
          object: (extra) => ["F-1", { ...extra }],
          fields: ["title", "description", "category", "amountMinor"],
          format: "findingFormat",
        },
        { args: ["nope", {}], names: ["F-1"] },
      ],
      linkSource: [
        { args: ["nope", "E1"], names: ["F-1"] },
        { args: ["F-1", "E9"], names: ["E1", "E2"] },
      ],
      setBasis: [
        { args: ["F-1", "rumour"], names: ["documented", "reported", "hypothesis"] },
        { args: ["nope", "reported"], names: ["F-1"] },
      ],
      assertConfirmable: { args: ["nope"], names: ["F-1"] },
    },
  },
  "audit-workpaper": {
    options: {
      population: [
        { id: "inv-1", amountMinor: 1_000_00 },
        { id: "inv-2", amountMinor: 2_500_00 },
      ],
      tickMarks: [{ symbol: "✓", meaning: "Agreed to invoice" }],
      materiality: { benchmarkMinor: 400_000_00, overallBp: 100, performanceBp: 5000, trivialBp: 500 },
      actor: "kari",
    },
    prepare: (api) => api.drawSample!("all-above", { seed: "wp-1", tolerableMinor: 1 }),
    probes: {
      drawSample: [
        {
          object: (extra) => ["all-above", { seed: "wp-1", ...extra }],
          fields: ["seed", "size", "tolerableMinor"],
          format: "sampleFormat",
        },
        { args: ["random-ish", { seed: "x" }], names: ["monetary-unit", "all-above"] },
      ],
      setResult: [
        { args: ["nope", "ok"], names: ["inv-1", "inv-2"] },
        { args: ["inv-1", "fine"], names: ["ok", "exception"] },
      ],
      setTickMark: { args: ["inv-1", "Z"], names: ["✓"] },
      setEvidence: { args: ["nope", "f1"], names: ["inv-1"] },
      setNote: { args: ["nope", "x"], names: ["inv-1"] },
      assertReadyForSignOff: NOTHING,
    },
  },
  "bank-account": {
    options: {},
    probes: { setKontonummer: FREE_DIGITS, setRouting: FREE_DIGITS, setAccount: FREE_DIGITS, clear: NOTHING },
  },
  "bank-reconciliation": {
    options: {
      bankLines: [{ id: "b1", date: "2026-10-01", description: "Nordlys AS", amountMinor: 125_000 }],
      openPosts: [{ id: "p1", date: "2026-09-20", description: "Faktura 1001", amountMinor: 125_000 }],
    },
    probes: {
      suggestMatch: [
        { args: [["zz"], ["p1"]], names: ["b1"], format: "matchFormat" },
        { args: [["b1"], ["zz"]], names: ["p1"] },
      ],
      withdrawMatch: { args: ["m9"], names: ["none"] },
      setMatches: RESTORE,
      assertReconciled: NOTHING,
    },
  },
  "bar-chart": {
    options: {
      items: [
        { id: "rent", label: "Rent", valueMinor: 500_00 },
        { id: "travel", label: "Travel", valueMinor: 150_00 },
      ],
    },
    probes: {
      drill: { args: ["nope"], names: ["rent", "travel"] },
      setLimit: { args: [0], names: ["null"] },
    },
  },
  "cashflow-waterfall": {
    options: {
      openingMinor: 1000_00,
      closingMinor: 1300_00,
      steps: [{ id: "sales", label: "Sales", amountMinor: 300_00 }],
    },
    probes: { drill: { args: ["nope"], names: ["sales"] } },
  },
  "client-requests": {
    options: {
      defaultRequests: [
        {
          id: "R-1",
          title: "Bank confirmations",
          status: "sent",
          recipient: { name: "Ingrid Fjell", email: "ingrid@example.test" },
          reminders: 0,
          createdBy: "kari",
        },
      ],
      today: "2026-03-08",
    },
    probes: {
      draftRequest: {
        object: (extra) => [
          { title: "Leases", recipientName: "Ola Berg", recipientEmail: "ola@example.test", ...extra },
        ],
        fields: ["title", "recipientName", "recipientEmail", "dueDate"],
        format: "requestFormat",
      },
      editRequest: [
        {
          object: (extra) => ["R-1", { ...extra }],
          fields: ["title", "area", "dueDate", "recipientName"],
          format: "requestFormat",
        },
        { args: ["nope", { area: "Cash" }], names: ["R-1"] },
      ],
      recordAnswer: { args: ["nope", "Attached."], names: ["R-1"] },
      assertAnswered: { args: ["nope"], names: ["R-1"] },
    },
  },
  "close-checklist": {
    options: {
      defaultTasks: [
        { id: "bank", title: "Reconcile bank", status: "open" },
        { id: "vat", title: "File VAT", status: "open" },
      ],
    },
    probes: { completeTask: { args: ["nope"], names: ["bank", "vat"] }, assertReadyToClose: NOTHING },
  },
  "currency-select": {
    options: { currencies: ["NOK", "USD"] },
    probes: {
      setCurrency: { args: ["XYZ"], names: ["NOK", "USD"] },
      setValue: { args: ["XYZ"], names: ["NOK", "USD"] },
      clear: NOTHING,
    },
  },
  "data-table": {
    options: {
      rows: [
        { id: "INV-001", amountMinor: 100_00 },
        { id: "INV-002", amountMinor: 200_00 },
      ],
      columns: [
        { id: "id", header: "Invoice", value: (row: State) => row.id },
        { id: "amountMinor", header: "Amount", kind: "money", value: (row: State) => row.amountMinor },
      ],
    },
    probes: {
      ...tableProbes("amountMinor"),
      showColumns: { args: [["nope"]], names: ["id", "amountMinor"] },
      hideColumns: { args: [["nope"]], names: ["id", "amountMinor"] },
      selectRows: { args: [["INV-999"]], names: ["INV-001", "INV-002"] },
      clearSelection: NOTHING,
    },
  },
  "evidence-list": {
    options: { pool: [file("f1"), file("f2", "receipt")], requires: ["receipt"] },
    prepare: (api) => api.linkAttachment!("f1"),
    probes: {
      linkAttachment: { args: ["nope"], names: ["f2"] },
      setKind: { args: ["f1", "selfie"], names: ["receipt", "invoice"] },
      assertEvidenced: NOTHING,
    },
  },
  "expense-claim": {
    options: {
      defaultClaim: {
        id: "c1",
        claimantId: "nina",
        status: "draft",
        currency: "USD",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        lines: [
          {
            id: "l1",
            kind: "expense",
            date: "2026-01-12",
            category: "meals",
            description: "Dinner",
            amountMinor: 50_00,
            receiptId: "f1",
          },
        ],
        acceptedExceptions: [],
      },
      policy: { categories: { travel: {}, meals: {} }, mileageRateMinorPerKm: 70, perDiemRates: { domestic: 60_00 } },
      today: "2026-02-02",
    },
    probes: {
      addLine: [
        {
          object: (extra) => [
            {
              kind: "expense",
              date: "2026-01-13",
              category: "travel",
              description: "Train",
              amountMinor: 450_00,
              ...extra,
            },
          ],
          fields: ["amountMinor", "distanceKm", "category"],
          format: "lineFormat",
        },
        {
          args: [{ kind: "expense", date: "2026-01-13", category: "taxi", description: "Taxi", amountMinor: 1 }],
          names: ["travel", "meals"],
        },
      ],
      setLine: [
        {
          object: (extra) => ["l1", { description: "Lunch", ...extra }],
          fields: ["amountMinor", "description"],
          format: "lineFormat",
        },
        { args: ["l9", { description: "x" }], names: ["l1"] },
      ],
      removeLine: { args: ["l9"], names: ["l1"] },
      assertSubmittable: NOTHING,
    },
  },
  "financial-date": {
    options: {},
    probes: {
      setDate: { args: ["Smarch 3rd"], names: ["YYYY-MM-DD"] },
      setValue: { args: ["Smarch 3rd"], names: ["YYYY-MM-DD"] },
      setDaysFromToday: { args: [30], names: ["invoice", "setDate"] },
      clear: NOTHING,
    },
  },
  "fixed-asset-register": {
    options: {
      defaultAssets: [
        {
          id: "van",
          name: "Van",
          acquiredOn: "2026-01-15",
          costMinor: 36_000_00,
          residualMinor: 0,
          method: "straight-line",
          usefulLifeMonths: 36,
        },
      ],
      defaultPeriod: "2026-03",
    },
    probes: {
      openAsset: { args: ["nope"], names: ["van"] },
      setPeriod: { args: ["March"], names: ["2026-03"] },
      proposeRun: { args: ["March"], names: ["2026-03"] },
      assertRunnable: { args: ["March"], names: ["2026-03"] },
      back: NOTHING,
    },
  },
  "iban-input": { options: {}, probes: { setIban: FREE_DIGITS, clear: NOTHING } },
  "invoice-editor": {
    options: {
      defaultInvoice: {
        id: "i1",
        kind: "invoice",
        status: "draft",
        currency: "USD",
        lines: [
          {
            id: "l1",
            description: "Hours",
            quantityMilli: 2000,
            unitPriceMinor: 150_00,
            taxCategory: "S",
            taxRateBp: 2500,
          },
        ],
      },
    },
    probes: {
      addLine: {
        object: (extra) => [{ description: "Licence", quantity: 1, unitPriceMinor: 99_00, taxRate: 25, ...extra }],
        fields: ["quantity", "taxRate", "unitPriceMinor"],
        format: "lineFormat",
      },
      setLine: [
        {
          object: (extra) => ["l1", { quantity: 3, ...extra }],
          fields: ["quantity", "unitPriceMinor"],
          format: "lineFormat",
        },
        { args: ["l9", { quantity: 1 }], names: ["l1"] },
      ],
      removeLine: { args: ["l9"], names: ["l1"] },
      setCustomerTaxId: FREE_TEXT,
      setInvoice: RESTORE,
      assertFinalizable: NOTHING,
    },
  },
  "invoice-number": { options: {}, probes: { setInvoiceNumber: FREE_TEXT, setValue: FREE_TEXT, clear: NOTHING } },
  "kpi-stat": { options: { label: "Revenue", valueMinor: 100_00 }, probes: {} },
  "ledger-table": {
    options: { entries: ledgerEntries },
    probes: {
      ...tableProbes("account"),
      openAccount: { args: ["9999"], names: ["6800", "1920"] },
      showVoucher: { args: ["nope"], names: ["1000"] },
      setRange: { args: ["January"], names: ["YYYY-MM-DD"] },
      explainVariance: { args: ["6800", "January", "2026-02"], names: ["2026-03", "2026-T2"] },
      back: NOTHING,
    },
  },
  "organization-number": {
    options: {},
    probes: { setOrganizationNumber: FREE_DIGITS, setDigits: FREE_DIGITS, clear: NOTHING },
  },
  "payment-batch": {
    options: {
      defaultBatch: {
        id: "b1",
        status: "draft",
        debitAccount: "1503 40 12345",
        valueDate: "2026-02-01",
        currency: "USD",
        preparedBy: "nina",
        approvals: [],
        items: [
          { id: "p1", creditorName: "Acme", amountMinor: 100_00, creditorAccount: "8601 11 17947", reference: "INV-1" },
        ],
      },
    },
    probes: {
      ...tableProbes("creditorName"),
      removePayment: { args: ["nope"], names: ["p1"] },
      assertReleasable: NOTHING,
    },
  },
  "payment-reference": {
    options: { kind: "memo" },
    probes: {
      setReference: FREE_TEXT,
      setValue: FREE_TEXT,
      generateKid: { args: [], names: ["memo", "setReference"] },
      clear: NOTHING,
    },
  },
  "period-lock": {
    options: { defaultPeriods: [{ code: "2026-01", status: "hard-closed" }] },
    probes: { assertPostingAllowed: { args: ["15.01.2026"], names: ["YYYY-MM-DD"] } },
  },
  "supplier-invoice-inbox": {
    options: { defaultInvoices: [supplierInvoice], chart: ["6800", "4000"], actor: "kari" },
    probes: {
      ...tableProbes("supplierName"),
      correctField: [
        { args: ["nope", "netMinor", 1], names: ["s1"], format: "codingFormat" },
        { args: ["s1", "net", 1], names: ["netMinor", "dueDate"] },
      ],
      confirmField: [
        { args: ["nope", "netMinor"], names: ["s1"] },
        { args: ["s1", "net"], names: ["netMinor", "dueDate"] },
      ],
      proposeCoding: [
        { args: ["s1", "9999"], names: ["6800", "4000"], format: "codingFormat" },
        { args: ["nope", "6800"], names: ["s1"] },
      ],
      // No `rule` option here: the refusal names the option the ERP sets.
      approveUnderRule: { args: ["s1"], names: ["rule"] },
      proposeRejection: [
        { args: ["nope", "Duplicate"], names: ["s1"] },
        { args: ["s1", " "], names: ["s1"] },
      ],
      assertApprovable: { args: ["nope"], names: ["s1"] },
    },
  },
  "tax-code-select": {
    options: { codes: taxCodes },
    probes: {
      setTaxCode: { args: ["99"], names: ["Input VAT 25 %", "No VAT"] },
      setValue: { args: ["99"], names: ["Input VAT 25 %", "No VAT"] },
      clear: NOTHING,
    },
  },
  "trend-chart": {
    options: {
      series: [
        {
          id: "revenue",
          name: "Revenue",
          points: [
            { period: "2026-01", valueMinor: 100 },
            { period: "2026-02", valueMinor: 120 },
          ],
        },
      ],
    },
    probes: {
      setRange: { args: ["1y"], names: ["6m", "all"] },
      drill: [
        { args: ["Feb"], names: ["YYYY-MM"] },
        { args: ["2030-01"], names: ["2026-01", "2026-02"] },
      ],
    },
  },
  "vat-return": {
    options: { schema: GENERIC_VAT_SCHEMA_EXAMPLE, period: "2026-T2", transactions: [] },
    probes: {
      openBox: {
        args: ["nope"],
        names: () => GENERIC_VAT_SCHEMA_EXAMPLE.boxes.slice(0, 2).map((box: { id: string }) => box.id),
      },
      back: NOTHING,
      assertReady: NOTHING,
    },
  },
  "voucher-composer": {
    options: {
      accounts,
      taxCodes,
      departments: [{ code: "200", name: "Sales" }],
      projects: [{ code: "P1", name: "Pilot" }],
      dimensions: [{ key: "region", name: "Region", options: [{ code: "N", name: "North" }] }],
      currency: "NOK",
      defaultLines: [{ id: "a", account: "6800", accountName: "Kontorrekvisita", debitMinor: 100_00, creditMinor: 0 }],
    },
    probes: {
      addLine: [
        {
          object: (extra) => [{ account: "1920", creditMinor: 100_00, ...extra }],
          fields: ["account", "debitMinor", "creditMinor", "vatCode"],
          format: "lineFormat",
        },
        {
          object: (extra) => ["1920", "Bank", 0, 100_00, { ...extra }],
          fields: ["vatCode", "department", "project"],
          format: "lineFormat",
        },
        { args: ["9999"], names: ["6800", "1920"] },
      ],
      setDebit: { args: ["nope", 1], names: ["a"] },
      setCredit: { args: ["nope", 1], names: ["a"] },
      setAccount: [
        { args: ["nope", "6800"], names: ["a"] },
        { args: ["a", "9999"], names: ["6800", "1920"] },
      ],
      setVatCode: { args: ["a", "99"], names: ["1", "0"] },
      setDepartment: { args: ["a", "999"], names: ["200"] },
      setProject: { args: ["a", "P9"], names: ["P1"] },
      setDimension: [
        { args: ["a", "colour", "red"], names: ["region"] },
        { args: ["a", "region", "S"], names: ["N"] },
      ],
      setForeign: [
        { args: ["nope", "EUR", 100, 11_500_000], names: ["a"] },
        {
          object: (extra) => ["a", { currency: "EUR", amountMinor: 100, rateScaled: 11_500_000, ...extra }],
          fields: ["currency", "amountMinor", "rateScaled"],
          format: "foreignFormat",
        },
      ],
      setLines: RESTORE,
      removeLine: { args: ["nope"], names: ["a"] },
      clear: NOTHING,
      assertBalance: NOTHING,
      assertPostable: NOTHING,
    },
  },
};

// ---------------------------------------------------------------------------
// What each control declares, read from its source like the contract test.

const SRC = path.dirname(new URL(import.meta.url).pathname);
const PRIMITIVES = path.join(SRC, "..", "..", "primitives", "src");
const sources = [
  ...readdirSync(PRIMITIVES)
    .filter((file) => file.endsWith(".ts") && !file.includes(".test."))
    .map((file) => readFileSync(path.join(PRIMITIVES, file), "utf8")),
  // The react files that define a primitive of their own, like use-booki-field-amount.ts.
  ...readdirSync(SRC)
    .filter((file) => /\.tsx?$/.test(file) && !file.includes(".test."))
    .map((file) => readFileSync(path.join(SRC, file), "utf8"))
    .filter((text) => text.includes("definePrimitive(")),
];

type Definition = { name: string; options: Record<string, unknown>; slots: Record<string, unknown> };
const definitions = (Object.values(library) as unknown[]).filter(
  (value): value is Definition =>
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "slots" in value &&
    "options" in value &&
    typeof (value as { name?: unknown }).name === "string",
);

function declared(name: string) {
  const source = sources.find((text) => text.includes(`name: "${name}"`)) ?? "";
  const block = source.match(/agent:\s*\{[^}]*?actions:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  const controlled = source.match(/controlled:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  return {
    actions: [...new Set([...block.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]!))],
    controlled: [...controlled.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]!),
  };
}

function open(definition: Definition, control: Control) {
  const view = mount(definition as never, control.options as never, "<root></root>");
  const api = view.api as unknown as Record<string, (...args: unknown[]) => unknown>;
  control.prepare?.(api);
  const snapshot = (): State => {
    const state = view.state as State;
    return Object.fromEntries(declared(definition.name).controlled.map((key) => [key, state[key]]));
  };
  return { view, api, snapshot };
}

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

/** Words a Norwegian sentence rightly translates; ids, codes and field names stay as they are. */
const TRANSLATED = new Set(["minor units", "none", "YYYY-MM-DD", "YYYY-MM"]);

/** A Norwegian rendering exists: `localize` turned the English sentence into another one that keeps the names. */
function expectNorwegian(message: string, names: string[]) {
  const nb = localize(message, "nb");
  expect(nb, `No Norwegian for: ${message}`).not.toBe(message);
  for (const name of names) {
    if (!TRANSLATED.has(name)) expect(nb, `Norwegian drops "${name}": ${nb}`).toContain(name);
  }
}

const probesOf = (probe: Probe | Probe[]) => (Array.isArray(probe) ? probe : [probe]);

describe("agent ergonomics", () => {
  it("has a probe for every agent action of every control", () => {
    expect(definitions.length).toBeGreaterThan(30);
    const missing: string[] = [];
    for (const definition of definitions) {
      const control = CONTROLS[definition.name];
      if (!control) {
        missing.push(`${definition.name} (no entry)`);
        continue;
      }
      for (const action of declared(definition.name).actions) {
        if (!control.probes[action]) missing.push(`${definition.name}.${action}`);
      }
    }
    expect(missing, "Add a probe for each: what an unknown argument is refused with, or why there is none.").toEqual(
      [],
    );
  });

  for (const definition of definitions) {
    const control = CONTROLS[definition.name];
    if (!control) continue;

    describe(definition.name, () => {
      for (const [action, entry] of Object.entries(control.probes)) {
        probesOf(entry).forEach((probe, index) => {
          if ("none" in probe) return;
          const label = `${action} #${index + 1}`;

          if ("object" in probe) {
            it(`${label}: takes one object and refuses an unknown field, naming the fields (rules 1, 2)`, () => {
              const { view, api } = open(definition, control);
              try {
                const message = refusal(() => api[action]!(...probe.object({ zzUnknown: 1 })));
                expect(message, `${action} accepted an unknown field`).not.toBe("");
                expect(message).toContain("zzUnknown");
                for (const field of probe.fields) expect(message, `refusal does not list "${field}"`).toContain(field);
                expectNorwegian(message, ["zzUnknown", ...probe.fields]);
                // The plain call is accepted, so the refusal was about the field.
                expect(refusal(() => api[action]!(...probe.object({})))).toBe("");
              } finally {
                view.unmount();
              }
            });
            it(`${label}: shows its format in the snapshot before the first try (rule 4)`, () => {
              const { view, snapshot } = open(definition, control);
              try {
                const hint = snapshot()[probe.format];
                expect(typeof hint, `snapshot has no "${probe.format}"`).toBe("string");
                expect((hint as string).length, "a hint is short: under about 40 tokens").toBeLessThanOrEqual(160);
              } finally {
                view.unmount();
              }
            });
            return;
          }

          it(`${label}: refuses an unknown argument, naming what exists, in English and Norwegian (rule 2)`, () => {
            const { view, api, snapshot } = open(definition, control);
            try {
              const names = typeof probe.names === "function" ? probe.names(snapshot()) : probe.names;
              const message = refusal(() => api[action]!(...probe.args));
              expect(message, `${action}(${JSON.stringify(probe.args)}) was accepted`).not.toBe("");
              for (const name of names) expect(message, `refusal does not name "${name}": ${message}`).toContain(name);
              expectNorwegian(message, names);
              if (probe.format) {
                const hint = snapshot()[probe.format];
                expect(typeof hint, `snapshot has no "${probe.format}"`).toBe("string");
                expect((hint as string).length).toBeLessThanOrEqual(160);
              }
            } finally {
              view.unmount();
            }
          });
        });
      }

      it("names every number that could be money as minor units (rule 3)", () => {
        const { view, snapshot } = open(definition, control);
        try {
          const state = snapshot();
          // An older key stays for those who read it, beside a twin that says its unit.
          const twins = TWINS[definition.name] ?? {};
          for (const [key, twin] of Object.entries(twins))
            expect(state[twin], `"${key}" needs its twin "${twin}"`).toBe(state[key]);
          const found = ambiguousNumbers(state).filter((key) => !(key in twins));
          // A list's money column may have any name the app gave it; its column entry says the unit.
          const columns = Array.isArray(state.columns) ? (state.columns as State[]) : [];
          for (const column of columns.filter((item) => item.kind === "money")) {
            expect(column.unit, `money column "${String(column.id)}" does not say its unit`).toBe("minor");
          }
          expect(found, `Numbers that do not say their unit: ${found.join(", ")}`).toEqual([]);
        } finally {
          view.unmount();
        }
      });
    });
  }
});

/**
 * Keys of numbers whose name says money but not the unit. A money figure ends
 * in `Minor`; a share in `Pct`, `Bp` or `percent`; a count is named as one.
 */
const MONEY =
  /amount|total|price|balance|sum|net|gross|vat|debit|credit|opening|closing|proceeds|misstatement|cost|residual|value/i;
const UNIT = /(Minor|Bp|Pct|Percent|percent|Count|count|Milli|Meters|Days|days|Months|Scaled)$/;
/** Counts of rows, named the way every list control names them (`view.total` beside `matching`). */
const COUNTS = new Set(["total", "matching", "page", "pageCount", "pageSize", "totalCount"]);

/** Keys kept for compatibility, each with the twin that says its unit. */
const TWINS: Record<string, Record<string, string>> = {
  "amount-field": { value: "minor" },
  "vat-return": { unmappedTotal: "unmappedCount" },
};

function ambiguousNumbers(value: unknown, at = "", unitAbove = false): string[] {
  if (Array.isArray(value))
    return value.slice(0, 3).flatMap((item, i) => ambiguousNumbers(item, `${at}[${i}]`, unitAbove));
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value as State).flatMap(([key, item]) => {
    const where = at ? `${at}.${key}` : key;
    if (typeof item === "number") {
      // `netMinor: { value, confidence }` says the unit one level up.
      if (unitAbove && key === "value") return [];
      return MONEY.test(key) && !UNIT.test(key) && !COUNTS.has(key) ? [where] : [];
    }
    return ambiguousNumbers(item, where, UNIT.test(key));
  });
}
