import { BookiError, msg } from "./msg.js";

/**
 * Audit findings: what the auditor found, on what basis, and who stands behind
 * it. Raising and editing a draft is preparation an agent may do; confirming
 * and withdrawing are a person's judgment (ISA 230 documentation, ISA 265
 * deficiencies, ISA 450 misstatements). Every change appends to the log, which
 * is never rewritten.
 */

export const FINDING_CATEGORIES = ["misstatement", "control-deficiency", "compliance", "other"] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

/**
 * - `draft`: raised, still being worked on.
 * - `confirmed`: a person stands behind it.
 * - `withdrawn`: a person took it back, with a reason.
 */
export type FindingStatus = "draft" | "confirmed" | "withdrawn";

/**
 * The evidence status of a finding:
 * - `documented`: shown by evidence on file (`sources`).
 * - `reported`: information a party gave (the client, a third party), not yet checked.
 * - `hypothesis`: what the auditor suspects, not yet shown.
 */
export const FINDING_BASES = ["documented", "reported", "hypothesis"] as const;
export type FindingBasis = (typeof FINDING_BASES)[number];

export type FindingLogAction = "raised" | "edited" | "source-linked" | "confirmed" | "withdrawn" | "reopened";

/** One line of a finding's history. The log only grows. */
export type FindingLogEntry = { at: string; by: string; action: FindingLogAction; note?: string };

export type Finding = {
  id: string;
  /** The engagement's own reference, e.g. "F-03". */
  code?: string;
  title: string;
  description?: string;
  category: FindingCategory;
  /** The amount at stake, in minor units (12500 = 125.00). */
  amountMinor?: number;
  /** ISO 4217 code of `amountMinor`. */
  currency?: string;
  status: FindingStatus;
  basis: FindingBasis;
  /** Ids of the evidence the finding rests on. */
  sources: string[];
  /** Kept from agents: they see that it exists, never what it says. */
  confidential: boolean;
  raisedBy: string;
  confirmedBy?: string;
  withdrawnBy?: string;
  withdrawReason?: string;
  log: FindingLogEntry[];
};

/** What may change on a draft with `editFinding`. Basis has `setBasis`; sources `linkSource`. */
export type FindingPatch = Partial<
  Pick<Finding, "title" | "code" | "description" | "category" | "amountMinor" | "currency" | "confidential">
>;

export const FINDING_PATCH_FIELDS = [
  "title",
  "code",
  "description",
  "category",
  "amountMinor",
  "currency",
  "confidential",
] as const;

/** A withdrawal is kept with the file, so its reason must say something: at least this many characters. */
export const WITHDRAW_REASON_MIN = 20;

/** What stands in for a confidential finding's text when an agent reads it. */
export const CONFIDENTIAL_MARKER = "[confidential]";

const CATEGORY_LIST = FINDING_CATEGORIES.join(", ");
const BASIS_LIST = FINDING_BASES.join(", ");

/** Throws unless `value` is a finding category. */
export function checkFindingCategory(value: unknown): FindingCategory {
  if (!(FINDING_CATEGORIES as readonly string[]).includes(String(value))) {
    throw new BookiError("finding.unknown-category", { value: String(value), categories: CATEGORY_LIST });
  }
  return value as FindingCategory;
}

/** Throws unless `value` is a finding basis. */
export function checkFindingBasis(value: unknown): FindingBasis {
  if (!(FINDING_BASES as readonly string[]).includes(String(value))) {
    throw new BookiError("finding.unknown-basis", { value: String(value), bases: BASIS_LIST });
  }
  return value as FindingBasis;
}

const who = (by: unknown) => {
  const id = String(by ?? "").trim();
  if (id === "") throw new BookiError("finding.actor-required");
  return id;
};

function checkText(id: string, field: string, value: unknown, required: boolean): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string")
    throw new BookiError("finding.field-text", { id, field, value: JSON.stringify(value) ?? String(value) });
  const text = value.trim();
  if (required && text === "") throw new BookiError("finding.field-empty", { id, field });
  return text === "" ? undefined : text;
}

function checkAmount(id: string, value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new BookiError("finding.amount-format", { id, value: String(value) });
  }
  return value;
}

