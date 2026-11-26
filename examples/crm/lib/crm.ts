import { completeTask, logActivity, rescheduleTask, scheduleTask, type Activity } from "@booki-aui/core/activity";
import {
  moveDeal,
  reopenDeal,
  setDealValue,
  setExpectedClose,
  type Deal,
  type StageStay,
} from "@booki-aui/core/pipeline";
import {
  actorLabel,
  guard,
  guardCloseDeal,
  type GuardContext,
  type Refusal,
  type ServerActor,
  type Verdict,
} from "@booki-aui/core/server";
import { HISTORY, PAST_STAYS, STAGES, seedActivities, seedDeals } from "./data";
import { ROLES, personOf } from "./people";

/**
 * The CRM's records: what the server holds and the only place a change
 * becomes true. A screen proposes a whole new list (the board's deals, one
 * deal's activities) with the list it started from (`base`). The server takes
 * only what the screen changed from its base, refuses a change to a record
 * someone changed since, and lets through only the changes this actor may
 * make, each through the guard. Who did it comes from the credential, never
 * from the body. A refusal changes nothing and is logged.
 *
 * Kept in memory for the example. Your app keeps this in its database.
 */
export type AuditRow = { id: string; at: string; actor: string; action: string; target: string; detail?: string };

export type Crm = {
  deals: Deal[];
  activities: Record<string, Activity[]>;
  /** Every stage each deal has reached, in order, the one it is in now last: for the funnel. */
  history: Record<string, string[]>;
  /** Finished stays in a stage, for time in stage. The stay a deal is in now comes from its `stageChangedAt`. */
  stays: StageStay[];
  audit: AuditRow[];
};

/** `base` is the list the screen started from. Without it, the server's own list is taken as the base. */
export type Write =
  | { action: "deals"; deals: Deal[]; base?: Deal[] }
  | { action: "activities"; dealId: string; activities: Activity[]; base?: Activity[] }
  | { action: "agent-step"; step: string; target: string; detail?: string };

export type Answer = { ok: true; crm: Crm } | (Refusal & { crm: Crm });

export function seedCrm(): Crm {
  return {
    deals: seedDeals(),
    activities: seedActivities(),
    history: structuredClone(HISTORY),
    stays: structuredClone(PAST_STAYS),
    audit: [],
  };
}

/**
 * The rows the page's bridge writes about the agent's steps: refused, a
 * person's, cancelled, failed in the control. Not `agent.confirmed`: in this
 * app no person confirms an agent's step, so a row saying one did is false.
 */
const AGENT_STEPS = new Set(["agent.refused", "agent.person-only", "agent.cancelled", "agent.failed"]);

const now = () => new Date().toISOString();

