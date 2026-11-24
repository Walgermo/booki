import { BookiError, msg } from "./msg.js";

/**
 * A sales pipeline: deals moving through stages towards won or lost. An agent
 * may move an open deal between open stages, record its value with where the
 * figure came from, and set its expected close date and owner. Marking a deal
 * won or lost is a person's: it closes the deal, and in most products starts
 * an order, an invoice or a commission.
 *
 * A value counts only when it says how sure it is and where it came from:
 * - `known`: a signed order, a price list, an accepted quote.
 * - `estimate`: a figure someone made up their mind about, with its basis.
 * - `unknown`: a number without a source, or none. It is shown, never summed.
 */
export type DealValueStatus = "known" | "estimate" | "unknown";

export const DEAL_VALUE_STATUSES: readonly DealValueStatus[] = ["known", "estimate", "unknown"];

export type DealOutcome = "won" | "lost";

export type PipelineStage = {
  id: string;
  name: string;
  /** How likely a deal in this stage is to be won, in whole percent (0–100). */
  probability: number;
  /** A closing stage: deals here are won or lost. */
  outcome?: DealOutcome;
};

export type Deal = {
  id: string;
  name: string;
  stageId: string;
  /** Integer minor units, or null when nobody knows yet. Zero is a value. */
  valueMinor: number | null;
  currency: string;
  valueStatus: DealValueStatus;
  /** Where the figure came from: a quote number, a document, the basis of the estimate. */
  valueSource?: string;
  ownerId?: string;
  /** The customer, as the product names it. */
  company?: string;
  /** YYYY-MM-DD. */
  expectedClose?: string;
  /** ISO timestamp of the last stage change. */
  stageChangedAt?: string;
  closedBy?: string;
  closedAt?: string;
  lostReason?: string;
};

/** What `setDealValue` takes. */
export type DealValuePatch = {
  valueMinor?: number | null;
  currency?: string;
  valueStatus?: DealValueStatus;
  valueSource?: string | null;
};

export const DEAL_VALUE_FIELDS = ["valueMinor", "currency", "valueStatus", "valueSource"] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

function realDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const ids = <T extends { id: string }>(items: readonly T[]) => items.map((item) => item.id).join(", ") || "none";

function stageOf(stages: readonly PipelineStage[], stageId: unknown): PipelineStage {
  const stage = stages.find((item) => item.id === String(stageId));
  if (!stage) throw new BookiError("pipeline.no-stage", { stage: String(stageId), stages: ids(stages) });
  return stage;
}

/** Throws unless every stage has an id, a name and a whole-percent probability. */
export function assertStages(stages: readonly PipelineStage[]): void {
  const seen = new Set<string>();
  for (const stage of stages) {
    if (String(stage.id ?? "").trim() === "") throw new BookiError("pipeline.stage-id");
    if (seen.has(stage.id)) throw new BookiError("pipeline.stage-twice", { stage: stage.id });
    seen.add(stage.id);
    if (!Number.isInteger(stage.probability) || stage.probability < 0 || stage.probability > 100) {
      throw new BookiError("pipeline.probability", { stage: stage.id, value: String(stage.probability) });
    }
  }
}

/** The deal's stage, or undefined when the stage is not in the list. */
export function dealStage(deal: Deal, stages: readonly PipelineStage[]): PipelineStage | undefined {
  return stages.find((stage) => stage.id === deal.stageId);
}

/** True when the deal sits in a won or lost stage. */
export function isClosed(deal: Deal, stages: readonly PipelineStage[]): boolean {
  return dealStage(deal, stages)?.outcome !== undefined;
}

/** True when the value is summed: known or estimated, with an amount and a source. */
export function valueCounts(deal: Deal): boolean {
  return (
    deal.valueMinor !== null &&
    Number.isSafeInteger(deal.valueMinor) &&
    (deal.valueStatus === "known" || deal.valueStatus === "estimate") &&
    String(deal.valueSource ?? "").trim() !== ""
  );
}

/**
 * Move an open deal to another open stage. A won or lost stage is refused:
 * closing is `closeDeal`, a person's. A closed deal is reopened by a person.
 */
export function moveDeal(deal: Deal, stages: readonly PipelineStage[], stageId: string, at: string): Deal {
  const target = stageOf(stages, stageId);
  const current = dealStage(deal, stages);
  if (current?.outcome) throw new BookiError("pipeline.closed", { id: deal.id, outcome: current.outcome });
  if (target.outcome) {
    throw new BookiError("pipeline.outcome-needs-person", { id: deal.id, stage: target.name, outcome: target.outcome });
  }
  if (target.id === deal.stageId) return deal;
  return { ...deal, stageId: target.id, stageChangedAt: at };
}

