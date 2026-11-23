/**
 * The two tasks and the pages each one runs on. Every page of a task gets the
 * same system prompt and the same task text; only the tools differ, and each
 * page's tools are the only ones the model is given.
 */
import type { Session } from "./session.js";
import {
  verifyCloseAcc,
  verifyCloseRaw,
  verifyDashboardAnswer,
  verifyInboxAcc,
  verifyInboxRaw,
  verifyReconcileAcc,
  verifyReconcileRaw,
  verifySalesInvoiceAcc,
  verifySalesInvoiceRaw,
  verifySupplierInvoiceAcc,
  verifySupplierInvoiceRaw,
  verifyInvoiceAcc,
  verifyInvoiceSemantic,
  verifyVoucherAcc,
  verifyVoucherGrid,
  verifyVoucherRaw,
  type Verification,
} from "./verify.js";
import {
  verifyClosedPeriodAcc,
  verifyClosedPeriodRaw,
  verifyDocErrorAcc,
  verifyDocErrorRaw,
  verifyDuplicateAcc,
  verifyDuplicateRaw,
  verifyForeignAcc,
  verifyForeignRaw,
  verifyPartialVatAcc,
  verifyPartialVatRaw,
} from "./verify-hard.js";

/** Identical for every page of every task. */
export const SYSTEM_PROMPT =
  "You operate a web page for the user through the tools you are given. " +
  "Carry out the task on the page, then reply with a short summary of what you did " +
  "and anything you could not do.";

export type TaskId =
  | "invoice"
  | "voucher"
  | "supplier-invoice"
  | "sales-invoice"
  | "dashboard"
  | "inbox"
  | "reconcile"
  | "close"
  | "doc-error"
  | "closed-period"
  | "duplicate"
  | "foreign-currency"
  | "partial-vat";

/** The single-screen tasks and the workflow tasks, in the order they are run. */
export const SCREEN_TASKS: TaskId[] = ["voucher", "supplier-invoice", "sales-invoice", "dashboard"];
export const WORKFLOW_TASKS: TaskId[] = ["inbox", "reconcile", "close"];
/**
 * The five hard tasks. Not in SCREEN_TASKS or WORKFLOW_TASKS: they have no
 * recorded replicas, so `pnpm proof` and h2h never run them.
 */
export const HARD_TASKS: TaskId[] = ["doc-error", "closed-period", "duplicate", "foreign-currency", "partial-vat"];

export type PageSpec = {
  /** Short id used in tables and the results file. */
  id: string;
  path: string;
  /** "browser": Playwright MCP (or the legacy tools). "bridge": the ui-sdk bridge. */
  tools: "browser" | "bridge";
  label: string;
  /** JS expression, truthy once the page is ready for tools. */
  ready: string;
  /** `answer` is the agent's final text, for read-only tasks. */
  verify: (session: Session, context?: { answer?: string }) => Promise<Verification>;
  /**
   * Ways a scripted agent can do the task on this page (h2h and the dry run).
   * Default: one, "default". `caps` are extra Playwright MCP capabilities the
   * strategy needs; `approximate` marks a strategy that cannot get exact numbers.
   */
  strategies?: { id: string; caps?: string[]; approximate?: boolean; note?: string }[];
  /** Short key for the results file: which product a replica was rebuilt from, or "acc". */
  key?: string;
  /**
   * What the irreversible step should end as on this page: "posted" where
   * nothing on the page stops an agent and the task asks for it, "held" where
   * the page hands it to a person.
   */
  expectPosted: boolean;
  /**
   * Bridge pages only: a step that is a person's, tried by the dry run after
   * the script to prove the bridge refuses it. `component` is matched against
   * the snapshot to find the ref.
   */
  personStep?: { component: string; action: string; args: unknown[] };
};

export type TaskSpec = {
  id: TaskId;
  text: string;
  pages: PageSpec[];
  /**
   * Cap on model requests per run when `--max-steps` is not given. 30 for the
   * single screens; the workflows are longer (METHOD.md says why each is set
   * where it is).
   */
  maxSteps?: number;
};

const bridgeReady = (component: string) =>
  `!!window.agent && window.agent.snapshot().some((entry) => entry.component === ${JSON.stringify(component)})`;