/** Someone changed the record since the screen read it: nothing changes, and the screen shows the new version. */
const stale = (target: string): Refusal => ({
  ok: false,
  status: 409,
  code: "crm.stale",
  message: `${target} er endret siden skjermen hentet den. Se den nye versjonen og prøv igjen.`,
});

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function log(crm: Crm, actor: ServerActor | undefined, action: string, target: string, detail?: string) {
  crm.audit.unshift({
    // The records outlive a hot reload (see store.ts) and a counter in this module does not: an id of its own.
    id: `a-${crypto.randomUUID()}`,
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

/** A deal left its stage: the funnel keeps every stage it reached, time in stage the stay it finished. */
function transition(crm: Crm, stored: Deal, next: Deal) {
  crm.history = { ...crm.history, [stored.id]: [...(crm.history[stored.id] ?? [stored.stageId]), next.stageId] };
  if (stored.stageChangedAt && !isClosed(stored))
    crm.stays = [
      ...crm.stays,
      {
        dealId: stored.id,
        stageId: stored.stageId,
        enteredAt: stored.stageChangedAt,
        leftAt: next.stageChangedAt ?? now(),
      },
    ];
}

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
    transition(crm, stored, closed);
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
    transition(crm, stored, reopened);
    return reopened;
  }
  const edited = decide(
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
  if (edited.stageId !== stored.stageId) transition(crm, stored, edited);
  return edited;
}

/**
 * The deals the screen changed from the list it started from, and only those:
 * a deal it did not touch stays as the server has it, however old the
 * screen's copy. A deal it did change must still be as the screen read it.
 */
function writeDeals(crm: Crm, context: GuardContext, incoming: Deal[], base: Deal[] | undefined) {
  crm.deals = crm.deals.map((stored) => {
    const next = incoming.find((deal) => deal.id === stored.id);
    const read = base?.find((deal) => deal.id === stored.id) ?? stored;
    if (!next || same(next, read)) return stored;
    if (!same(stored, read)) {
      log(crm, context.actor, "refused", stored.id, stale(stored.id).message);
      throw stale(stored.id);
    }
    return nextDeal(crm, context, stored, next);
  });
}

/**
 * One deal's activities: a new entry is logged or scheduled again here, under
 * the actor's own name; completing and rescheduling go through the rules;
 * removing is `activity.remove`, which only a person holds. Only what the
 * screen changed from its base counts: an entry it never saw is kept, and one
 * it changed or removed must still be as it read it.
 */
function writeActivities(
  crm: Crm,
  context: GuardContext,
  dealId: string,
  incoming: Activity[],
  base: Activity[] | undefined,
) {
  const actor = context.actor!;
  const by = actorLabel(actor);
  const stored = crm.activities[dealId];
  if (!stored) {
    throw { ok: false, status: 422, code: "crm.no-deal", message: `Ingen avtale ${dealId}.` } satisfies Refusal;
  }
  const at = now();
  const read = base ?? stored;
  const byId = (list: Activity[], id: string) => list.find((item) => item.id === id);
  for (const was of read) {
    const current = byId(stored, was.id);
    const wanted = byId(incoming, was.id);
    if ((current || wanted) && !same(wanted, was) && !same(current, was)) {
      log(crm, actor, "refused", `${dealId}/${was.id}`, stale(`${dealId}/${was.id}`).message);
      throw stale(`${dealId}/${was.id}`);
    }
  }
  let next = [...stored];
  for (const old of read.filter((item) => byId(stored, item.id) && !byId(incoming, item.id))) {
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
    const was = byId(read, item.id);
    // Not changed by this screen: as the server has it.
    if (was && same(item, was)) continue;
    const before = byId(next, item.id);
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
  const before = structuredClone({
    deals: crm.deals,
    activities: crm.activities,
    history: crm.history,
    stays: crm.stays,
  });
  try {
    if (write.action === "deals") writeDeals(crm, context, write.deals, write.base);
    else if (write.action === "activities") writeActivities(crm, context, write.dealId, write.activities, write.base);
    else if (write.action === "agent-step") {
      // Only the agent writes rows about its own steps, and only as text.
      if (actor?.kind !== "agent")
        return {
          ok: false,
          status: 403,
          code: "crm.agent-step",
          message: "Bare agenten skriver rader om sine egne steg.",
          crm,
        };
      log(
        crm,
        actor,
        AGENT_STEPS.has(write.step) ? write.step : "agent.refused",
        typeof write.target === "string" ? write.target.slice(0, 120) : "?",
        typeof write.detail === "string" ? write.detail.slice(0, 200) : undefined,
      );
    }
    return { ok: true, crm };
  } catch (error) {
    crm.deals = before.deals;
    crm.activities = before.activities;
    crm.history = before.history;
    crm.stays = before.stays;
    const refusal =
      error && typeof error === "object" && "status" in error
        ? (error as Refusal)
        : { ok: false as const, status: 422 as const, code: "crm.rule", message: (error as Error).message };
    if (!(error && typeof error === "object" && "status" in error))
      log(crm, actor, "refused", write.action, refusal.message);
    return { ...refusal, ok: false, crm };
  }
}
