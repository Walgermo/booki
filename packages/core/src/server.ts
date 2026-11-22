/**
 * The same rules the screen enforces, for your API.
 *
 * The controls refuse what a role may not do and what the books do not allow,
 * but a browser is not a security boundary: anything can call your API. Run
 * every write through one of these guards on the server, with the actor your
 * own sign-in established (never one the request says it is). Each guard
 * answers with a verdict you can send straight back: the HTTP status, a stable
 * code and the same sentence the control showed, in English or Norwegian.
 *
 * Order of checks, for every action:
 *   1. Signed in?                                   401
 *   2. A person's decision, and the actor an agent? 403
 *   3. Role allows it, in this entity?              403
 *   4. Separation of duties against what they did?  403
 *   5. A reason given, where one is required?       422
 *   6. The books allow it (balance, period, approvals, readiness)? 409 or 422
 *
 * Where the books are a matter of professional judgment (an audit file, say),
 * use `advise` instead of `guard`: steps 1 to 5 still refuse, and step 6 comes
 * back as warnings for the person to weigh.
 *
 * Framework-free: plain data in, plain data out. Works in Node, edge runtimes,
 * Deno and Bun.
 */
import { assertApproved, decide, type ApprovalDecision, type ApprovalLevel, type ApprovalRequest } from "./approval.js";
import { assertReadyToClose, type CloseSummary, type CloseTask } from "./close.js";
import { confirmFinding, type Finding } from "./findings.js";
import { finalizeInvoice, type Invoice } from "./invoice.js";
import { isIsoDate } from "./iso-date.js";
import { localize, msgIn, type MessageLanguage } from "./messages.js";
import { BookiError, isBookiError, msg } from "./msg.js";
import { releaseBatch, type PaymentBatch } from "./payment-batch.js";
import {
  STANDARD_DUTY_RULES,
  STANDARD_ROLES,
  assertCan,
  can,
  type Actor,
  type Deed,
  type DutyRule,
  type Permission,
  type Role,
} from "./permissions.js";
import { assertVatReturnReady, type VatReturnComputation } from "./vat-return.js";
import { assertPostable, type VoucherBalance, type VoucherLine, type VoucherRules } from "./voucher.js";

/**
 * Who is calling, as your sign-in established it. An agent gets its own
 * credential and comes here as `kind: "agent"`; `onBehalfOf` is the person
 * whose session started it, for the audit trail.
 */
export type ServerActor = Actor & {
  kind: "person" | "agent";
  onBehalfOf?: string;
  /** For an agent: the client it came through (an MCP client, your workflow), for the audit trail. */
  clientId?: string;
  /** For an agent: the grant or token the person gave it, for the audit trail. */
  grantId?: string;
};

export type GuardContext = {
  actor?: ServerActor;
  /** Your roles. Default: `STANDARD_ROLES`. */
  roles?: Role[];
  /** The company the request is for. An actor limited to other entities is refused. */
  entity?: string;
  /** The engagement, case or project: the actor's roles there (`scopes`) count too. */
  scope?: string;
  /** Why, in the actor's words. Kept with the decision. */
  reason?: string;
  /** Refuse unless `reason` has at least this many characters (withdrawing a sign-off, say). */
  minReason?: number;
  /** Your own permissions that only a person may use, added to `PERSON_ONLY`. */
  personOnly?: Permission[];
  /** What has already been done to this item, and by whom, for the duty rules. */
  deeds?: Deed[];
  /** Default: `STANDARD_DUTY_RULES`. Pass `[]` to switch them off. */
  dutyRules?: DutyRule[];
  /** Language of the refusal sentence. Default: English. */
  locale?: MessageLanguage;
};

export type Refusal = {
  ok: false;
  status: 401 | 403 | 409 | 422;
  /** Stable, for your client and your logs. */
  code: string;
  /** One sentence a person or an agent can act on. */
  message: string;
  /** Every problem, where the rule found several. */
  issues?: string[];
};

export type Verdict<T> = { ok: true; value: T; actor: string } | Refusal;

/** What `advise` answers: allowed, with what the books say against it, if anything. */
export type Advice<T> = { ok: true; value: T | undefined; actor: string; warnings: string[] } | Refusal;

/**
 * Decisions that stay with people, whatever an agent's role says: approving,
 * signing off, finalizing, releasing, closing and submitting.
 */
export const PERSON_ONLY: readonly Permission[] = [
  "audit.review",
  "audit.conclude",
  "audit.eqcr",
  "audit.freeze",
  "approval.decide",
  "supplier-invoice.approve",
  "expense.approve",
  "payment.approve",
  "payment.release",
  "reconciliation.approve",
  "period.close",
  "period.adjust-closed",
  "close.sign-off",
  "invoice.finalize",
  "vat.submit",
  "asset.dispose",
  "audit.sign-off",
  "finding.confirm",
  "finding.withdraw",
  "request.send",
  "request.decide",
];

