import { BookiError, msg } from "./msg.js";

/** What the company pays for, and on what terms. */
export type ExpensePolicy = {
  /** Per category of ordinary expense. A category that is not listed is refused. */
  categories: Record<
    string,
    { receiptRequired?: boolean /** Most one line may be, in minor units. */; maxMinor?: number }
  >;
  /** Paid per kilometre driven, in minor units. */
  mileageRateMinorPerKm?: number;
  /** Per-diem rates by name (e.g. "domestic"), in minor units per whole day. */
  perDiemRates?: Record<string, number>;
};

type LineBase = {
  id: string;
  /** ISO date the cost was incurred. */
  date: string;
  description: string;
};

/** An ordinary expense: the amount is what the receipt says. */
export type ExpenseAmountLine = LineBase & {
  kind: "expense";
  category: string;
  /** Whole minor units, above zero. */
  amountMinor: number;
  /** Id of the attachment that is the receipt. */
  receiptId?: string;
};

/** Driving. The amount is distance × the policy's rate and is never typed. */
export type MileageLine = LineBase & {
  kind: "mileage";
  /** Distance in whole metres (12 500 for 12.5 km). */
  distanceMeters: number;
};

/** Per diem. The amount is days × the policy's rate and is never typed. */
export type PerDiemLine = LineBase & {
  kind: "per-diem";
  /** Whole days. */
  days: number;
  /** Name of a rate in the policy's `perDiemRates`. */
  rate: string;
};

export type ExpenseLine = ExpenseAmountLine | MileageLine | PerDiemLine;

/** A new line: an expense line without its id. */
export type ExpenseLineInput = Omit<ExpenseAmountLine, "id"> | Omit<MileageLine, "id"> | Omit<PerDiemLine, "id">;

export const EXPENSE_RULES = ["missing-receipt", "over-limit", "outside-period", "future-date"] as const;
export type ExpenseRule = (typeof EXPENSE_RULES)[number];

/** A line that breaks the policy. It does not stop the claim; someone else must accept it. */
export type PolicyException = {
  lineId: string;
  rule: ExpenseRule;
  message: string;
};

export type AcceptedException = {
  lineId: string;
  rule: ExpenseRule;
  /** Never the claimant. */
  acceptedBy: string;
  reason: string;
  /** ISO timestamp. */
  at: string;
};

export type ExpenseClaimStatus = "draft" | "submitted" | "approved" | "rejected";

export type ExpenseClaim = {
  id: string;
  /** Whose money it is. They cannot accept an exception or approve the claim. */
  claimantId: string;
  status: ExpenseClaimStatus;
  currency: string;
  /** ISO dates, both included. Lines dated outside are policy exceptions. */
  periodStart: string;
  periodEnd: string;
  lines: ExpenseLine[];
  acceptedExceptions: AcceptedException[];
  submittedAt?: string;
  decidedBy?: string;
  decidedAt?: string;
  rejectionReason?: string;
};