/** A person marks the deal won or lost. Lost needs a reason. */
export function closeDeal(
  deal: Deal,
  stages: readonly PipelineStage[],
  outcome: DealOutcome,
  by: string,
  at: string,
  reason?: string,
): Deal {
  const actor = String(by ?? "").trim();
  if (actor === "") throw new BookiError("pipeline.actor-required");
  const current = dealStage(deal, stages);
  if (current?.outcome) throw new BookiError("pipeline.closed", { id: deal.id, outcome: current.outcome });
  const target = stages.find((stage) => stage.outcome === outcome);
  if (!target) throw new BookiError("pipeline.no-outcome-stage", { outcome });
  const why = String(reason ?? "").trim();
  if (outcome === "lost" && why === "") throw new BookiError("pipeline.lost-reason", { id: deal.id });
  const { lostReason: _l, ...rest } = deal;
  return {
    ...rest,
    stageId: target.id,
    stageChangedAt: at,
    closedBy: actor,
    closedAt: at,
    ...(outcome === "lost" ? { lostReason: why } : {}),
  };
}

/** A person reopens a won or lost deal into an open stage. */
export function reopenDeal(
  deal: Deal,
  stages: readonly PipelineStage[],
  stageId: string,
  by: string,
  at: string,
): Deal {
  if (String(by ?? "").trim() === "") throw new BookiError("pipeline.actor-required");
  const target = stageOf(stages, stageId);
  if (!isClosed(deal, stages)) throw new BookiError("pipeline.not-closed", { id: deal.id });
  if (target.outcome) {
    throw new BookiError("pipeline.outcome-needs-person", { id: deal.id, stage: target.name, outcome: target.outcome });
  }
  const { closedBy: _b, closedAt: _a, lostReason: _r, ...rest } = deal;
  return { ...rest, stageId: target.id, stageChangedAt: at };
}

/**
 * Record a deal's value. A known or estimated value needs an amount and a
 * source. Changing the amount or the currency without saying how sure the new
 * figure is makes it unknown and drops the old source: evidence for one
 * amount is not evidence for another.
 */
export function setDealValue(deal: Deal, patch: DealValuePatch): Deal {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    throw new BookiError("pipeline.value-not-object", { id: deal.id });
  }
  for (const key of Object.keys(patch)) {
    if (!(DEAL_VALUE_FIELDS as readonly string[]).includes(key)) {
      throw new BookiError("pipeline.unknown-field", { id: deal.id, field: key, fields: DEAL_VALUE_FIELDS.join(", ") });
    }
  }
  const next: Deal = { ...deal };
  if ("valueMinor" in patch) {
    const value = patch.valueMinor;
    if (value !== null && (!Number.isSafeInteger(value) || (value as number) < 0)) {
      throw new BookiError("pipeline.value-minor", { id: deal.id, value: String(value) });
    }
    next.valueMinor = value ?? null;
  }
  if ("currency" in patch) {
    const currency = String(patch.currency ?? "").trim();
    if (!CURRENCY.test(currency)) throw new BookiError("pipeline.currency", { id: deal.id, value: currency });
    next.currency = currency;
  }
  const figureChanged = next.valueMinor !== deal.valueMinor || next.currency !== deal.currency;
  if (figureChanged && !("valueStatus" in patch)) {
    next.valueStatus = "unknown";
    if (!("valueSource" in patch)) delete next.valueSource;
  }
  if ("valueStatus" in patch) {
    if (!DEAL_VALUE_STATUSES.includes(patch.valueStatus as DealValueStatus)) {
      throw new BookiError("pipeline.value-status", {
        id: deal.id,
        status: String(patch.valueStatus),
        statuses: DEAL_VALUE_STATUSES.join(", "),
      });
    }
    next.valueStatus = patch.valueStatus as DealValueStatus;
  }
  if ("valueSource" in patch) {
    const source = String(patch.valueSource ?? "").trim();
    if (source === "") delete next.valueSource;
    else next.valueSource = source;
  }
  if ((next.valueStatus === "known" || next.valueStatus === "estimate") && !valueCounts(next)) {
    throw new BookiError("pipeline.value-needs-source", { id: deal.id, status: next.valueStatus });
  }
  return next;
}