/** How an actor appears in the audit trail: `agent:bookkeeper` or the person's id. */
export const actorLabel = (actor: ServerActor) => (actor.kind === "agent" ? `agent:${actor.id}` : actor.id);

/**
 * The deed to record for what an actor just did, for later duty checks: it
 * names the agent's label and whose session it ran in, so the person cannot
 * review what their own agent prepared.
 */
export function actorDeed(actor: ServerActor, permission: Permission): Deed {
  return { actorId: actorLabel(actor), permission, ...(actor.onBehalfOf ? { onBehalfOf: actor.onBehalfOf } : {}) };
}

/** Everything the audit trail should keep about who acted: the label, the kind, and for an agent whose session, client and grant. */
export function actorRecord(actor: ServerActor): {
  actor: string;
  kind: ServerActor["kind"];
  onBehalfOf?: string;
  clientId?: string;
  grantId?: string;
} {
  return {
    actor: actorLabel(actor),
    kind: actor.kind,
    ...(actor.onBehalfOf ? { onBehalfOf: actor.onBehalfOf } : {}),
    ...(actor.clientId ? { clientId: actor.clientId } : {}),
    ...(actor.grantId ? { grantId: actor.grantId } : {}),
  };
}

function statusOf(code: string): Refusal["status"] {
  if (code === "permissions.signed-out") return 401;
  if (code === "server.reason-required") return 422;
  if (code.startsWith("permissions.") || code.startsWith("server.")) return 403;
  if (
    /^(period\.|approval\.(waiting|rejected)|batch\.already|invoice\.(not-editable|number-used)|close\.)/.test(code)
  ) {
    return 409;
  }
  return 422;
}

function refuse(error: unknown, locale: MessageLanguage | undefined): Refusal {
  if (isBookiError(error)) {
    const issues = Array.isArray(error.params.issues) ? (error.params.issues as unknown[]).map(String) : undefined;
    return {
      ok: false,
      status: statusOf(error.code),
      code: error.code,
      message: locale && locale !== "en" ? msgIn(locale, error.code, error.params) : error.message,
      ...(issues
        ? { issues: locale && locale !== "en" ? issues.map((issue) => localize(issue, locale)) : issues }
        : {}),
    };
  }
  // A plain Error is a duty rule's reason sentence; anything else is a bug, so rethrow it.
  if (error instanceof Error && !(error instanceof TypeError) && !(error instanceof RangeError)) {
    return {
      ok: false,
      status: 403,
      code: "permissions.duty",
      message: locale && locale !== "en" ? localize(error.message, locale) : error.message,
    };
  }
  throw error;
}

/**
 * The general guard: may this actor do `permission`, and does `rule` pass?
 * The specific guards below are this with the right rule filled in; use it
 * directly for your own actions.
 */
export function guard<T>(context: GuardContext, permission: Permission, rule: () => T): Verdict<T> {
  try {
    admit(context, permission);
    return { ok: true, value: rule(), actor: actorLabel(context.actor!) };
  } catch (error) {
    return refuse(error, context.locale);
  }
}

/**
 * Like `guard`, for actions where the books are a matter of judgment: who may
 * act is still enforced (signed in, a person's decision, role, duties, reason),
 * but what `rule` finds against it comes back as `warnings` instead of a
 * refusal, and `value` is undefined when the rule threw. The person decides.
 */
export function advise<T>(context: GuardContext, permission: Permission, rule: () => T): Advice<T> {
  try {
    admit(context, permission);
  } catch (error) {
    return refuse(error, context.locale);
  }
  const actor = actorLabel(context.actor!);
  try {
    return { ok: true, value: rule(), actor, warnings: [] };
  } catch (error) {
    const found = refuse(error, context.locale);
    // Only the books' own objections become warnings; anything about who may act still refuses.
    if (found.status === 409 || found.status === 422) {
      return { ok: true, value: undefined, actor, warnings: found.issues?.length ? found.issues : [found.message] };
    }
    return found;
  }
}

/** Steps 1 to 5: who may act, and why. Throws a BookiError when not. */
function admit(context: GuardContext, permission: Permission): void {
  const {
    actor,
    roles = STANDARD_ROLES,
    entity,
    scope,
    deeds,
    dutyRules = STANDARD_DUTY_RULES,
    reason,
    minReason,
  } = context;
  // Fail closed: an actor whose kind is neither a person nor an agent is refused outright.
  if (actor && actor.kind !== "person" && actor.kind !== "agent") {
    throw new BookiError("server.unknown-kind", { kind: String((actor as { kind?: unknown }).kind) });
  }
  const personOnly = PERSON_ONLY.includes(permission) || (context.personOnly ?? []).includes(permission);
  if (actor?.kind === "agent" && personOnly) {
    const able = roles.filter((role) => role.permissions.includes(permission)).map((role) => role.name);
    throw new BookiError("server.person-only", {
      permission: String(permission),
      roles: able.join(", ") || msg("permissions.none-defined"),
    });
  }
  assertCan(actor, roles, permission, { entity, scope, deeds, dutyRules });
  if (minReason && String(reason ?? "").trim().length < minReason) {
    throw new BookiError("server.reason-required", { min: minReason });
  }
}

