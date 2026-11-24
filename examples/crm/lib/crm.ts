import { completeTask, logActivity, rescheduleTask, scheduleTask, type Activity } from "@booki/core/activity";
import { moveDeal, reopenDeal, setDealValue, setExpectedClose, type Deal } from "@booki/core/pipeline";
import {
  actorLabel,
  guard,
  guardCloseDeal,
  type GuardContext,
  type Refusal,
  type ServerActor,
  type Verdict,
} from "@booki/core/server";
import { STAGES, seedActivities, seedDeals } from "./data";
import { ROLES, personOf } from "./people";

/**
 * The CRM's records: what the server holds and the only place a change
 * becomes true. A screen proposes a whole new list (the board's deals, one
 * deal's activities); the server compares it with what it has and lets
 * through only the changes this actor may make, each through the guard. Who
 * did it comes from the credential, never from the body. A refusal changes
 * nothing and is logged.
 *
 * Kept in memory for the example. Your app keeps this in its database.
 */
export type AuditRow = { id: string; at: string; actor: string; action: string; target: string; detail?: string };

export type Crm = {
  deals: Deal[];
  activities: Record<string, Activity[]>;
  audit: AuditRow[];
};

export type Write =
  | { action: "deals"; deals: Deal[] }
  | { action: "activities"; dealId: string; activities: Activity[] }
  | { action: "agent-step"; step: string; target: string };

export type Answer = { ok: true; crm: Crm } | (Refusal & { crm: Crm });

export function seedCrm(): Crm {
  return { deals: seedDeals(), activities: seedActivities(), audit: [] };
}

const now = () => new Date().toISOString();
let sequence = 0;

function log(crm: Crm, actor: ServerActor | undefined, action: string, target: string, detail?: string) {
  crm.audit.unshift({
    id: `a${++sequence}`,
    at: now(),
    actor: actor ? actorLabel(actor) : "unknown",
    action,
    target,
    ...(detail ? { detail } : {}),
  });
}

/** Runs one decision through the guard; on a refusal, logs it and stops the write. */
function decide<T>(crm: Crm, context: GuardContext, target: string, verdict: Verdict<T>): T {
  if (!verdict.ok) {
    log(crm, context.actor, "refused", target, verdict.message);
    throw verdict;
  }
  return verdict.value;
}

const isClosed = (deal: Deal) => STAGES.find((stage) => stage.id === deal.stageId)?.outcome !== undefined;
const outcomeOf = (deal: Deal) => STAGES.find((stage) => stage.id === deal.stageId)?.outcome;

/** One deal from what the screen proposed: closing and reopening are a person's, the rest is `deal.edit`. */
function nextDeal(crm: Crm, context: GuardContext, stored: Deal, incoming: Deal): Deal {
  const at = now();
  const actor = context.actor!;
  const target = stored.id;
  const outcome = outcomeOf(incoming);
  if (incoming.stageId !== stored.stageId && outcome && !isClosed(stored)) {
    const closed = decide(
      crm,
      context,
      target,
      guardCloseDeal(context, { deal: stored, stages: STAGES, outcome, at, reason: incoming.lostReason }),
    );
    log(crm, actor, `deal.${outcome}`, target, outcome === "lost" ? closed.lostReason : undefined);
    return closed;
  }
  if (incoming.stageId !== stored.stageId && isClosed(stored)) {
    const reopened = decide(
      crm,
      context,
      target,
      guard(context, "deal.close", () => reopenDeal(stored, STAGES, incoming.stageId, actor.id, at)),
    );
    log(crm, actor, "deal.reopen", target);
    return reopened;
  }
  return decide(
    crm,
    context,
    target,
    guard(context, "deal.edit", () => {
      let next = stored;
      if (incoming.stageId !== stored.stageId) {
        next = moveDeal(next, STAGES, incoming.stageId, at);
        log(crm, actor, "deal.move", target, incoming.stageId);
      }
      const value = {
        valueMinor: incoming.valueMinor,
        currency: incoming.currency,
        valueStatus: incoming.valueStatus,
        valueSource: incoming.valueSource ?? null,
      };
      if (
        value.valueMinor !== next.valueMinor ||
        value.currency !== next.currency ||
        value.valueStatus !== next.valueStatus ||
        (value.valueSource ?? undefined) !== next.valueSource
      ) {
        next = setDealValue(next, value);
        log(crm, actor, "deal.value", target, `${next.valueMinor ?? "–"} ${next.currency} ${next.valueStatus}`);
      }
      if ((incoming.expectedClose ?? "") !== (next.expectedClose ?? "")) {
        next = setExpectedClose(next, incoming.expectedClose ?? "");
        log(crm, actor, "deal.expected-close", target, next.expectedClose);
      }
      if (incoming.ownerId !== next.ownerId) {
        next = { ...next, ...(incoming.ownerId ? { ownerId: incoming.ownerId } : {}) };
        if (!incoming.ownerId) delete next.ownerId;
        log(crm, actor, "deal.owner", target, incoming.ownerId);
      }
      return next;
    }),
  );
}

