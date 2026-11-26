/**
 * @booki-aui/primitives: every Booki control's ui-sdk definition, with its option
 * and state types and its pure helpers. No framework: render a definition
 * with the `createParts` of @ui-sdk/react, @ui-sdk/web, @ui-sdk/vue,
 * @ui-sdk/svelte or @ui-sdk/solid.
 *
 * Generic names that several controls share (`Options`, `Details`) are
 * exported here under the control's name, e.g. `PeriodLockOptions`. Helpers
 * that share a name (`derive`, `EMPTY`, ...) are only on each control's own
 * entry, e.g. `@booki-aui/primitives/period-lock`.
 */

// Brings ui-sdk's public renderer types into the build, so the emitted
// declarations name them from "@ui-sdk/core/renderer" rather than inlining
// ui-sdk's private files.
import type {} from "@ui-sdk/core/renderer";

export {
  lockOptions,
  type LockOptions,
  type LockState,
  lockState,
  isLocked,
  inputLockAttrs,
  selectLockAttrs,
  restoreSelect,
} from "./lock.js";
export { refuseDenied } from "./access.js";
export {
  type ChartRange,
  CHART_RANGES,
  type PeriodValue,
  isPeriod,
  monthIndex,
  periodAt,
  isChartRange,
  rangePeriods,
  percentChange,
  sharePercent,
  round1,
  type Direction,
  directionOf,
  type SeriesSummary,
  summarize,
  niceStep,
  type Ticks,
  niceTicks,
  linearScale,
  linePath,
  barPath,
  type RankedItem,
  type RankedRow,
  rankWithOther,
  type WaterfallInput,
  type WaterfallStep as ChartMathWaterfallStep,
  waterfall,
  spreadLabels,
  labelEvery,
  DEFAULT_SNAPSHOT_POINTS,
  observeWidth,
  periodName,
  compactMoney,
  formatPercent,
  seriesColor,
} from "./chart-math.js";
export {
  type AgentItem as AccountPickerAgentItem,
  type AccountPickerOptions,
  type AccountPickerState,
  resolveAccount,
  accountPicker,
} from "./account-picker.js";
export {
  type AgentItem as AccountingPeriodSelectAgentItem,
  type AccountingPeriodOptions,
  type AccountingPeriodState,
  buildItems,
  resolveInitial,
  accountingPeriod,
} from "./accounting-period-select.js";
export {
  type Details as AgedBalancesDetails,
  type Options as AgedBalancesOptions,
  type AgingTotals,
  type AgedParty,
  agedBalances,
} from "./aged-balances.js";
export {
  type Details as AgingChartDetails,
  type AgingBucketTotal,
  type AgingChartDrilled,
  type Options as AgingChartOptions,
  DEFAULT_TOP,
  report,
  agingChart,
} from "./aging-chart.js";
export {
  type AmountFieldOptions,
  type AmountFieldState,
  formatMinor,
  rangeError,
  amountField,
} from "./amount-field.js";
export {
  type Options as ApprovalChainOptions,
  approvalChain,
} from "./approval-chain.js";
export {
  type AttestationStatusValue,
  type AgentItem as AttestationStatusAgentItem,
  type AttestationStatusOptions,
  type AttestationStatusState,
  statusLabelFor,
  attestationStatus,
} from "./attestation-status.js";
export {
  type Options as DocumentSignoffOptions,
  type LevelView,
  documentSignoff,
} from "./document-signoff.js";
export { type Options as SheetStackOptions, sheetStack } from "./sheet-stack.js";
export {
  type AgentDecision,
  type AgentDecisionRow,
  type AgentPolicyOptions,
  type AgentPolicyStep,
  actAndRecord,
  withRecordedAct,
  bookiAllow,
  bookiRegisterTools,
  isAllowed,
} from "./agent-policy.js";
export { isPersonOnly, personOnly } from "./person-only.js";
export {
  type Options as AuditFindingsOptions,
  type FindingEvidence,
  FINDING_FORMAT,
  nextFindingId,
  auditFindings,
} from "./audit-findings.js";
export {
  type Options as AuditWorkpaperOptions,
  type DrawSampleOptions,
  figures,
  signed,
  auditWorkpaper,
} from "./audit-workpaper.js";
export {
  type BankAccountValue,
  type BankKind,
  type BankAccountOptions,
  type BankAccountState,
  toValue,
  bankAccount,
} from "./bank-account-input.js";
export {
  type BankReconciliationOptions,
  nextId,
  bankReconciliation,
} from "./bank-reconciliation.js";
export {
  type Details as BarChartDetails,
  type BarItem,
  type BarRow,
  type Options as BarChartOptions,
  validLimit,
  barChart,
} from "./bar-chart.js";
export {
  type Details as CashflowWaterfallDetails,
  type CashflowStep,
  type WaterfallStep as CashflowWaterfallWaterfallStep,
  type Options as CashflowWaterfallOptions,
  cashflowWaterfall,
} from "./cashflow-waterfall.js";
export {
  type Options as ClientRequestsOptions,
  REQUEST_FORMAT,
  nextRequestId,
  clientRequests,
} from "./client-requests.js";
export {
  type Options as DealPipelineOptions,
  type PipelineOwner,
  DEAL_FORMAT,
  dealPipeline,
} from "./deal-pipeline.js";
export {
  type Options as ActivityTimelineOptions,
  type TimelinePerson,
  ACTIVITY_FORMAT,
  activityTimeline,
} from "./activity-timeline.js";
export { type Options as FunnelChartOptions, funnelChart } from "./funnel-chart.js";
export { type Options as ForecastChartOptions, forecastChart } from "./forecast-chart.js";
export { type Options as RecurringRevenueOptions, recurringRevenue } from "./recurring-revenue.js";
export { type Options as StageDurationOptions, stageDuration } from "./stage-duration.js";
export {
  type Options as CloseChecklistOptions,
  closeChecklist,
} from "./close-checklist.js";
export {
  DEFAULT_CURRENCIES,
  type AgentItem as CurrencySelectAgentItem,
  type CurrencySelectOptions,
  type CurrencySelectState,
  currencySelect,
} from "./currency-select.js";
export {
  type DataTableColumn,
  type AnyRow,
  type Options as DataTableOptions,
  idOf,
  initialQuery,
  dataTable,
} from "./data-table.js";
export {
  type Options as EvidenceListOptions,
  evidenceList,
} from "./evidence-list.js";
export {
  type Options as ExpenseClaimOptions,
  NO_POLICY,
  type ExpenseExceptionState,
  policyOf,
  todayOf,
  closed,
  heldAsDraft,
  expenseClaim,
} from "./expense-claim.js";
export {
  type FinancialDateOptions,
  type FinancialDateState,
  defaultLabel,
  financialDate,
} from "./financial-date-field.js";
export {
  type Details as ChartOfAccountsDetails,
  type Options as ChartOfAccountsOptions,
  type ChartTaxCode,
  type StandardAccount,
  type ChartRow,
  type ChartClassSummary,
  type EditableField,
  PROPOSE_FORMAT,
  chartColumns,
  matchingAccounts,
  activeKey,
  cellKey,
  chartOfAccounts,
} from "./chart-of-accounts.js";
export {
  type Details as FixedAssetRegisterDetails,
  type Options as FixedAssetRegisterOptions,
  type AssetRow,
  DEFAULT_EXPENSE,
  DEFAULT_ACCUMULATED,
  thisMonth,
  type Core,
  runOptions,
  fixedAssetRegister,
} from "./fixed-asset-register.js";
export {
  type IbanOptions,
  type IbanState,
  ibanInput,
} from "./iban-input.js";
export {
  type Options as InvoiceEditorOptions,
  type InvoiceLinePatch,
  safeTotals,
  nextLineId,
  invoiceEditor,
} from "./invoice-editor.js";
export {
  type InvoiceNumberOptions,
  type InvoiceNumberState,
  invoiceNumber,
} from "./invoice-number-input.js";
export {
  type KpiGood,
  type Options as KpiStatOptions,
  SPARK_POINTS,
  kpiStat,
} from "./kpi-stat.js";
export {
  type Details as LedgerTableDetails,
  type LedgerVoucherRef,
  type LedgerView,
  type LedgerDocument,
  type LedgerVoucherSummary,
  type Options as LedgerTableOptions,
  DEFAULT_PAGE_SIZE,
  range,
  voucherLines,
  voucherSummary,
  bound,
  ledgerTable,
} from "./ledger-table.js";
export {
  type OrganizationNumberOptions,
  type OrganizationNumberState,
  organizationNumber,
} from "./organization-number-input.js";
export {
  type Options as PaymentBatchOptions,
  type PaymentSummary,
  paymentBatch,
} from "./payment-batch.js";
export {
  type RefKind,
  type PaymentReferenceOptions,
  type PaymentReferenceState,
  normalizeValue,
  computeValid,
  paymentReference,
} from "./payment-reference-input.js";
export {
  type Options as PeriodLockOptions,
  periodLock,
} from "./period-lock.js";
export {
  type Options as SupplierInvoiceInboxOptions,
  type SupplierInvoiceSummary,
  AMOUNTS,
  SECRET_FIELD,
  contextOf,
  supplierInvoiceInbox,
} from "./supplier-invoice-inbox.js";
export {
  type AgentItem as TaxCodeSelectAgentItem,
  type TaxCodeSelectOptions,
  type TaxCodeSelectState,
  resolveCode,
  taxCodeSelect,
} from "./tax-code-select.js";
export {
  type Details as TrendChartDetails,
  type TrendSeries,
  type TrendSeriesSnapshot,
  type TrendDrilled,
  type Options as TrendChartOptions,
  type Clean,
  clean,
  DEFAULT_RANGE,
  trendChart,
} from "./trend-chart.js";
export {
  type Details as VatReturnDetails,
  type VatBoxSummary,
  type VatReturnSubmission,
  type Options as VatReturnOptions,
  NO_BOXES,
  compute,
  drill,
  vatReturn,
} from "./vat-return.js";
export {
  type VoucherComposerOptions,
  type LineField,
  type RowError,
  type EditState,
  InvalidAmountError,
  draftKey,
  lineOf,
  amountText,
  type LineExtras,
  rulesOf,
  postingOf,
  withBalance,
  voucherComposer,
} from "./voucher-composer.js";
