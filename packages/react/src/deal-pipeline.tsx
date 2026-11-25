import { formatMoney } from "@booki-aui/core/money";
import type {
  CurrencyTotals,
  Deal,
  DealOutcome,
  DealValueStatus,
  PipelineStage,
  StageSummary,
} from "@booki-aui/core/pipeline";
import { createParts } from "@ui-sdk/react/primitive";
import type { ReactNode } from "react";
import type { BookiChangeDetails } from "./change-details.js";
import { useAccessFor } from "./access.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { buttonKey, dealPipeline, type PipelineOwner } from "@booki-aui/primitives/deal-pipeline";

const parts = createParts(dealPipeline, {
  root: "div",
  move: "select",
  won: "button",
  reason: "textarea",
  lost: "button",
  reopen: "button",
});
const DealPipelineRoot = parts.Root;
/** A person's stage picker on one deal: `value` is the deal id. */
const DealPipelineMove = parts.Move;
const DealPipelineWon = parts.Won;
const DealPipelineReason = parts.Reason;
const DealPipelineLost = parts.Lost;
const DealPipelineReopen = parts.Reopen;

const COPY = {
  EN: {
    label: "Sales pipeline",
    forecast: "Weighted forecast",
    none: "No deals",
    noValue: "No value",
    deals: (n: number) => (n === 1 ? "1 deal" : `${n} deals`),
    weighted: "weighted",
    unverified: (n: number) => `${n} without a source`,
    stage: "Stage",
    close: "Expected close",
    owner: "Owner",
    won: "Mark won",
    lost: "Mark lost",
    reopen: "Reopen",
    reason: "Why it was lost",
    closedBy: "Closed by",
    status: { known: "Known", estimate: "Estimate", unknown: "Unverified" } satisfies Record<DealValueStatus, string>,
    outcome: { won: "Won", lost: "Lost" } satisfies Record<DealOutcome, string>,
  },
  NO: {
    label: "Salgsløp",
    forecast: "Vektet prognose",
    none: "Ingen avtaler",
    noValue: "Ingen verdi",
    deals: (n: number) => (n === 1 ? "1 avtale" : `${n} avtaler`),
    weighted: "vektet",
    unverified: (n: number) => `${n} uten kilde`,
    stage: "Fase",
    close: "Forventet lukket",
    owner: "Ansvarlig",
    won: "Marker vunnet",
    lost: "Marker tapt",
    reopen: "Åpne igjen",
    reason: "Hvorfor den ble tapt",
    closedBy: "Lukket av",
    status: { known: "Kjent", estimate: "Estimat", unknown: "Ubekreftet" } satisfies Record<DealValueStatus, string>,
    outcome: { won: "Vunnet", lost: "Tapt" } satisfies Record<DealOutcome, string>,
  },
} as const;

export type DealPipelineProps = {
  stages: PipelineStage[];
  deals?: Deal[];
  defaultDeals?: Deal[];
  /** Who may own a deal; the agent's `setOwner` takes only these. */
  owners?: PipelineOwner[];
  /** Today as YYYY-MM-DD, for deals past their expected close. */
  today?: string;
  /** Days in one stage before a deal is called stale. Defaults to 30. */
  staleDays?: number;
  actor?: string;
  onDealsChange?: (deals: Deal[], details: BookiChangeDetails) => void;
  /** A person's name for an id in `closedBy`. */
  nameOf?: (id: string) => ReactNode;
  className?: string;
  "aria-label"?: string;
};

type RootState = {
  deals: Deal[];
  stages: PipelineStage[];
  owners: PipelineOwner[];
  summary: StageSummary[];
  forecast: CurrencyTotals[];
  issues: Record<string, string[]>;
  drafts: Record<string, string>;
  refusal: string;
};

