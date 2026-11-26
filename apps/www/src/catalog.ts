export type CatalogItem = {
  name: string;
  title: string;
  description: string;
  group: "Getting started" | "Core" | "React";
  install: string;
};

export function installCmd(pkg: string): string {
  return `pnpm add ${pkg}`;
}

export const catalog: CatalogItem[] = [
  {
    name: "introduction",
    title: "Overview",
    description: "Package map and entry points for @booki-aui/core, react, and styles.",
    group: "Getting started",
    install: "",
  },
  {
    name: "installation",
    title: "Installation",
    description: "Install @booki-aui/core, @booki-aui/react, and optional styles.",
    group: "Getting started",
    install: "",
  },
  {
    name: "examples",
    title: "Examples",
    description:
      "One invoice on a plain form and on Booki, the controls in different setups, and a control of your own.",
    group: "Getting started",
    install: "",
  },
  {
    name: "icons",
    title: "Icons",
    description: "Duotone icons for accounting UI: search them, copy the import, use them in React or any framework.",
    group: "Getting started",
    install: "",
  },
  {
    name: "demo",
    title: "Demo",
    description: "A working sales-invoice screen an agent can operate, with the human gates in place.",
    group: "Getting started",
    install: "",
  },
  {
    name: "month-end",
    title: "Month-end",
    description:
      "A month-end close an agent works through: checklist, period lock, reconciliation and the closing voucher.",
    group: "Getting started",
    install: "",
  },
  {
    name: "erp-teams",
    title: "For ERP teams",
    description: "What a one-screen pilot takes, and what is not ready yet.",
    group: "Getting started",
    install: "",
  },
  {
    name: "money",
    title: "Money",
    description: "Integer minor-unit Money helpers from @booki-aui/core.",
    group: "Core",
    install: installCmd("@booki-aui/core"),
  },
  {
    name: "amount-field",
    title: "AmountField",
    description: "definePrimitive amount — agent setMinor / clear; integer minor units in and out.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "amount-input",
    title: "AmountInput",
    description: "Compat wrapper around AmountField (legacy Money callback).",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "money-amount",
    title: "MoneyAmount",
    description: "Display Money with tabular nums and locale currency.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "currency-select",
    title: "CurrencySelect",
    description: "NOK / USD currency picker (extensible).",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "bank-account-input",
    title: "BankAccountInput",
    description: "Kontonummer (NO) or ABA routing + account (US).",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "payment-reference-input",
    title: "PaymentReferenceInput",
    description: "KID (NO) or payment memo (US).",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "organization-number-input",
    title: "OrganizationNumberInput",
    description: "Norwegian orgnr (mod11) or US EIN.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "iban-input",
    title: "IbanInput",
    description: "IBAN with checksum; secret; derives NO kontonummer.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "financial-date-field",
    title: "FinancialDateField",
    description: "Invoice, due, or posting date (ISO) for agents.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "accounting-period-select",
    title: "AccountingPeriodSelect",
    description: "Closed year / month / VAT-term period picker.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "invoice-number-input",
    title: "InvoiceNumberInput",
    description: "Supplier or sales invoice / document number.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "attestation-status",
    title: "AttestationStatus",
    description: "Shows whether an entry is pending, approved or rejected. A person decides.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "voucher-lines",
    title: "VoucherLines",
    description: "Read-only debit/credit table with balance footer.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "voucher-composer",
    title: "VoucherComposer",
    description: "Agent-operable journal — addLine, setDebit/Credit, assertBalance.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "bank-reconciliation",
    title: "BankReconciliation",
    description: "Match bank lines to open posts. An agent suggests matches; a person approves them.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "approval-chain",
    title: "ApprovalChain",
    description:
      "Approval in levels with amount limits and substitutes. An agent reads where it stands; only the right person decides.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "period-lock",
    title: "PeriodLock",
    description:
      "Open, closed and locked periods. An agent asks whether a date can be posted; a person closes and locks.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "close-checklist",
    title: "CloseChecklist",
    description: "Period-close tasks in order. An agent prepares them; a second person signs off.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "invoice-editor",
    title: "InvoiceEditor",
    description: "Invoice and credit-note lines with totals computed from them. An agent drafts; a person finalizes.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "payment-batch",
    title: "PaymentBatch",
    description:
      "A payment run that needs two people. Account numbers stay hidden from an agent; duplicates are flagged.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "supplier-invoice-inbox",
    title: "SupplierInvoiceInbox",
    description:
      "Incoming supplier invoices with extracted fields. An agent corrects and codes them; a person approves. Duplicates are named.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "evidence-list",
    title: "EvidenceList",
    description:
      "Attachments linked to an entry. An agent links and classifies; the entry knows which evidence is still missing.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "expense-claim",
    title: "ExpenseClaim",
    description: "Expenses, mileage and per diem against a policy. Exceptions need a second person.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "ledger-table",
    title: "LedgerTable",
    description: "Trial balance with drill-down to an account and its vouchers. Read-only, and capped for an agent.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "aged-balances",
    title: "AgedBalances",
    description: "Receivables or payables by age. An agent asks who is overdue.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "vat-return",
    title: "VatReturn",
    description: "A VAT return computed from a schema you supply. An agent checks it; a person submits.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "audit-workpaper",
    title: "AuditWorkpaper",
    description:
      "Materiality, a reproducible sample, tick marks and two sign-offs. An agent tests; people conclude and sign.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "audit-findings",
    title: "AuditFindings",
    description:
      "The engagement's findings, each with its basis and evidence. An agent drafts and cites; a person confirms or withdraws, and a confidential finding stays unread.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "client-requests",
    title: "ClientRequests",
    description:
      "Requests to the client, with due dates and answers. An agent drafts and records answers; a person sends, reminds and judges. The email never reaches the agent.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "deal-pipeline",
    title: "DealPipeline",
    description:
      "A sales board: deals in stages, each stage's totals per currency and a weighted forecast. An agent moves, values and assigns deals; a value without a source is shown, never summed; won and lost are a person's.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "activity-timeline",
    title: "ActivityTimeline",
    description:
      "A customer's history and next steps: calls, emails, meetings, notes and tasks. An agent logs and schedules, marked as the agent's; a call says what it can be checked against; removing an entry is a person's.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "funnel-chart",
    title: "FunnelChart",
    description:
      "How many deals reached each stage, the conversion from the step before and from the start, and where the most are lost. An agent reads every figure and drills into a step.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "forecast-chart",
    title: "ForecastChart",
    description:
      "Won, committed, best case and weighted revenue per month or quarter, from the same deals as the pipeline. Lost deals and amounts without a source are left out, and undated deals are named.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "recurring-revenue",
    title: "RecurringRevenue",
    description:
      "Recurring revenue from one date to another: opening, new, expansion, contraction, churn and closing, adding up exactly, as MRR or ARR. Each movement names its customers.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "stage-duration",
    title: "StageDurationChart",
    description:
      "How long deals stay in each stage: the median and the longest stay, a target per stage, and the deals over it.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "button",
    title: "Button",
    description:
      "A plain button in three weights: primary for the one action that matters in a section, secondary for the other choices, ghost for a quiet action inside another surface. An agent presses it by its words; data-agent-confirm keeps a person's step for the person.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "confirm-dialog",
    title: "ConfirmDialog",
    description:
      "A question a person answers before something happens: post, pay, release. An agent can read it and cancel, never agree; a typed word and async work are built in.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "toasts",
    title: "BookiToasts",
    description:
      "Receipts for what just happened. What an agent did carries the agent's mark, with Undo, through useAgentToasts.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "document-signoff",
    title: "DocumentSignoff",
    description:
      "The sign-off line that ends a working paper: performed, reviewed, approved, each bound to the version signed. Open points go with the signature by default; a company can set blockOpenPoints to refuse a signature until they are closed. A later edit marks it, never withdraws it.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "sheet-stack",
    title: "SheetStack",
    description:
      "A page and the sheets opened from it, stacked, with a ledger docked beside it on a wide screen. Only the top sheet takes input; an agent can go back and close.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "fixed-asset-register",
    title: "FixedAssetRegister",
    description: "Assets, depreciation schedules and a proposed run. An agent proposes; a person confirms.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "data-table",
    title: "DataTable",
    description:
      "Any list of records with what people expect: sort, search, filter per column, pages, columns, selection, totals, CSV and empty, loading and error states. Columns are data; agents read the page and the counts, and call the same actions.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "kpi-stat",
    title: "KpiStat",
    description:
      "One figure against the period before, with a sparkline. You say whether up is good; the agent reads the value, the change and whether it is favourable.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "trend-chart",
    title: "TrendChart",
    description:
      "Months or quarters for one or more series, with a range switch and drill-down. The agent reads every period as minor units, not pixels.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "bar-chart",
    title: "BarChart",
    description:
      "Largest first, the rest folded into Other. Cost per account, revenue per customer; the agent can change the limit and drill into a bar.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "aging-chart",
    title: "AgingChart",
    description:
      "Receivables or payables by age: not due, 1–30, 31–60, 61–90, over 90 days, with the share overdue and the largest late parties.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "cashflow-waterfall",
    title: "CashflowWaterfall",
    description: "Opening balance, every in and out, closing balance, and a check that they add up.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "account-picker",
    title: "AccountPicker",
    description: "Unambiguous chart-of-accounts selection.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "tax-code-select",
    title: "TaxCodeSelect",
    description: "NO MVA / US sales-tax codes from BookiLocale profile.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "payment-confirm",
    title: "PaymentConfirm",
    description: "Typed APPROVE + data-agent-confirm.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "approval-gate",
    title: "ApprovalGate",
    description: "Attestation dialog for agent proposals.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "exception-banner",
    title: "ExceptionBanner",
    description: "Escalate / stop for human review.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "sca-prompt",
    title: "ScaPrompt",
    description: "BankID (NO) or Passkey (US) mock SCA.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "audit-trail",
    title: "AuditTrail",
    description: "Who changed what — including agent actors.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
  {
    name: "country-toggle",
    title: "CountryToggle",
    description: "Switch BookiLocale between Norway and US.",
    group: "React",
    install: installCmd("@booki-aui/react"),
  },
];

export function getCatalogItem(name: string): CatalogItem | undefined {
  return catalog.find((item) => item.name === name);
}
