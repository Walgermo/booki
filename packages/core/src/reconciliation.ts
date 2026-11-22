import { BookiError, msg } from "./msg.js";

/** One line on a bank statement. Amount is signed: positive is money in. */
export type BankLine = {
  id: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  description: string;
  /** Signed integer minor units. Positive is money in, negative is money out. */
  amountMinor: number;
  /** Payment reference from the bank, such as a KID. */
  reference?: string;
};

/** An open ledger post waiting for a payment, signed the same way as a bank line. */
export type OpenPost = {
  id: string;
  date: string;
  description: string;
  amountMinor: number;
  /** Reference on the ledger side, such as an invoice number or KID. */
  reference?: string;
};

export type MatchStatus = "suggested" | "approved" | "rejected";

/** Bank lines set against open posts. One to one, one to many or many to many. */
export type ReconciliationMatch = {
  id: string;
  bankLineIds: string[];
  postIds: string[];
  status: MatchStatus;
  /** Who proposed it: a matching rule, an agent, or a person. */
  source: "rule" | "agent" | "person";
};

export type ReconciliationSummary = {
  bankLineCount: number;
  /** Bank lines in an approved match. */
  matchedCount: number;
  /** Bank lines in a match that still waits for a person. */
  suggestedCount: number;
  /** Bank lines in no live match. */
  unmatchedCount: number;
  /** Sum of the bank lines not yet in an approved match, in minor units. */
  outstandingMinor: number;
  /** True when every bank line is in an approved match. */
  reconciled: boolean;
};

const live = (match: ReconciliationMatch) => match.status !== "rejected";

function ids(value: unknown, what: string): string[] {
  const list = Array.isArray(value) ? value : [value];
  const out = list.map((item) => String(item ?? "").trim());
  if (out.length === 0 || out.some((item) => item === "")) {
    throw new BookiError("reconciliation.ids-required", { what, value: JSON.stringify(value) ?? String(value) });
  }
  if (new Set(out).size !== out.length) {
    throw new BookiError("reconciliation.id-twice", { what, ids: JSON.stringify(out) });
  }
  return out;
}

function sample<T extends { id: string }>(items: T[]): string {
  const shown = items
    .slice(0, 6)
    .map((item) => item.id)
    .join(", ");
  return items.length > 6 ? `${shown}, … (${items.length})` : shown || msg("word.none");
}

/** Bank lines and posts that are in no suggested or approved match. */
export function unmatched(
  bankLines: BankLine[],
  posts: OpenPost[],
  matches: ReconciliationMatch[],
): { bankLines: BankLine[]; posts: OpenPost[] } {
  const usedLines = new Set(matches.filter(live).flatMap((m) => m.bankLineIds));
  const usedPosts = new Set(matches.filter(live).flatMap((m) => m.postIds));
  return {
    bankLines: bankLines.filter((line) => !usedLines.has(line.id)),
    posts: posts.filter((post) => !usedPosts.has(post.id)),
  };
}

/**
 * Check a proposed match and return its normalized ids. Throws, with a
 * sentence an agent or a person can act on, when an id does not exist, is
 * already in another match, or the two sides do not sum to the same amount.
 */
export function validateMatch(
  bankLines: BankLine[],
  posts: OpenPost[],
  matches: ReconciliationMatch[],
  bankLineIds: unknown,
  postIds: unknown,
): { bankLineIds: string[]; postIds: string[]; amountMinor: number } {
  const lineIds = ids(bankLineIds, msg("word.bank-line"));
  const openIds = ids(postIds, msg("word.open-post"));
  const free = unmatched(bankLines, posts, matches);

  const pickedLines = lineIds.map((id) => {
    const line = bankLines.find((item) => item.id === id);
    if (!line) {
      throw new BookiError("reconciliation.no-bank-line", { id, sample: sample(free.bankLines) });
    }
    if (!free.bankLines.includes(line)) {
      throw new BookiError("reconciliation.bank-line-taken", { id });
    }
    return line;
  });
  const pickedPosts = openIds.map((id) => {
    const post = posts.find((item) => item.id === id);
    if (!post) {
      throw new BookiError("reconciliation.no-open-post", { id, sample: sample(free.posts) });
    }
    if (!free.posts.includes(post)) {
      throw new BookiError("reconciliation.open-post-taken", { id });
    }
    return post;
  });

  const bankSum = pickedLines.reduce((sum, line) => sum + line.amountMinor, 0);
  const postSum = pickedPosts.reduce((sum, post) => sum + post.amountMinor, 0);
  if (bankSum !== postSum) {
    throw new BookiError("reconciliation.sides-differ", {
      difference: bankSum - postSum,
      bank: bankSum,
      ledger: postSum,
    });
  }
  return { bankLineIds: lineIds, postIds: openIds, amountMinor: bankSum };
}

export function summarize(bankLines: BankLine[], matches: ReconciliationMatch[]): ReconciliationSummary {
  const approved = new Set(matches.filter((m) => m.status === "approved").flatMap((m) => m.bankLineIds));
  const suggested = new Set(matches.filter((m) => m.status === "suggested").flatMap((m) => m.bankLineIds));
  const outstandingMinor = bankLines
    .filter((line) => !approved.has(line.id))
    .reduce((sum, line) => sum + line.amountMinor, 0);
  // Count this statement's own lines: a match may also name lines from another statement.
  const matched = bankLines.filter((line) => approved.has(line.id)).length;
  const waiting = bankLines.filter((line) => !approved.has(line.id) && suggested.has(line.id)).length;
  return {
    bankLineCount: bankLines.length,
    matchedCount: matched,
    suggestedCount: waiting,
    unmatchedCount: bankLines.length - matched - waiting,
    outstandingMinor,
    reconciled: bankLines.length > 0 && matched === bankLines.length,
  };
}

/** Throws unless every bank line is in an approved match. */
export function assertReconciled(bankLines: BankLine[], matches: ReconciliationMatch[]): ReconciliationSummary {
  const summary = summarize(bankLines, matches);
  if (!summary.reconciled) {
    throw new BookiError("reconciliation.not-reconciled", {
      unmatched: summary.unmatchedCount,
      suggested: summary.suggestedCount,
      outstanding: summary.outstandingMinor,
    });
  }
  return summary;
}

/**
 * One-to-one suggestions a rule can make safely: a bank line and an open post
 * that share a reference, or the only pair with that exact amount. Anything
 * ambiguous is left for an agent or a person.
 */
export function suggestMatches(
  bankLines: BankLine[],
  posts: OpenPost[],
  matches: ReconciliationMatch[] = [],
): ReconciliationMatch[] {
  const free = unmatched(bankLines, posts, matches);
  const takenPosts = new Set<string>();
  const out: ReconciliationMatch[] = [];
  const sameAmount = (minor: number) =>
    free.posts.filter((post) => post.amountMinor === minor && !takenPosts.has(post.id));

  for (const line of free.bankLines) {
    const candidates = sameAmount(line.amountMinor);
    const byReference = line.reference ? candidates.filter((post) => post.reference === line.reference) : [];
    const linesWithAmount = free.bankLines.filter((other) => other.amountMinor === line.amountMinor);
    const pick =
      byReference.length === 1
        ? byReference[0]
        : candidates.length === 1 && linesWithAmount.length === 1
          ? candidates[0]
          : undefined;
    if (!pick) continue;
    takenPosts.add(pick.id);
    out.push({
      id: `rule-${line.id}-${pick.id}`,
      bankLineIds: [line.id],
      postIds: [pick.id],
      status: "suggested",
      source: "rule",
    });
  }
  return out;
}