function checkCurrency(id: string, value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const code = String(value).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new BookiError("finding.currency-format", { id, value: String(value) });
  return code;
}

function draftOnly(finding: Finding): void {
  if (finding.status !== "draft") throw new BookiError("finding.not-draft", { id: finding.id, status: finding.status });
}

const entry = (at: string, by: string, action: FindingLogAction, note?: string): FindingLogEntry =>
  note ? { at, by, action, note } : { at, by, action };

/** Drop keys whose value is undefined, so an optional field cleared is absent. */
function tidy<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

export type NewFinding = {
  id: string;
  title: string;
  category: FindingCategory;
  basis: FindingBasis;
  code?: string;
  description?: string;
  amountMinor?: number;
  currency?: string;
  sources?: string[];
  confidential?: boolean;
};

/** Raise a finding as a draft. The log starts with who raised it. */
export function createFinding(input: NewFinding, by: string, at: string): Finding {
  const id = String(input?.id ?? "").trim();
  if (id === "") throw new BookiError("finding.id-required");
  const raisedBy = who(by);
  const sources = [...new Set((input.sources ?? []).map((source) => String(source).trim()).filter(Boolean))];
  return tidy({
    id,
    code: checkText(id, "code", input.code, false),
    title: checkText(id, "title", input.title, true) as string,
    description: checkText(id, "description", input.description, false),
    category: checkFindingCategory(input.category),
    amountMinor: checkAmount(id, input.amountMinor),
    currency: checkCurrency(id, input.currency),
    status: "draft" as FindingStatus,
    basis: checkFindingBasis(input.basis),
    sources,
    confidential: Boolean(input.confidential),
    raisedBy,
    log: [entry(at, raisedBy, "raised")],
  });
}

/** Change a draft's text, category or amount. Refused once it is confirmed or withdrawn. */
export function editFinding(finding: Finding, patch: FindingPatch, by: string, at: string): Finding {
  draftOnly(finding);
  const actor = who(by);
  for (const key of Object.keys(patch ?? {})) {
    if (!(FINDING_PATCH_FIELDS as readonly string[]).includes(key)) {
      throw new BookiError("finding.unknown-field", {
        id: finding.id,
        field: key,
        fields: FINDING_PATCH_FIELDS.join(", "),
      });
    }
  }
  const next: Record<string, unknown> = { ...finding };
  const changed: string[] = [];
  const set = (key: keyof Finding, value: unknown) => {
    if (Object.is(finding[key], value)) return;
    next[key] = value;
    changed.push(key);
  };
  const id = finding.id;
  if ("title" in patch) set("title", checkText(id, "title", patch.title, true));
  if ("code" in patch) set("code", checkText(id, "code", patch.code, false));
  if ("description" in patch) set("description", checkText(id, "description", patch.description, false));
  if ("category" in patch) set("category", checkFindingCategory(patch.category));
  if ("amountMinor" in patch) set("amountMinor", checkAmount(id, patch.amountMinor));
  if ("currency" in patch) set("currency", checkCurrency(id, patch.currency));
  if ("confidential" in patch) set("confidential", Boolean(patch.confidential));
  if (changed.length === 0) return finding;
  return tidy({ ...next, log: [...finding.log, entry(at, actor, "edited", changed.join(", "))] }) as Finding;
}

/** Cite a piece of evidence. A draft only; the same source twice is refused. */
export function linkSource(finding: Finding, sourceId: string, by: string, at: string): Finding {
  draftOnly(finding);
  const actor = who(by);
  const source = String(sourceId ?? "").trim();
  if (source === "") throw new BookiError("finding.source-required", { id: finding.id });
  if (finding.sources.includes(source)) throw new BookiError("finding.source-twice", { id: finding.id, source });
  return {
    ...finding,
    sources: [...finding.sources, source],
    log: [...finding.log, entry(at, actor, "source-linked", source)],
  };
}

/** Say what the finding rests on. A draft only. */
export function setBasis(finding: Finding, basis: FindingBasis, by: string, at: string): Finding {
  draftOnly(finding);
  const actor = who(by);
  const next = checkFindingBasis(basis);
  if (next === finding.basis) return finding;
  return {
    ...finding,
    basis: next,
    log: [...finding.log, entry(at, actor, "edited", `basis: ${finding.basis} → ${next}`)],
  };
}

