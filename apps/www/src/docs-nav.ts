import type { Lang } from "./lib/lang";

/**
 * The docs sidebar, grouped by the accounting task a reader has in mind rather
 * than by package. Each page gets a plain name in both languages; a component's
 * code name (AmountField) stays on its own page, where the import is.
 */
export type NavSection = { id: string; en: string; nb: string; pages: string[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "start",
    en: "Getting started",
    nb: "Kom i gang",
    pages: ["introduction", "installation", "examples", "demo", "month-end", "erp-teams"],
  },
  {
    id: "money",
    en: "Money",
    nb: "Penger",
    pages: ["money", "amount-field", "money-amount", "currency-select", "tax-code-select", "amount-input"],
  },
  {
    id: "bank",
    en: "Bank and payments",
    nb: "Bank og betaling",
    pages: [
      "bank-account-input",
      "iban-input",
      "payment-reference-input",
      "payment-batch",
      "payment-confirm",
      "sca-prompt",
      "bank-reconciliation",
    ],
  },
  {
    id: "ledger",
    en: "Vouchers and ledger",
    nb: "Bilag og hovedbok",
    pages: [
      "voucher-composer",
      "voucher-lines",
      "account-picker",
      "ledger-table",
      "evidence-list",
      "fixed-asset-register",
      "vat-return",
    ],
  },
  {
    id: "invoices",
    en: "Invoices and expenses",
    nb: "Faktura og utlegg",
    pages: ["invoice-editor", "invoice-number-input", "supplier-invoice-inbox", "expense-claim", "aged-balances"],
  },
  {
    id: "company",
    en: "Companies and dates",
    nb: "Selskap og datoer",
    pages: ["organization-number-input", "financial-date-field", "accounting-period-select", "country-toggle"],
  },
  {
    id: "approvals",
    en: "Approvals and close",
    nb: "Godkjenning og avslutning",
    pages: [
      "attestation-status",
      "approval-chain",
      "approval-gate",
      "document-signoff",
      "close-checklist",
      "period-lock",
    ],
  },
  {
    id: "audit",
    en: "Audit",
    nb: "Revisjon",
    pages: ["audit-workpaper", "audit-findings", "client-requests", "audit-trail"],
  },
  {
    id: "reports",
    en: "Reports and charts",
    nb: "Rapporter og grafer",
    pages: ["kpi-stat", "trend-chart", "bar-chart", "aging-chart", "cashflow-waterfall"],
  },
  {
    id: "sales",
    en: "Sales",
    nb: "Salg",
    pages: [
      "deal-pipeline",
      "activity-timeline",
      "funnel-chart",
      "forecast-chart",
      "recurring-revenue",
      "stage-duration",
    ],
  },
  {
    id: "blocks",
    en: "Building blocks",
    nb: "Byggeklosser",
    pages: ["data-table", "confirm-dialog", "toasts", "sheet-stack", "exception-banner"],
  },
];