/** Composed board: one column per stage with its totals, a card per deal, and a person's won and lost buttons. */
function DealPipeline({
  stages,
  deals,
  defaultDeals,
  owners,
  today,
  staleDays,
  actor,
  onDealsChange,
  nameOf = (id) => id,
  className,
  "aria-label": ariaLabel,
}: DealPipelineProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const access = useAccessFor({ closeWon: "deal.close", closeLost: "deal.close", reopen: "deal.close" }, actor);
  const money = (minor: number, currency: string) =>
    formatMoney({ minor, currency }, { locale: profile.locale, trimZeroFraction: true });
  const date = (value: string) =>
    new Intl.DateTimeFormat(profile.locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
  const totalsLine = (totals: CurrencyTotals[]) =>
    totals
      .filter((total) => total.knownMinor + total.estimateMinor > 0)
      .map((total) => money(total.knownMinor + total.estimateMinor, total.currency))
      .join(" · ");
  return (
    <DealPipelineRoot
      deals={deals}
      defaultDeals={defaultDeals}
      stages={stages}
      owners={owners}
      today={today}
      staleDays={staleDays}
      actor={access.actor}
      denied={access.denied}
      onDealsChange={onDealsChange}
      className={className}
      aria-label={ariaLabel ?? copy.label}
    >
      {(state: RootState) => {
        const open = state.stages.filter((stage) => !stage.outcome);
        const ownerName = (id?: string) => state.owners.find((owner) => owner.id === id)?.name ?? id;
        return (
          <>
            <p data-slot="deal-pipeline-forecast" role="status">
              <span data-slot="deal-pipeline-label">{copy.forecast}</span>{" "}
              {state.forecast.length && state.forecast.some((total) => total.weightedMinor > 0)
                ? state.forecast
                    .filter((total) => total.weightedMinor > 0)
                    .map((total) => money(total.weightedMinor, total.currency))
                    .join(" · ")
                : "–"}
            </p>
            <div data-slot="deal-pipeline-board">
              {state.summary.map((column) => {
                const here = state.deals.filter((deal) => deal.stageId === column.stageId);
                const unverified = column.totals.reduce((n, total) => n + total.unverified, 0);
                return (
                  <section
                    key={column.stageId}
                    data-slot="deal-pipeline-stage"
                    data-outcome={column.outcome}
                    aria-label={column.name}
                  >
                    <header data-slot="deal-pipeline-stage-head">
                      <span data-slot="deal-pipeline-stage-name">{column.name}</span>
                      <span data-slot="deal-pipeline-stage-meta">
                        {copy.deals(column.count)}
                        {column.outcome ? "" : ` · ${column.probability} %`}
                      </span>
                      <span data-slot="deal-pipeline-stage-total">{totalsLine(column.totals) || "–"}</span>
                      {unverified ? (
                        <span data-slot="deal-pipeline-stage-unverified">{copy.unverified(unverified)}</span>
                      ) : null}
                    </header>
                    {here.length === 0 ? (
                      <p data-slot="deal-pipeline-empty">{copy.none}</p>
                    ) : (
                      <ul data-slot="deal-pipeline-deals">
                        {here.map((deal) => {
                          const issues = state.issues[deal.id] ?? [];
                          return (
                            <li key={deal.id} data-slot="deal-pipeline-deal" data-value-status={deal.valueStatus}>
                              <div data-slot="deal-pipeline-deal-head">
                                <span data-slot="deal-pipeline-deal-name">{deal.name}</span>
                                {deal.company ? (
                                  <span data-slot="deal-pipeline-deal-company">{deal.company}</span>
                                ) : null}
                              </div>
                              <p data-slot="deal-pipeline-deal-value">
                                {deal.valueMinor === null ? copy.noValue : money(deal.valueMinor, deal.currency)}
                                <span data-slot="deal-pipeline-deal-status" data-value-status={deal.valueStatus}>
                                  {copy.status[deal.valueStatus]}
                                </span>
                              </p>
                              {deal.valueSource ? (
                                <p data-slot="deal-pipeline-deal-source">{deal.valueSource}</p>
                              ) : null}
                              <p data-slot="deal-pipeline-deal-meta">
                                {deal.expectedClose ? `${copy.close} ${date(deal.expectedClose)}` : null}
                                {deal.expectedClose && deal.ownerId ? " · " : null}
                                {deal.ownerId ? `${copy.owner}: ${ownerName(deal.ownerId)}` : null}
                              </p>
                              {issues.length ? (
                                <ul data-slot="deal-pipeline-issues">
                                  {issues.map((issue) => (
                                    // The card names the deal; the sentence's id (often a UUID) reads as its name.
                                    <li key={issue}>{say(issue).replaceAll(`"${deal.id}"`, `"${deal.name}"`)}</li>
                                  ))}
                                </ul>
                              ) : null}
                              {column.outcome ? (
                                <div data-slot="deal-pipeline-actions">
                                  <span data-slot="deal-pipeline-closed">
                                    {copy.outcome[column.outcome]}
                                    {deal.closedBy ? ` · ${copy.closedBy} ${String(nameOf(deal.closedBy))}` : ""}
                                    {deal.lostReason ? ` · ${deal.lostReason}` : ""}
                                  </span>
                                  <DealPipelineReopen
                                    value={buttonKey(deal.id, "reopen")}
                                    aria-label={`${copy.reopen}: ${deal.name}`}
                                  >
                                    {copy.reopen}
                                  </DealPipelineReopen>
                                </div>
                              ) : (
                                <div data-slot="deal-pipeline-actions">
                                  <DealPipelineMove value={deal.id} aria-label={`${copy.stage}: ${deal.name}`}>
                                    {open.map((stage) => (
                                      <option key={stage.id} value={stage.id}>
                                        {stage.name}
                                      </option>
                                    ))}
                                  </DealPipelineMove>
                                  <DealPipelineWon
                                    value={buttonKey(deal.id, "won")}
                                    data-variant="secondary"
                                    aria-label={`${copy.won}: ${deal.name}`}
                                  >
                                    {copy.won}
                                  </DealPipelineWon>
                                  <details data-slot="deal-pipeline-lost">
                                    <summary>{copy.lost}</summary>
                                    <DealPipelineReason
                                      value={deal.id}
                                      rows={2}
                                      aria-label={`${copy.reason}: ${deal.name}`}
                                      placeholder={copy.reason}
                                    />
                                    <DealPipelineLost
                                      value={buttonKey(deal.id, "lost")}
                                      aria-label={`${copy.lost}: ${deal.name}`}
                                    >
                                      {copy.lost}
                                    </DealPipelineLost>
                                  </details>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
            {state.refusal ? (
              <p data-slot="deal-pipeline-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </DealPipelineRoot>
  );
}

export {
  DealPipeline,
  DealPipelineLost,
  DealPipelineMove,
  DealPipelineReason,
  DealPipelineReopen,
  DealPipelineRoot,
  DealPipelineWon,
  dealPipeline,
};
export type { CurrencyTotals, Deal, DealOutcome, DealValueStatus, PipelineOwner, PipelineStage, StageSummary };