/**
 * What a person should weigh before confirming, as sentences. These are
 * warnings: the auditor's judgment decides, so none of them blocks a
 * confirmation.
 */
export function findingIssues(finding: Finding): string[] {
  const issues: string[] = [];
  const id = finding.id;
  if (finding.basis === "documented" && finding.sources.length === 0)
    issues.push(msg("finding.issue.documented-without-sources", { id }));
  if (finding.basis === "hypothesis") {
    issues.push(
      msg(finding.status === "confirmed" ? "finding.issue.confirmed-hypothesis" : "finding.issue.hypothesis", { id }),
    );
  }
  if (finding.amountMinor !== undefined && !finding.currency)
    issues.push(msg("finding.issue.amount-without-currency", { id }));
  if (finding.category === "misstatement" && finding.amountMinor === undefined)
    issues.push(msg("finding.issue.misstatement-without-amount", { id }));
  return issues;
}

/** Throws with the warnings as one sentence, for an agent asking before a person decides. */
export function assertConfirmable(finding: Finding): void {
  draftOnly(finding);
  const issues = findingIssues(finding);
  if (issues.length) throw new BookiError("finding.not-confirmable", { id: finding.id, issues });
}

/** A person confirms a draft. Warnings do not stop it; they are the person's to weigh. */
export function confirmFinding(finding: Finding, by: string, at: string): Finding {
  draftOnly(finding);
  const actor = who(by);
  return { ...finding, status: "confirmed", confirmedBy: actor, log: [...finding.log, entry(at, actor, "confirmed")] };
}

/** A person withdraws a finding, saying why in at least `WITHDRAW_REASON_MIN` characters. */
export function withdrawFinding(finding: Finding, by: string, at: string, reason: string): Finding {
  if (finding.status === "withdrawn")
    throw new BookiError("finding.already-withdrawn", { id: finding.id, by: String(finding.withdrawnBy ?? "") });
  const actor = who(by);
  const text = String(reason ?? "").trim();
  if (text.length < WITHDRAW_REASON_MIN) {
    throw new BookiError("finding.withdraw-reason", { id: finding.id, min: WITHDRAW_REASON_MIN, length: text.length });
  }
  return {
    ...finding,
    status: "withdrawn",
    withdrawnBy: actor,
    withdrawReason: text,
    log: [...finding.log, entry(at, actor, "withdrawn", text)],
  };
}

/** Back to draft from confirmed or withdrawn. Who confirmed or withdrew stays in the log. */
export function reopenFinding(finding: Finding, by: string, at: string): Finding {
  if (finding.status === "draft") throw new BookiError("finding.not-reopenable", { id: finding.id });
  const actor = who(by);
  const { confirmedBy: _c, withdrawnBy: _w, withdrawReason: _r, ...rest } = finding;
  return { ...rest, status: "draft", log: [...finding.log, entry(at, actor, "reopened")] };
}

/** What an agent reads of a finding. */
export type RedactedFinding = Omit<Finding, "log" | "sources"> & {
  sources?: string[];
  sourceCount: number;
  logCount: number;
  log?: FindingLogEntry[];
};

/**
 * A finding as an agent may read it. A confidential one keeps its id, code,
 * category, status, basis, who raised and decided it, and its counts; its
 * title and description become "[confidential]", and its amount, sources,
 * withdrawal reason and log are left out. Any other finding is shown whole.
 */
export function redactFinding(finding: Finding): RedactedFinding {
  if (!finding.confidential) {
    return { ...finding, sourceCount: finding.sources.length, logCount: finding.log.length };
  }
  return tidy({
    id: finding.id,
    code: finding.code,
    title: CONFIDENTIAL_MARKER,
    description: finding.description === undefined ? undefined : CONFIDENTIAL_MARKER,
    category: finding.category,
    status: finding.status,
    basis: finding.basis,
    confidential: true,
    raisedBy: finding.raisedBy,
    confirmedBy: finding.confirmedBy,
    withdrawnBy: finding.withdrawnBy,
    sourceCount: finding.sources.length,
    logCount: finding.log.length,
  }) as RedactedFinding;
}