function isIsoDate(text: unknown): text is string {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

const list = (values: string[]) => values.join(", ") || msg("word.none");

/** Throws unless the line is well formed and the policy can price it. */
export function validateExpenseLine<T extends ExpenseLine>(line: T, policy: ExpensePolicy): T {
  const id = String(line?.id ?? "");
  if (!isIsoDate(line.date))
    throw new BookiError("expense.line-date", { id, value: String(JSON.stringify(line.date)) });
  if (typeof line.description !== "string") throw new BookiError("expense.line-description", { id });
  if (line.kind === "expense") {
    if (!Object.hasOwn(policy.categories, line.category)) {
      throw new BookiError("expense.unknown-category", {
        id,
        category: String(line.category),
        categories: list(Object.keys(policy.categories)),
      });
    }
    if (!Number.isSafeInteger(line.amountMinor) || line.amountMinor <= 0) {
      throw new BookiError("expense.line-amount", { id, value: String(line.amountMinor) });
    }
    return line;
  }
  if ("amountMinor" in (line as object)) {
    throw new BookiError("expense.amount-computed", { id, kind: String((line as ExpenseLine).kind) });
  }
  if (line.kind === "mileage") {
    if (!Number.isSafeInteger(line.distanceMeters) || line.distanceMeters <= 0) {
      throw new BookiError("expense.distance", { id, value: String(line.distanceMeters) });
    }
    const rate = policy.mileageRateMinorPerKm;
    if (rate === undefined || !Number.isSafeInteger(rate) || rate < 0) {
      throw new BookiError("expense.no-mileage-rate", { id });
    }
    return line;
  }
  if (line.kind === "per-diem") {
    if (!Number.isSafeInteger(line.days) || line.days <= 0) {
      throw new BookiError("expense.days", { id, value: String(line.days) });
    }
    const rates = policy.perDiemRates ?? {};
    if (!Object.hasOwn(rates, line.rate)) {
      throw new BookiError("expense.unknown-per-diem-rate", {
        id,
        rate: String(line.rate),
        rates: list(Object.keys(rates)),
      });
    }
    return line;
  }
  throw new BookiError("expense.unknown-kind", { id, value: String((line as { kind?: unknown }).kind) });
}

/** What a line is worth in minor units. Mileage and per diem are priced from the policy. */
export function lineAmountMinor(line: ExpenseLine, policy: ExpensePolicy): number {
  validateExpenseLine(line, policy);
  if (line.kind === "expense") return line.amountMinor;
  if (line.kind === "mileage") {
    // metres × (minor per km) / 1000, rounded half up in whole numbers.
    return Math.floor((line.distanceMeters * (policy.mileageRateMinorPerKm ?? 0) + 500) / 1000);
  }
  return line.days * (policy.perDiemRates?.[line.rate] ?? 0);
}

/** Sum of every line. A line the policy cannot price counts as zero and shows up in `claimIssues`. */
export function claimTotalMinor(claim: Pick<ExpenseClaim, "lines">, policy: ExpensePolicy): number {
  return claim.lines.reduce((sum, line) => {
    try {
      return sum + lineAmountMinor(line, policy);
    } catch {
      return sum;
    }
  }, 0);
}

/**
 * Every line that breaks the policy: no receipt where one is required, above
 * the category's limit, dated outside the claim period, or dated after `today`.
 */
export function policyExceptions(claim: ExpenseClaim, policy: ExpensePolicy, today: string): PolicyException[] {
  const found: PolicyException[] = [];
  for (const line of claim.lines) {
    if (line.kind === "expense") {
      const rule = policy.categories[line.category];
      if (rule?.receiptRequired && !String(line.receiptId ?? "").trim()) {
        found.push({
          lineId: line.id,
          rule: "missing-receipt",
          message: msg("expense.missing-receipt", { id: line.id, category: line.category }),
        });
      }
      if (rule?.maxMinor !== undefined && line.amountMinor > rule.maxMinor) {
        found.push({
          lineId: line.id,
          rule: "over-limit",
          message: msg("expense.over-limit", {
            id: line.id,
            amount: line.amountMinor,
            category: line.category,
            limit: rule.maxMinor,
          }),
        });
      }
    }
    if (!isIsoDate(line.date)) continue;
    if (line.date < claim.periodStart || line.date > claim.periodEnd) {
      found.push({
        lineId: line.id,
        rule: "outside-period",
        message: msg("expense.outside-period", {
          id: line.id,
          date: line.date,
          start: String(claim.periodStart),
          end: String(claim.periodEnd),
        }),
      });
    }
    if (line.date > today) {
      found.push({
        lineId: line.id,
        rule: "future-date",
        message: msg("expense.future-date", { id: line.id, date: line.date, today: String(today) }),
      });
    }
  }
  return found;
}

/** Policy exceptions nobody has accepted yet. */
export function openExceptions(claim: ExpenseClaim, policy: ExpensePolicy, today: string): PolicyException[] {
  return policyExceptions(claim, policy, today).filter(
    (exception) => !claim.acceptedExceptions.some((a) => a.lineId === exception.lineId && a.rule === exception.rule),
  );
}

/** What is wrong with the claim itself (not policy exceptions), as sentences. */
export function claimIssues(claim: ExpenseClaim, policy: ExpensePolicy): string[] {
  const issues: string[] = [];
  if (!String(claim.claimantId ?? "").trim()) issues.push(msg("expense.no-claimant"));
  if (!isIsoDate(claim.periodStart) || !isIsoDate(claim.periodEnd) || claim.periodEnd < claim.periodStart) {
    issues.push(msg("expense.period", { start: String(claim.periodStart), end: String(claim.periodEnd) }));
  }
  if (claim.lines.length === 0) issues.push(msg("expense.no-lines"));
  const ids = new Set<string>();
  for (const line of claim.lines) {
    if (ids.has(line.id)) issues.push(msg("expense.line-twice", { id: String(line.id) }));
    ids.add(line.id);
    try {
      validateExpenseLine(line, policy);
    } catch (error) {
      issues.push((error as Error).message);
    }
  }
  return issues;
}

function assertDraft(claim: ExpenseClaim): void {
  if (claim.status !== "draft") {
    throw new BookiError("expense.locked", { id: String(claim.id), status: claim.status });
  }
}

function lineOf(claim: ExpenseClaim, lineId: string): ExpenseLine {
  const line = claim.lines.find((item) => item.id === String(lineId));
  if (!line) {
    throw new BookiError("expense.no-line", {
      id: String(lineId),
      claim: String(claim.id),
      lines: list(claim.lines.map((item) => item.id)),
    });
  }
  return line;
}

function nextLineId(lines: ExpenseLine[]): string {
  const used = lines
    .map((line) => /^l(\d+)$/.exec(line.id)?.[1])
    .filter(Boolean)
    .map(Number);
  return `l${Math.max(0, ...used) + 1}`;
}

/** The fields a line takes, as an agent writes them. `distanceKm` is read as people say it and stored in metres. */
export const EXPENSE_LINE_FIELDS = [
  "kind",
  "date",
  "category",
  "description",
  "amountMinor",
  "receiptId",
  "distanceKm",
  "distanceMeters",
  "days",
  "rate",
] as const;

/**
 * A line or patch given as an object with the names people use, checked and
 * converted: an unknown field is refused with the fields that exist, and
 * `distanceKm: 12.5` becomes `distanceMeters: 12500`. Money stays minor units.
 */
export function expenseLineFields(input: unknown, id = "new"): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new BookiError("expense.line-shape");
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (key === "id" || value === undefined) continue;
    if (!(EXPENSE_LINE_FIELDS as readonly string[]).includes(key)) {
      throw new BookiError("expense.line-unknown-field", { id, field: key, fields: EXPENSE_LINE_FIELDS.join(", ") });
    }
    if (key === "distanceKm") {
      const km = typeof value === "string" ? Number(value.trim().replace(",", ".")) : Number(value);
      out.distanceMeters = Number.isFinite(km) ? Math.round(km * 1000) : value;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Add a line to a draft. The line gets the next id (l1, l2, …). */
export function addExpenseLine(claim: ExpenseClaim, input: ExpenseLineInput, policy: ExpensePolicy): ExpenseClaim {
  assertDraft(claim);
  if (typeof input !== "object" || input === null) {
    throw new BookiError("expense.line-shape");
  }
  const id = nextLineId(claim.lines);
  const line = validateExpenseLine({ ...expenseLineFields(input, id), id } as ExpenseLine, policy);
  return { ...claim, lines: [...claim.lines, line] };
}

/** Change fields of a line on a draft. Its kind stays; accepted exceptions on the line are dropped. */
export function setExpenseLine(
  claim: ExpenseClaim,
  lineId: string,
  patch: Record<string, unknown>,
  policy: ExpensePolicy,
): ExpenseClaim {
  assertDraft(claim);
  const current = lineOf(claim, lineId);
  if (typeof patch !== "object" || patch === null) {
    throw new BookiError("expense.set-line-shape");
  }
  patch = expenseLineFields(patch, String(current.id));
  if ("kind" in patch && patch.kind !== current.kind) {
    throw new BookiError("expense.kind-change", {
      id: String(current.id),
      kind: current.kind,
      next: String(patch.kind),
    });
  }
  const merged: Record<string, unknown> = { ...current, ...patch, id: current.id, kind: current.kind };
  if (merged.receiptId === "" || merged.receiptId === null) delete merged.receiptId;
  const next = validateExpenseLine(merged as ExpenseLine, policy);
  return {
    ...claim,
    lines: claim.lines.map((line) => (line.id === current.id ? next : line)),
    acceptedExceptions: claim.acceptedExceptions.filter((a) => a.lineId !== current.id),
  };
}

/** Take a line off a draft. */
export function removeExpenseLine(claim: ExpenseClaim, lineId: string): ExpenseClaim {
  assertDraft(claim);
  const current = lineOf(claim, lineId);
  return {
    ...claim,
    lines: claim.lines.filter((line) => line.id !== current.id),
    acceptedExceptions: claim.acceptedExceptions.filter((a) => a.lineId !== current.id),
  };
}

/** Throws with every reason a draft cannot be submitted. Policy exceptions do not stop it. */
export function assertSubmittable(claim: ExpenseClaim, policy: ExpensePolicy): void {
  if (claim.status !== "draft")
    throw new BookiError("expense.already-submitted", { id: String(claim.id), status: claim.status });
  const issues = claimIssues(claim, policy);
  if (issues.length > 0) throw new BookiError("expense.not-submittable", { id: String(claim.id), issues });
}

function person(actor: string, what: string): string {
  const id = String(actor ?? "").trim();
  if (id === "") throw new BookiError("expense.actor-required", { what });
  return id;
}

/** A person sends the draft for approval. */
export function submitClaim(claim: ExpenseClaim, actor: string, at: string, policy: ExpensePolicy): ExpenseClaim {
  person(actor, msg("expense.what.submit"));
  assertSubmittable(claim, policy);
  return { ...claim, status: "submitted", submittedAt: at };
}

/**
 * Someone other than the claimant accepts one policy exception, with a reason.
 * Allowed on a draft or a submitted claim.
 */
export function acceptException(
  claim: ExpenseClaim,
  lineId: string,
  rule: ExpenseRule,
  actor: string,
  reason: string,
  at: string,
  policy: ExpensePolicy,
  today: string,
): ExpenseClaim {
  if (claim.status !== "draft" && claim.status !== "submitted") {
    throw new BookiError("expense.exceptions-closed", { id: String(claim.id), status: claim.status });
  }
  const who = person(actor, msg("expense.what.accept-exception"));
  if (who === claim.claimantId) {
    throw new BookiError("expense.claimant-cannot-accept", { who });
  }
  const line = lineOf(claim, lineId);
  if (!(EXPENSE_RULES as readonly string[]).includes(String(rule))) {
    throw new BookiError("expense.unknown-rule", { rule: String(rule), rules: EXPENSE_RULES.join(", ") });
  }
  const open = openExceptions(claim, policy, today);
  if (!open.some((exception) => exception.lineId === line.id && exception.rule === rule)) {
    throw new BookiError("expense.no-open-exception", {
      id: String(line.id),
      rule: String(rule),
      open: list(open.map((e) => `${e.lineId} ${e.rule}`)),
    });
  }
  const why = String(reason ?? "").trim();
  if (why === "")
    throw new BookiError("expense.exception-reason-required", { rule: String(rule), id: String(line.id) });
  return {
    ...claim,
    acceptedExceptions: [...claim.acceptedExceptions, { lineId: line.id, rule, acceptedBy: who, reason: why, at }],
  };
}

/** Throws unless a submitted claim has every policy exception accepted. */
export function assertClaimApprovable(claim: ExpenseClaim, policy: ExpensePolicy, today: string): void {
  if (claim.status !== "submitted") {
    throw new BookiError("expense.not-approvable-status", { id: String(claim.id), status: claim.status });
  }
  const issues = claimIssues(claim, policy);
  if (issues.length > 0) throw new BookiError("expense.not-approvable", { id: String(claim.id), issues });
  const open = openExceptions(claim, policy, today);
  if (open.length > 0) {
    throw new BookiError("expense.open-exceptions", {
      id: String(claim.id),
      count: open.length,
      exceptions: open.map((e) => e.message),
    });
  }
}

/** Someone other than the claimant approves a submitted claim. */
export function approveClaim(
  claim: ExpenseClaim,
  actor: string,
  at: string,
  policy: ExpensePolicy,
  today: string,
): ExpenseClaim {
  const who = person(actor, msg("expense.what.approve"));
  if (who === claim.claimantId) {
    throw new BookiError("expense.claimant-cannot-approve", { who });
  }
  assertClaimApprovable(claim, policy, today);
  return { ...claim, status: "approved", decidedBy: who, decidedAt: at };
}

/** Someone other than the claimant turns a submitted claim down, with a reason. */
export function rejectClaim(claim: ExpenseClaim, actor: string, reason: string, at: string): ExpenseClaim {
  const who = person(actor, msg("expense.what.reject"));
  if (claim.status !== "submitted") {
    throw new BookiError("expense.not-rejectable-status", { id: String(claim.id), status: claim.status });
  }
  if (who === claim.claimantId) {
    throw new BookiError("expense.claimant-cannot-reject", { who });
  }
  const why = String(reason ?? "").trim();
  if (why === "") throw new BookiError("expense.reject-reason-required", { id: String(claim.id) });
  return { ...claim, status: "rejected", decidedBy: who, decidedAt: at, rejectionReason: why };
}