/** Set or clear (`""`) the expected close date, YYYY-MM-DD. */
export function setExpectedClose(deal: Deal, date: string): Deal {
  const value = String(date ?? "").trim();
  if (value === "") {
    const { expectedClose: _e, ...rest } = deal;
    return rest;
  }
  if (!realDate(value)) throw new BookiError("pipeline.date-format", { id: deal.id, value });
  return { ...deal, expectedClose: value };
}

/** A whole-percent share of an amount, rounded half away from zero, without a float. */
function weighted(minor: number, percent: number): number {
  const product = BigInt(minor) * BigInt(percent);
  const quotient = product / 100n;
  const remainder = product % 100n;
  return Number(remainder * 2n >= 100n ? quotient + 1n : quotient);
}

export type CurrencyTotals = {
  currency: string;
  /** Known values, summed. */
  knownMinor: number;
  /** Estimated values, summed. */
  estimateMinor: number;
  /** Known and estimated values, each times its stage's probability. */
  weightedMinor: number;
  /** Deals with an amount nobody vouched for: shown, not summed. */
  unverified: number;
  /** Deals with no amount. */
  missing: number;
};

export type StageSummary = {
  stageId: string;
  name: string;
  probability: number;
  outcome?: DealOutcome;
  count: number;
  /** One entry per currency, sorted by code. Amounts in different currencies are never added. */
  totals: CurrencyTotals[];
};

function totalsOf(deals: readonly Deal[], probabilityOf: (deal: Deal) => number): CurrencyTotals[] {
  const groups = new Map<string, CurrencyTotals>();
  for (const deal of deals) {
    const group = groups.get(deal.currency) ?? {
      currency: deal.currency,
      knownMinor: 0,
      estimateMinor: 0,
      weightedMinor: 0,
      unverified: 0,
      missing: 0,
    };
    if (deal.valueMinor === null) group.missing += 1;
    else if (!valueCounts(deal)) group.unverified += 1;
    else {
      if (deal.valueStatus === "known") group.knownMinor += deal.valueMinor;
      else group.estimateMinor += deal.valueMinor;
      group.weightedMinor += weighted(deal.valueMinor, probabilityOf(deal));
    }
    groups.set(deal.currency, group);
  }
  return [...groups.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Count and totals per stage, in the stages' order. Deals in a stage not listed are left out. */
export function pipelineSummary(deals: readonly Deal[], stages: readonly PipelineStage[]): StageSummary[] {
  return stages.map((stage) => {
    const here = deals.filter((deal) => deal.stageId === stage.id);
    return {
      stageId: stage.id,
      name: stage.name,
      probability: stage.probability,
      ...(stage.outcome ? { outcome: stage.outcome } : {}),
      count: here.length,
      totals: totalsOf(here, () => stage.probability),
    };
  });
}

/** The open deals' totals per currency: the weighted forecast. Won and lost deals are not in it. */
export function forecast(deals: readonly Deal[], stages: readonly PipelineStage[]): CurrencyTotals[] {
  const open = deals.filter((deal) => {
    const stage = dealStage(deal, stages);
    return stage !== undefined && stage.outcome === undefined;
  });
  return totalsOf(open, (deal) => dealStage(deal, stages)?.probability ?? 0);
}

/** Whole days from one YYYY-MM-DD (or ISO timestamp) to another. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** What a person should know about a deal, as sentences. Warnings, never refusals. */
export function dealIssues(
  deal: Deal,
  stages: readonly PipelineStage[],
  today: string,
  options: { staleDays?: number } = {},
): string[] {
  const issues: string[] = [];
  const stage = dealStage(deal, stages);
  const id = deal.id;
  if (!stage) issues.push(msg("pipeline.issue.no-stage", { id, stage: deal.stageId }));
  if (stage?.outcome) return issues;
  if (deal.valueMinor === null) issues.push(msg("pipeline.issue.no-value", { id }));
  else if (!valueCounts(deal)) issues.push(msg("pipeline.issue.unverified", { id }));
  if (deal.expectedClose && deal.expectedClose < today) {
    issues.push(msg("pipeline.issue.close-passed", { id, date: deal.expectedClose }));
  }
  const stale = options.staleDays ?? 30;
  if (deal.stageChangedAt && daysBetween(deal.stageChangedAt, today) > stale) {
    issues.push(msg("pipeline.issue.stale", { id, days: daysBetween(deal.stageChangedAt, today) }));
  }
  return issues;
}

/** The deal with this id, or a refusal listing the deals there are. */
export function findDeal(deals: readonly Deal[], id: unknown): Deal {
  const deal = deals.find((item) => item.id === String(id));
  if (!deal) throw new BookiError("pipeline.no-deal", { id: String(id), ids: ids(deals) });
  return deal;
}