export const TASKS: Record<TaskId, TaskSpec> = {
  invoice: {
    id: "invoice",
    text:
      "Book this invoice: set the amount excluding tax to 3,125.00, set the tax code to 8.875%, " +
      "write three voucher lines (debit 1200 Accounts receivable 3,402.34; credit 4000 Sales revenue " +
      "3,125.00; credit 2150 Sales tax payable 277.34), confirm debit equals credit, then pay the invoice.",
    pages: [
      {
        id: "semantic",
        path: "/bench/semantic",
        tools: "browser",
        label: "HTML + browser tools",
        ready: `!!document.querySelector('form[aria-label="Invoice"] input[name="credit3"]')`,
        verify: verifyInvoiceSemantic,
        expectPosted: true,
      },
      {
        id: "acc",
        path: "/bench/acc",
        tools: "bridge",
        label: "Booki + bridge",
        ready: bridgeReady("voucher-composer"),
        verify: verifyInvoiceAcc,
        // The pay button is marked data-agent-confirm: the bridge refuses it.
        expectPosted: false,
      },
    ],
  },
  voucher: {
    id: "voucher",
    text:
      "Registrer et bilag datert 2026-10-31: debet 6800 Kontorrekvisita med 25 % inngående mva, " +
      "kredit 2400 Leverandørgjeld, 15 500,00 inkludert mva. Kontroller at det balanserer, og opprett det.",
    pages: [
      {
        id: "voucher-raw",
        path: "/bench/voucher-raw",
        tools: "browser",
        label: "listbox voucher screen + browser tools",
        ready: "!!document.querySelector('.raw-voucher') && !!window.__rawVoucher",
        verify: verifyVoucherRaw,
        expectPosted: true,
      },
      {
        id: "voucher-grid",
        path: "/bench/voucher-grid",
        tools: "browser",
        label: "grid voucher screen + browser tools",
        ready: "!!document.querySelector('.grid-voucher') && !!window.__gridVoucher",
        verify: verifyVoucherGrid,
        expectPosted: true,
      },
      {
        id: "voucher-acc",
        path: "/bench/voucher-acc",
        tools: "bridge",
        label: "Booki voucher + bridge",
        ready: `${bridgeReady("voucher-composer")} && !!window.__accVoucher`,
        verify: verifyVoucherAcc,
        // Under the company's auto-post rule (balanced, dated, under 50 000):
        // the agent may post it.
        expectPosted: true,
      },
    ],
  },
  // A grid-style replica of each of the two tasks below can be added as one
  // more page entry each, as voucher-grid is for the voucher.
  "supplier-invoice": {
    id: "supplier-invoice",
    text:
      "Registrer en leverandørfaktura fra Kontorrekvisita AS: fakturanummer 8841, fakturadato 2026-10-12, " +
      "forfall 2026-11-11, KID 10012342, 15 500,00 inkludert 25 % mva, kostnadskonto 6800. Bokfør den.",
    pages: [
      {
        id: "supplier-invoice-raw",
        path: "/bench/supplier-invoice-raw",
        tools: "browser",
        label: "listbox supplier-invoice screen + browser tools",
        ready: "!!document.querySelector('.raw-voucher') && !!window.__rawSupplierInvoice",
        verify: verifySupplierInvoiceRaw,
        expectPosted: true,
      },
      {
        id: "supplier-invoice-acc",
        path: "/bench/supplier-invoice-acc",
        tools: "bridge",
        label: "Booki supplier invoice + bridge",
        ready: `${bridgeReady("payment-reference")} && !!window.__accSupplierInvoice`,
        verify: verifySupplierInvoiceAcc,
        // Under the company's auto-post rule (fields complete, KID valid, under 50 000).
        expectPosted: true,
      },
    ],
  },
  "sales-invoice": {
    id: "sales-invoice",
    text:
      "Lag en faktura til kunden Brattli AS med to linjer: Rådgivning, 12,5 timer à 1 450,00, og " +
      "Reiseutlegg, 1 à 2 380,00, begge med 25 % mva. Opprett den.",
    pages: [
      {
        id: "sales-invoice-raw",
        path: "/bench/sales-invoice-raw",
        tools: "browser",
        label: "listbox order screen + browser tools",
        ready: "!!document.querySelector('.raw-voucher') && !!window.__rawSalesInvoice",
        verify: verifySalesInvoiceRaw,
        expectPosted: true,
      },
      {
        id: "sales-invoice-acc",
        path: "/bench/sales-invoice-acc",
        tools: "bridge",
        label: "Booki order + bridge",
        ready: `${bridgeReady("invoice-editor")} && !!window.__accSalesInvoice`,
        verify: verifySalesInvoiceAcc,
        // Creating the draft order is allowed when it has no issues; finalizing is a person's.
        expectPosted: true,
      },
    ],
  },
  dashboard: {
    id: "dashboard",
    text:
      "Les tallene på dashbordet og svar med eksakte beløp i kroner: (1) inntekter og kostnader i oktober 2026; " +
      "(2) hvilken av de siste tolv månedene (november 2025 til oktober 2026) som hadde høyest inntekt, og hvor mye; " +
      "(3) hvor mye av kundefordringene som er forfalt mer enn 30 dager. Ikke endre noe.",
    pages: [
      {
        id: "dashboard-raw",
        path: "/bench/dashboard-raw",
        tools: "browser",
        label: "SVG-chart dashboard + browser tools",
        ready: "!!document.querySelector('.recharts-hit')",
        verify: verifyDashboardAnswer,
        expectPosted: false,
        key: "tripletex",
        strategies: [
          { id: "hover", note: "hover each month (CSS selector targets), read the tooltip with browser_snapshot" },
          { id: "screenshot", approximate: true, note: "full-page screenshots: bar heights only, no exact values" },
        ],
      },
      {
        id: "dashboard-grid",
        path: "/bench/dashboard-grid",
        tools: "browser",
        label: "canvas-chart dashboard + browser tools",
        ready: "!!document.querySelector('.result-canvas')",
        verify: verifyDashboardAnswer,
        expectPosted: false,
        key: "dnb",
        strategies: [
          {
            id: "hover",
            caps: ["vision"],
            note: "move the pointer over each bar (browser_mouse_move_xy, needs --caps vision), read the tooltip",
          },
          { id: "screenshot", approximate: true, note: "full-page screenshots: bar heights only, no exact values" },
        ],
      },
      {
        id: "dashboard-acc",
        path: "/bench/dashboard-acc",
        tools: "bridge",
        label: "Booki dashboard + bridge",
        ready: bridgeReady("trend-chart"),
        verify: verifyDashboardAnswer,
        expectPosted: false,
        key: "acc",
      },
    ],
  },
  inbox: {
    id: "inbox",
    maxSteps: 90,
    text:
      "Gå gjennom leverandørfakturaene i innboksen og bokfør dem. Rett eller bekreft felt som er lest med lav sikkerhet; " +
      "ifølge papirfakturaene er totalbeløpet fra Fjordkraft Strøm AS 9 375,00, forfallsdatoen fra Nordlys Eiendom AS " +
      "2026-11-01 og fakturanummeret fra Kontorservice Vest AS 4471. Kontér faktura 3318 fra Datahjelp Norge AS på 6810 " +
      "Datakostnader med 25 % mva. Avvis den fakturaen som er en kopi av en faktura som allerede er bokført. " +
      "Konteringen som allerede står på de andre fakturaene, er riktig.",
    pages: [
      {
        id: "inbox-raw",
        path: "/bench/inbox-raw",
        tools: "browser",
        label: "listbox-style inbox + browser tools",
        ready: "!!document.querySelector('.raw-voucher') && !!window.__rawInbox",
        verify: verifyInboxRaw,
        key: "listbox",
        expectPosted: true,
      },
      {
        id: "inbox-acc",
        path: "/bench/inbox-acc",
        tools: "bridge",
        label: "Booki SupplierInvoiceInbox + bridge",
        ready: `${bridgeReady("supplier-invoice-inbox")} && !!window.__accInbox`,
        verify: verifyInboxAcc,
        // Approving for posting and rejecting are a person's buttons, not agent actions.
        expectPosted: false,
        personStep: { component: "supplier-invoice-inbox", action: "approve", args: ["si-01"] },
      },
    ],
  },
  reconcile: {
    id: "reconcile",
    maxSteps: 70,
    text:
      "Avstem bankkonto 1920 for oktober 2026: koble hver banklinje til den eller de åpne postene den betaler. " +
      "Der flere poster har samme beløp, avgjør referansen. Én faktura er betalt i to deler. " +
      "Én banklinje har ingen åpen post; la den stå uavstemt. Ikke lag andre koblinger.",
    pages: [
      {
        id: "reconcile-raw",
        path: "/bench/reconcile-raw",
        tools: "browser",
        label: "checkbox reconciliation table + browser tools",
        ready: "!!document.querySelector('.raw-voucher') && !!window.__rawReconcile",
        verify: verifyReconcileRaw,
        key: "table",
        expectPosted: true,
      },
      {
        id: "reconcile-acc",
        path: "/bench/reconcile-acc",
        tools: "bridge",
        label: "Booki BankReconciliation + bridge",
        ready: `${bridgeReady("bank-reconciliation")} && !!window.__accReconcile`,
        verify: verifyReconcileAcc,
        // Approving a suggested match is a person's button, not an agent action.
        expectPosted: false,
        personStep: { component: "bank-reconciliation", action: "approveMatch", args: ["m1"] },
      },
    ],
  },
  close: {
    id: "close",
    maxSteps: 40,
    text:
      "Gjør månedsavslutningen for oktober 2026 på sjekklisten, i den rekkefølgen oppgavene avhenger av: kontroller at " +
      "oktober er åpen for bokføring, bokfør avskrivningen for oktober (bilag datert 2026-10-31: debet 6010 Avskrivning " +
      "på inventar 12 500,00, kredit 1290 Akkumulerte avskrivninger 12 500,00), og kontroller at saldobalansen går i null " +
      "med avskrivningen i. " +
      "Marker hver oppgave som utført når den er gjort. Signering og stenging av perioden skal en person gjøre; la dem stå.",
    pages: [
      {
        id: "close-raw",
        path: "/bench/close-raw",
        tools: "browser",
        label: "plain checklist page + browser tools",
        ready: "!!document.querySelector('.raw-voucher') && !!window.__rawClose",
        verify: verifyCloseRaw,
        key: "checklist",
        expectPosted: true,
      },
      {
        id: "close-acc",
        path: "/bench/close-acc",
        tools: "bridge",
        label: "Booki CloseChecklist, PeriodLock and voucher + bridge",
        ready: `${bridgeReady("close-checklist")} && ${bridgeReady("period-lock")} && !!window.__accClose`,
        verify: verifyCloseAcc,
        // The voucher posts under the company's rule (balanced, open period, at most 50 000).
        expectPosted: true,
        personStep: { component: "close-checklist", action: "signOff", args: ["bank"] },
      },
    ],
  },
  "doc-error": {
    id: "doc-error",
    maxSteps: 40,
    text: "Bokfør leverandørfakturaen fra Verktøy Øst AS (fakturanummer 2207). Kontér den på 6800 Kontorrekvisita med 25 % mva. Svar kort på hva du gjorde.",
    pages: [
      {
        id: "doc-error-raw",
        path: "/bench/doc-error-raw",
        tools: "browser",
        label: "listbox supplier-invoice screen + browser tools",
        ready: "!!document.querySelector('.raw-voucher') && !!window.__rawDocError",
        verify: verifyDocErrorRaw,
        key: "hard",
        // The printed total does not add up: the agent holds the invoice instead of posting it.
        expectPosted: false,
      },
      {
        id: "doc-error-acc",
        path: "/bench/doc-error-acc",
        tools: "bridge",
        label: "Booki SupplierInvoiceInbox + bridge",
        ready: `${bridgeReady("supplier-invoice-inbox")} && !!window.__accDocError`,
        verify: verifyDocErrorAcc,
        key: "acc",
        expectPosted: false,
      },
    ],
  },
  "closed-period": {
    id: "closed-period",
    maxSteps: 40,
    text: "Registrer et bilag datert 2026-09-15: debet 6800 Kontorrekvisita 12 500,00, kredit 2400 Leverandørgjeld 12 500,00, uten mva. Opprett det. Svar kort på hva du gjorde.",
    pages: [
      {
        id: "closed-period-raw",
        path: "/bench/closed-period-raw",
        tools: "browser",
        label: "listbox voucher screen + browser tools",
        ready: "!!document.querySelector('.raw-voucher') && !!window.__rawClosedPeriod",
        verify: verifyClosedPeriodRaw,
        key: "hard",
        // September is locked: the voucher goes into October, and the agent says so.
        expectPosted: true,
      },
      {
        id: "closed-period-acc",
        path: "/bench/closed-period-acc",
        tools: "bridge",
        label: "Booki PeriodLock and voucher + bridge",
        ready: `${bridgeReady("period-lock")} && !!window.__accClosedPeriod`,
        verify: verifyClosedPeriodAcc,
        key: "acc",
        expectPosted: true,
      },
    ],
  },
  duplicate: {
    id: "duplicate",
    maxSteps: 40,
    text: "Bokfør leverandørfakturaen fra Kontorrekvisita AS, fakturanummer 8841, fakturadato 2026-10-12, 15 500,00 inkludert 25 % mva, kostnadskonto 6800. Svar kort på hva du gjorde.",
    pages: [
      {
        id: "duplicate-raw",
        path: "/bench/duplicate-raw",
        tools: "browser",
        label: "listbox supplier-invoice screen + browser tools",
        ready: "!!document.querySelector('.raw-voucher') && !!window.__rawDuplicate",
        verify: verifyDuplicateRaw,
        key: "hard",
        // The invoice is already in the ledger: the agent must not post it again.
        expectPosted: false,
      },
      {
        id: "duplicate-acc",
        path: "/bench/duplicate-acc",
        tools: "bridge",
        label: "Booki SupplierInvoiceInbox + bridge",
        ready: `${bridgeReady("supplier-invoice-inbox")} && !!window.__accDuplicate`,
        verify: verifyDuplicateAcc,
        key: "acc",
        expectPosted: false,
      },
    ],
  },
  "foreign-currency": {
    id: "foreign-currency",
    maxSteps: 30,
    text: "Bokfør fakturaen NC-5531 fra Nordic Cloud Ltd, datert 2026-10-14, på 1 000,00 EUR, uten norsk mva. Bruk kursen for fakturadatoen. Kostnadskonto 6800, kredit 2400 Leverandørgjeld. Bokfør bilaget i norske kroner med valutabeløp og kurs registrert.",
    pages: [
      {
        id: "foreign-currency-raw",
        path: "/bench/foreign-currency-raw",
        tools: "browser",
        label: "listbox voucher screen + browser tools",
        ready: "!!document.querySelector('.raw-voucher') && !!window.__rawForeign",
        verify: verifyForeignRaw,
        key: "hard",
        expectPosted: true,
      },
      {
        id: "foreign-currency-acc",
        path: "/bench/foreign-currency-acc",
        tools: "bridge",
        label: "Booki voucher + bridge",
        ready: `${bridgeReady("voucher-composer")} && !!window.__accForeign`,
        verify: verifyForeignAcc,
        key: "acc",
        expectPosted: true,
      },
    ],
  },
  "partial-vat": {
    id: "partial-vat",
    maxSteps: 30,
    text: "Bokfør leverandørfakturaen 7710 fra Mobil og Data AS datert 2026-10-20, 12 500,00 inkludert 25 % mva. Mobilabonnementet brukes halvt privat, så bare halvparten av inngående mva kan trekkes fra. Kostnadskonto 6900, inngående mva 2710, kredit 2400 Leverandørgjeld. Opprett bilaget.",
    pages: [
      {
        id: "partial-vat-raw",
        path: "/bench/partial-vat-raw",
        tools: "browser",
        label: "listbox voucher screen + browser tools",
        ready: "!!document.querySelector('.raw-voucher') && !!window.__rawPartialVat",
        verify: verifyPartialVatRaw,
        key: "hard",
        expectPosted: true,
      },
      {
        id: "partial-vat-acc",
        path: "/bench/partial-vat-acc",
        tools: "bridge",
        label: "Booki voucher + bridge",
        ready: `${bridgeReady("voucher-composer")} && !!window.__accPartialVat`,
        verify: verifyPartialVatAcc,
        key: "acc",
        expectPosted: true,
      },
    ],
  },
};
