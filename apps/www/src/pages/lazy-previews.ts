import { lazy } from "react";

const gapNames = [
  "kpi-stat",
  "trend-chart",
  "bar-chart",
  "aging-chart",
  "cashflow-waterfall",
  "supplier-invoice-inbox",
  "evidence-list",
  "expense-claim",
  "ledger-table",
  "aged-balances",
  "vat-return",
  "audit-workpaper",
  "audit-findings",
  "confirm-dialog",
  "toasts",
  "document-signoff",
  "document-editor",
  "sheet-stack",
  "agent-status",
  "client-requests",
  "deal-pipeline",
  "funnel-chart",
  "forecast-chart",
  "recurring-revenue",
  "stage-duration",
  "activity-timeline",
  "chart-of-accounts",
  "fixed-asset-register",
  "data-table",
] as const;
export type GapName = (typeof gapNames)[number];
export const gapPreviews = Object.fromEntries(
  gapNames.map((name) => [name, lazy(async () => ({ default: (await import("./gap-previews")).GAP_PREVIEWS[name] }))]),
);

const blockNames = [
  "icon-button",
  "text-link",
  "card",
  "field",
  "toolbar",
  "agent-cursor",
  "agent-presence",
  "agent-proposal",
] as const;
export type BlockName = (typeof blockNames)[number];
export const blockPreviews = Object.fromEntries(
  blockNames.map((name) => [
    name,
    lazy(async () => ({ default: (await import("./block-previews")).BLOCK_PREVIEWS[name] })),
  ]),
);