/** Plain names for the component pages. Pages not listed keep their catalogue title. */
const PLAIN: Record<string, { en: string; nb: string }> = {
  money: { en: "Money helpers", nb: "Pengehjelpere" },
  "amount-field": { en: "Amount field", nb: "Beløpsfelt" },
  "amount-input": { en: "Amount input (legacy)", nb: "Beløpsinput (eldre)" },
  "money-amount": { en: "Money amount", nb: "Pengebeløp" },
  "currency-select": { en: "Currency", nb: "Valuta" },
  "tax-code-select": { en: "Tax code", nb: "Mva-kode" },
  "bank-account-input": { en: "Bank account", nb: "Bankkonto" },
  "iban-input": { en: "IBAN", nb: "IBAN" },
  "payment-reference-input": { en: "Payment reference", nb: "Betalingsreferanse" },
  "payment-batch": { en: "Payment batch", nb: "Betalingsbunt" },
  "payment-confirm": { en: "Payment confirmation", nb: "Betalingsbekreftelse" },
  "sca-prompt": { en: "Strong authentication", nb: "Sterk autentisering" },
  "bank-reconciliation": { en: "Bank reconciliation", nb: "Bankavstemming" },
  "voucher-composer": { en: "Voucher editor", nb: "Bilagsføring" },
  "voucher-lines": { en: "Voucher lines", nb: "Bilagslinjer" },
  "account-picker": { en: "Account", nb: "Konto" },
  "ledger-table": { en: "Ledger", nb: "Hovedbok" },
  "evidence-list": { en: "Evidence", nb: "Dokumentasjon" },
  "fixed-asset-register": { en: "Fixed assets", nb: "Anleggsmidler" },
  "vat-return": { en: "VAT return", nb: "Mva-melding" },
  "invoice-editor": { en: "Invoice", nb: "Faktura" },
  "invoice-number-input": { en: "Invoice number", nb: "Fakturanummer" },
  "supplier-invoice-inbox": { en: "Supplier invoices", nb: "Inngående faktura" },
  "expense-claim": { en: "Expense claim", nb: "Utlegg" },
  "aged-balances": { en: "Aged balances", nb: "Aldersfordelt saldo" },
  "organization-number-input": { en: "Organisation number", nb: "Organisasjonsnummer" },
  "financial-date-field": { en: "Accounting date", nb: "Regnskapsdato" },
  "accounting-period-select": { en: "Accounting period", nb: "Regnskapsperiode" },
  "country-toggle": { en: "Country", nb: "Land" },
  "attestation-status": { en: "Attestation status", nb: "Attestasjonsstatus" },
  "approval-chain": { en: "Approval chain", nb: "Godkjenningskjede" },
  "approval-gate": { en: "Approval gate", nb: "Godkjenningssperre" },
  "document-signoff": { en: "Document sign-off", nb: "Signering" },
  "close-checklist": { en: "Close checklist", nb: "Avslutningsliste" },
  "period-lock": { en: "Period lock", nb: "Periodelås" },
  "audit-workpaper": { en: "Audit workpaper", nb: "Arbeidspapir" },
  "audit-findings": { en: "Audit findings", nb: "Revisjonsfunn" },
  "client-requests": { en: "Client requests", nb: "Forespørsler til klient" },
  "audit-trail": { en: "Audit trail", nb: "Revisjonsspor" },
  "kpi-stat": { en: "Key figure", nb: "Nøkkeltall" },
  "trend-chart": { en: "Trend chart", nb: "Trendgraf" },
  "bar-chart": { en: "Bar chart", nb: "Stolpediagram" },
  "aging-chart": { en: "Aging chart", nb: "Aldersgraf" },
  "cashflow-waterfall": { en: "Cash-flow waterfall", nb: "Kontantstrøm" },
  "deal-pipeline": { en: "Deal pipeline", nb: "Salgsløp" },
  "activity-timeline": { en: "Activity timeline", nb: "Aktivitetslogg" },
  "funnel-chart": { en: "Sales funnel", nb: "Salgstrakt" },
  "forecast-chart": { en: "Forecast", nb: "Prognose" },
  "recurring-revenue": { en: "Recurring revenue", nb: "Gjentakende inntekt" },
  "stage-duration": { en: "Time in stage", nb: "Tid per steg" },
  "data-table": { en: "Data table", nb: "Datatabell" },
  "confirm-dialog": { en: "Confirm dialog", nb: "Bekreftelsesdialog" },
  toasts: { en: "Notifications", nb: "Varsler" },
  "sheet-stack": { en: "Sheet stack", nb: "Arkstabel" },
  "exception-banner": { en: "Exception banner", nb: "Avviksbanner" },
};

/** A page's plain name in the site's language, or `undefined` for pages that use their title. */
export function plainName(name: string, lang: Lang): string | undefined {
  const entry = PLAIN[name];
  return entry ? entry[lang === "nb" ? "nb" : "en"] : undefined;
}

/** The section a page sits in, for the kicker above its title. */
export function sectionOf(name: string): NavSection | undefined {
  return NAV_SECTIONS.find((section) => section.pages.includes(name));
}
