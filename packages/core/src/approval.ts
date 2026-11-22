import { BookiError, msg } from "./msg.js";

/** Someone who may approve at a level. */
export type Approver = {
  id: string;
  name?: string;
  /** Largest amount this person may approve, in minor units. Omit for no limit. */
  limitMinor?: number;
  /** Who may decide in this person's place, for example while they are away. */
  substituteId?: string;
};

/** One step in an approval chain. Levels are decided in order. */
export type ApprovalLevel = {
  id: string;
  name: string;
  approvers: Approver[];
  /** The level only applies at or above this amount. Omit to always apply. */
  fromMinor?: number;
  /** Who the level goes to when it is escalated. */
  escalateTo?: Approver;
};

export type ApprovalDecision = {
  levelId: string;
  /** The person who actually decided. */
  approverId: string;
  /** Set when a substitute decided for someone else. */
  onBehalfOf?: string;
  decision: "approved" | "rejected" | "escalated";
  /** ISO timestamp. */
  at: string;
  note?: string;
};

/** The thing waiting for approval: a voucher, an invoice, a payment batch. */
export type ApprovalRequest = {
  id: string;
  /** Absolute amount in minor units. Limits are checked against it. */
  amountMinor: number;
  /** Who asked. They can never approve their own request. */
  requesterId: string;
  decisions: ApprovalDecision[];
};

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ApprovalState = {
  status: ApprovalStatus;
  /** Levels that apply to this amount, in order. */
  levels: ApprovalLevel[];
  /** The level waiting for a decision. Undefined once approved or rejected. */
  current?: ApprovalLevel;
  /** True when the current level was escalated. */
  escalated: boolean;
  /** Ids of the people who may decide the current level right now. */
  mayDecide: string[];
  /** The item must not be edited while a request is pending or approved. */
  locked: boolean;
};

function checkChain(chain: ApprovalLevel[]): void {
  if (chain.length === 0) throw new BookiError("approval.chain-empty");
  const seen = new Set<string>();
  for (const level of chain) {
    if (seen.has(level.id)) throw new BookiError("approval.level-twice", { id: String(level.id) });
    seen.add(level.id);
    if (level.approvers.length === 0) {
      throw new BookiError("approval.level-no-approvers", { id: String(level.id) });
    }
  }
}

function checkAmount(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new BookiError("approval.amount-format", { value: String(amountMinor) });
  }
}

/** The levels of a chain that apply to an amount. */
export function requiredLevels(chain: ApprovalLevel[], amountMinor: number): ApprovalLevel[] {
  checkChain(chain);
  checkAmount(amountMinor);
  return chain.filter((level) => amountMinor >= (level.fromMinor ?? 0));
}

/** People who may decide a level: its approvers, their substitutes, or the escalation target. */
function eligible(
  level: ApprovalLevel,
  request: ApprovalRequest,
  escalated: boolean,
): { id: string; approver: Approver; onBehalfOf?: string }[] {
  const pool = escalated && level.escalateTo ? [level.escalateTo] : level.approvers;
  const earlier = new Set(request.decisions.filter((d) => d.decision === "approved").map((d) => d.approverId));
  const out: { id: string; approver: Approver; onBehalfOf?: string }[] = [];
  for (const approver of pool) {
    out.push({ id: approver.id, approver });
    if (approver.substituteId) {
      out.push({ id: approver.substituteId, approver, onBehalfOf: approver.id });
    }
  }
  return out.filter(
    (entry) =>
      entry.id !== request.requesterId &&
      !earlier.has(entry.id) &&
      (entry.approver.limitMinor === undefined || entry.approver.limitMinor >= request.amountMinor),
  );
}

/** Where a request stands in its chain. */
export function approvalState(chain: ApprovalLevel[], request: ApprovalRequest): ApprovalState {
  const levels = requiredLevels(chain, request.amountMinor);
  if (request.decisions.some((d) => d.decision === "rejected")) {
    return { status: "rejected", levels, escalated: false, mayDecide: [], locked: false };
  }
  const approved = new Set(request.decisions.filter((d) => d.decision === "approved").map((d) => d.levelId));
  const current = levels.find((level) => !approved.has(level.id));
  if (!current) {
    return { status: "approved", levels, escalated: false, mayDecide: [], locked: true };
  }
  const escalated = request.decisions.some((d) => d.decision === "escalated" && d.levelId === current.id);
  return {
    status: "pending",
    levels,
    current,
    escalated,
    mayDecide: [...new Set(eligible(current, request, escalated).map((entry) => entry.id))],
    locked: true,
  };
}

/**
 * Record one person's decision and return the updated request. Throws, with a
 * sentence that says why, when that person may not decide: they asked for it
 * themselves, it is not their level, their limit is too low, or they already
 * approved an earlier level.
 */
export function decide(
  chain: ApprovalLevel[],
  request: ApprovalRequest,
  input: { approverId: string; decision: ApprovalDecision["decision"]; at: string; note?: string },
): ApprovalRequest {
  const state = approvalState(chain, request);
  if (!state.current) {
    throw new BookiError("approval.already-decided", { id: String(request.id), status: state.status });
  }
  const level = state.current;
  const who = String(input.approverId ?? "").trim();
  if (who === "") throw new BookiError("approval.decider-required");
  if (who === request.requesterId) {
    throw new BookiError("approval.requester-cannot-decide", { who });
  }
  const pool = state.escalated && level.escalateTo ? [level.escalateTo] : level.approvers;
  const self = pool.find((a) => a.id === who);
  const covered = pool.find((a) => a.substituteId === who);
  const approver = self ?? covered;
  if (!approver) {
    throw new BookiError("approval.not-an-approver", {
      who,
      level: String(level.name),
      mayDecide: state.mayDecide.join(", ") || msg("approval.nobody-escalate-or-change"),
    });
  }
  if (input.decision === "approved") {
    if (approver.limitMinor !== undefined && approver.limitMinor < request.amountMinor) {
      throw new BookiError("approval.over-limit", {
        id: approver.id,
        limit: approver.limitMinor,
        amount: request.amountMinor,
        mayDecide: state.mayDecide.join(", ") || msg("approval.nobody-escalate"),
      });
    }
    if (request.decisions.some((d) => d.decision === "approved" && d.approverId === who)) {
      throw new BookiError("approval.approved-earlier-level", { who });
    }
  }
  if (input.decision === "escalated") {
    if (!level.escalateTo) throw new BookiError("approval.no-escalation", { level: String(level.name) });
    if (state.escalated) {
      throw new BookiError("approval.already-escalated", { level: String(level.name), to: level.escalateTo.id });
    }
  }
  const decision: ApprovalDecision = {
    levelId: level.id,
    approverId: who,
    decision: input.decision,
    at: input.at,
    ...(self ? {} : { onBehalfOf: approver.id }),
    ...(input.note ? { note: input.note } : {}),
  };
  return { ...request, decisions: [...request.decisions, decision] };
}

/** Throws unless every required level has approved. */
export function assertApproved(chain: ApprovalLevel[], request: ApprovalRequest): ApprovalState {
  const state = approvalState(chain, request);
  if (state.status === "rejected") throw new BookiError("approval.rejected", { id: String(request.id) });
  if (state.status === "pending") {
    throw new BookiError("approval.waiting", {
      id: String(request.id),
      level: String(state.current?.name),
      mayDecide: state.mayDecide.join(", ") || msg("approval.nobody-escalate-or-change"),
    });
  }
  return state;
}