/**
 * Post a voucher: balanced, closed lists, open period. Only a person with
 * `period.adjust-closed` may post into a soft-closed period; an agent never.
 */
export function guardPostVoucher(
  context: GuardContext,
  input: { lines: VoucherLine[]; date: string; rules?: VoucherRules },
): Verdict<VoucherBalance> {
  const roles = context.roles ?? STANDARD_ROLES;
  const mayAdjustClosed =
    context.actor?.kind === "person" && can(context.actor, roles, "period.adjust-closed", { entity: context.entity });
  return guard(context, "voucher.post", () => {
    // A date that does not exist ("2026-02-30") would roll into the next month and past a closed period.
    if (!isIsoDate(input.date))
      throw new BookiError("period.posting-date-format", { value: JSON.stringify(input.date) });
    return assertPostable(input.lines, input.rules ?? {}, { date: input.date, mayAdjustClosed });
  });
}

/** Record an approval decision. A person's, at the level the chain is waiting for. */
export function guardDecideApproval(
  context: GuardContext,
  input: {
    chain: ApprovalLevel[];
    request: ApprovalRequest;
    decision: ApprovalDecision["decision"];
    at: string;
    note?: string;
  },
): Verdict<ApprovalRequest> {
  return guard(context, "approval.decide", () =>
    decide(input.chain, input.request, {
      approverId: context.actor!.id,
      decision: input.decision,
      at: input.at,
      ...(input.note ? { note: input.note } : {}),
    }),
  );
}

/** Act on something that needs approval first (pay it, post it): only once the chain is through. */
export function guardApproved(
  context: GuardContext,
  permission: Permission,
  input: { chain: ApprovalLevel[]; request: ApprovalRequest },
): Verdict<ApprovalRequest> {
  return guard(context, permission, () => {
    assertApproved(input.chain, input.request);
    return input.request;
  });
}

/**
 * Release a payment batch to the bank: enough current approvals, no
 * duplicates, and the person releasing did not approve it themselves.
 */
export function guardReleasePayments(
  context: GuardContext,
  input: { batch: PaymentBatch; requiredApprovals?: number },
): Verdict<PaymentBatch> {
  const deeds: Deed[] = [
    ...(context.deeds ?? []),
    ...input.batch.approvals.map((approval) => ({
      actorId: approval.approverId,
      permission: "payment.approve" as Permission,
    })),
  ];
  return guard({ ...context, deeds }, "payment.release", () => releaseBatch(input.batch, input.requiredApprovals));
}

/** Close a period: every task done and every sign-off in. */
export function guardClosePeriod(context: GuardContext, input: { tasks: CloseTask[] }): Verdict<CloseSummary> {
  return guard(context, "period.close", () => assertReadyToClose(input.tasks));
}

/** Confirm an audit finding: a person's, recorded under their id. Warnings (`findingIssues`) do not refuse it. */
export function guardConfirmFinding(context: GuardContext, input: { finding: Finding; at: string }): Verdict<Finding> {
  return guard(context, "finding.confirm", () => confirmFinding(input.finding, context.actor!.id, input.at));
}

/** Finalize a sales invoice under a number: no issues, number unused. */
export function guardFinalizeInvoice(
  context: GuardContext,
  input: { invoice: Invoice; number: string; others?: Invoice[] },
): Verdict<Invoice> {
  return guard(context, "invoice.finalize", () => finalizeInvoice(input.invoice, input.number, input.others));
}

/** Submit a VAT return: computed from a valid schema, with no open issues. */
export function guardSubmitVatReturn(
  context: GuardContext,
  input: { computation: VatReturnComputation },
): Verdict<VatReturnComputation> {
  return guard(context, "vat.submit", () => {
    assertVatReturnReady(input.computation);
    return input.computation;
  });
}

/**
 * A verdict as an HTTP answer, for any framework:
 * `const { status, body } = toHttp(verdict); return Response.json(body, { status })`.
 */
export function toHttp<T>(verdict: Verdict<T>): { status: number; body: unknown } {
  if (verdict.ok) return { status: 200, body: { ok: true, actor: verdict.actor, value: verdict.value } };
  const { status, ...body } = verdict;
  return { status, body };
}