function writeDeals(crm: Crm, context: GuardContext, incoming: Deal[]) {
  crm.deals = crm.deals.map((stored) => {
    const next = incoming.find((deal) => deal.id === stored.id);
    if (!next || JSON.stringify(next) === JSON.stringify(stored)) return stored;
    return nextDeal(crm, context, stored, next);
  });
}

/**
 * One deal's activities: a new entry is logged or scheduled again here, under
 * the actor's own name; completing and rescheduling go through the rules;
 * removing is `activity.remove`, which only a person holds.
 */
function writeActivities(crm: Crm, context: GuardContext, dealId: string, incoming: Activity[]) {
  const actor = context.actor!;
  const by = actorLabel(actor);
  const stored = crm.activities[dealId];
  if (!stored) {
    throw { ok: false, status: 422, code: "crm.no-deal", message: `Ingen avtale ${dealId}.` } satisfies Refusal;
  }
  const at = now();
  let next = [...stored];
  for (const old of stored.filter((item) => !incoming.some((candidate) => candidate.id === item.id))) {
    decide(
      crm,
      context,
      `${dealId}/${old.id}`,
      guard(context, "activity.remove", () => true),
    );
    next = next.filter((item) => item.id !== old.id);
    log(crm, actor, "activity.remove", `${dealId}/${old.id}`, old.subject);
  }
  for (const item of incoming) {
    const before = next.find((candidate) => candidate.id === item.id);
    const target = `${dealId}/${item.id}`;
    if (!before) {
      const added = decide(
        crm,
        context,
        target,
        guard(context, "activity.log", () =>
          item.kind === "task"
            ? scheduleTask(
                {
                  id: item.id,
                  subject: item.subject,
                  dueDate: item.dueDate ?? "",
                  body: item.body,
                  assigneeId: item.assigneeId,
                },
                by,
                at,
              )
            : logActivity(
                {
                  id: item.id,
                  kind: item.kind,
                  subject: item.subject,
                  body: item.body,
                  at: item.at,
                  evidence: item.evidence,
                },
                by,
                at,
              ),
        ),
      );
      next = [...next, added];
      log(crm, actor, item.kind === "task" ? "task.schedule" : "activity.log", target, item.subject);
      continue;
    }
    if (item.doneAt && !before.doneAt) {
      const done = decide(
        crm,
        context,
        target,
        guard(context, "activity.log", () => completeTask(before, by, at)),
      );
      next = next.map((candidate) => (candidate.id === item.id ? done : candidate));
      log(crm, actor, "task.complete", target, before.subject);
    } else if (item.dueDate && item.dueDate !== before.dueDate) {
      const moved = decide(
        crm,
        context,
        target,
        guard(context, "activity.log", () => rescheduleTask(before, item.dueDate!)),
      );
      next = next.map((candidate) => (candidate.id === item.id ? moved : candidate));
      log(crm, actor, "task.reschedule", target, item.dueDate);
    }
  }
  crm.activities = { ...crm.activities, [dealId]: next };
}

/** Applies one write for one actor. Everything or nothing: a refusal leaves the records as they were. */
export function apply(crm: Crm, actor: ServerActor | undefined, write: Write): Answer {
  const context: GuardContext = { actor, roles: ROLES, personOf };
  const before = structuredClone({ deals: crm.deals, activities: crm.activities });
  try {
    if (write.action === "deals") writeDeals(crm, context, write.deals);
    else if (write.action === "activities") writeActivities(crm, context, write.dealId, write.activities);
    else if (write.action === "agent-step") log(crm, actor, "agent.refused", write.target, write.step);
    return { ok: true, crm };
  } catch (error) {
    crm.deals = before.deals;
    crm.activities = before.activities;
    const refusal =
      error && typeof error === "object" && "status" in error
        ? (error as Refusal)
        : { ok: false as const, status: 422 as const, code: "crm.rule", message: (error as Error).message };
    if (!(error && typeof error === "object" && "status" in error))
      log(crm, actor, "refused", write.action, refusal.message);
    return { ...refusal, ok: false, crm };
  }
}
