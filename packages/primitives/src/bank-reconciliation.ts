import {
  assertReconciled,
  summarize,
  unmatched,
  validateMatch,
  type BankLine,
  type OpenPost,
  type ReconciliationMatch,
} from "@booki-aui/core/reconciliation";
import { BookiError } from "@booki-aui/core/msg";
import { createChange, definePrimitive } from "@ui-sdk/core";

export type BankReconciliationOptions = {
  bankLines?: BankLine[];
  openPosts?: OpenPost[];
  matches?: ReconciliationMatch[];
  defaultMatches?: ReconciliationMatch[];
  onMatchesChange?: (
    matches: ReconciliationMatch[],
    details: { reason: string; source?: string; cancel?: () => void },
  ) => void;
};

/**
 * A payment reference (KID) is secret to an agent, but two that are equal tell
 * a bank line from the post it pays. Each distinct reference becomes a tag,
 * `ref-1`, `ref-2`, shared by every line and post that carries it.
 */
function tagReferences<T extends { reference?: string }>(lists: T[][]): T[][] {
  const tags = new Map<string, string>();
  const tag = (reference: string) => {
    if (!tags.has(reference)) tags.set(reference, `ref-${tags.size + 1}`);
    return tags.get(reference)!;
  };
  return lists.map((list) =>
    list.map((entry) => {
      if (!entry.reference) return entry;
      const { reference, ...rest } = entry;
      return { ...rest, referenceTag: tag(reference) } as unknown as T;
    }),
  );
}

export function derive(bankLines: BankLine[], openPosts: OpenPost[], matches: ReconciliationMatch[]) {
  const free = unmatched(bankLines, openPosts, matches);
  const [lines, posts] = tagReferences<BankLine | OpenPost>([free.bankLines, free.posts]);
  return {
    // What the agent reads: references as tags, never the KID itself.
    unmatchedBankLines: lines as BankLine[],
    unmatchedPosts: posts as OpenPost[],
    // What the person's tables show, with the references. Not in `controlled`.
    openBankLines: free.bankLines,
    openPostsLeft: free.posts,
    reconciled: summarize(bankLines, matches).reconciled,
  };
}

export function nextId(matches: ReconciliationMatch[]): string {
  const used = matches
    .map((match) => /^m(\d+)$/.exec(match.id)?.[1])
    .filter(Boolean)
    .map(Number);
  return `m${Math.max(0, ...used) + 1}`;
}

/** Which ids go where, shown in the snapshot: bank lines first, then open posts. */
export const MATCH_FORMAT =
  'suggestMatch(["bankLineId"], ["openPostId"]): bank lines first, then the posts they settle; equal referenceTag, same reference. A person approves';

/**
 * Bank reconciliation an agent can work in. The snapshot lists the bank lines
 * and open posts still unmatched, the matches so far, and `reconciled`.
 * An agent may `suggestMatch`, `withdrawMatch` (a suggestion only) and
 * `assertReconciled`. Approving or rejecting a suggestion is not an agent
 * action: a person does it with the buttons.
 */
export const bankReconciliation = definePrimitive({
  name: "bank-reconciliation",
  options: {
    bankLines: "value",
    openPosts: "value",
    matches: "value",
    defaultMatches: "value",
    onMatchesChange: "callback",
  },
  // Keys listed here are what the agent snapshot and step results carry.
  controlled: ["matches", "unmatchedBankLines", "unmatchedPosts", "reconciled", "matchFormat"],
  state: (options: BankReconciliationOptions) => {
    const bankLines = options.bankLines ?? [];
    const openPosts = options.openPosts ?? [];
    const matches = options.matches ?? options.defaultMatches ?? [];
    return { bankLines, openPosts, matches, matchFormat: MATCH_FORMAT, ...derive(bankLines, openPosts, matches) };
  },
  sync: (options: BankReconciliationOptions) =>
    options.matches === undefined
      ? {}
      : {
          matches: options.matches,
          ...derive(options.bankLines ?? [], options.openPosts ?? [], options.matches),
        },
  api: (context) => {
    const change = createChange(context);
    const lists = () => {
      const { bankLines = [], openPosts = [] } = context.options();
      return { bankLines, openPosts };
    };

    // Statement or ledger replaced by the owner: keep the derived keys current.
    context.onOptions(() => {
      const { bankLines, openPosts } = lists();
      const { matches } = context.store.get();
      context.store.set({ bankLines, openPosts, ...derive(bankLines, openPosts, matches) });
    });

    function commit(next: ReconciliationMatch[], reason: string, event?: Event) {
      const ok = change("matches", next, { reason, event });
      if (ok) {
        const { bankLines, openPosts } = lists();
        context.store.set(derive(bankLines, openPosts, next));
      }
      return ok;
    }

    function add(
      bankLineIds: unknown,
      postIds: unknown,
      status: ReconciliationMatch["status"],
      source: ReconciliationMatch["source"],
      reason: string,
      event?: Event,
    ) {
      const { bankLines, openPosts } = lists();
      const { matches } = context.store.get();
      const checked = validateMatch(bankLines, openPosts, matches, bankLineIds, postIds);
      return commit(
        [
          ...matches,
          {
            id: nextId(matches),
            bankLineIds: checked.bankLineIds,
            postIds: checked.postIds,
            status,
            source,
          },
        ],
        reason,
        event,
      );
    }

    function find(matchId: unknown) {
      const { matches } = context.store.get();
      const match = matches.find((item) => item.id === String(matchId));
      if (!match) {
        const known = matches.map((item) => item.id).join(", ");
        throw new BookiError("reconciliation.no-match", { id: String(matchId), ids: known || "none" });
      }
      return { match, matches };
    }

    function decide(matchId: unknown, status: "approved" | "rejected", event?: Event) {
      const { match, matches } = find(matchId);
      if (match.status !== "suggested") {
        throw new BookiError("reconciliation.match-decided", { id: match.id, status: match.status });
      }
      return commit(
        matches.map((item) => (item.id === match.id ? { ...item, status } : item)),
        status === "approved" ? "approve-match" : "reject-match",
        event,
      );
    }

    return {
      /** Agent: propose that these bank lines settle these open posts. */
      suggestMatch: (bankLineIds: string | string[], postIds: string | string[]) =>
        add(bankLineIds, postIds, "suggested", "agent", "suggest-match"),
      /** Agent or person: take back a suggestion nobody has decided on. */
      withdrawMatch: (matchId: string) => {
        const { match, matches } = find(matchId);
        if (match.status !== "suggested") {
          throw new BookiError("reconciliation.match-not-suggested", { id: match.id, status: match.status });
        }
        return commit(
          matches.filter((item) => item.id !== match.id),
          "withdraw-match",
        );
      },
      /** Person: match the selected rows. Approved at once, since a person chose it. */
      matchSelected: (bankLineIds: string | string[], postIds: string | string[], event?: Event) =>
        add(bankLineIds, postIds, "approved", "person", "match-selected", event),
      /** Person only. Not offered to agents. */
      approveMatch: (matchId: string, event?: Event) => decide(matchId, "approved", event),
      /** Person only. Not offered to agents. */
      rejectMatch: (matchId: string, event?: Event) => decide(matchId, "rejected", event),
      /**
       * Replace every match at once (history and staging restore `matches`).
       * A match that is new or changed becomes a suggestion: approving and
       * rejecting are a person's, so a status other than "suggested" on it is
       * refused, and a match a person already decided cannot be changed or
       * dropped here. A match given back exactly as it is passes through.
       */
      setMatches: (next: ReconciliationMatch[]) => {
        if (!Array.isArray(next)) {
          throw new BookiError("reconciliation.set-matches-shape");
        }
        const { bankLines, openPosts } = lists();
        const current = context.store.get().matches;
        const same = (a: ReconciliationMatch, b: ReconciliationMatch) =>
          a.status === b.status &&
          a.bankLineIds.join() === b.bankLineIds.join() &&
          a.postIds.join() === b.postIds.join();
        for (const decided of current.filter((match) => match.status !== "suggested")) {
          const kept = next.find((match) => match.id === decided.id);
          if (!kept || !same(kept, decided)) {
            throw new BookiError("reconciliation.decided-stays", { id: decided.id, status: decided.status });
          }
        }
        let checked: ReconciliationMatch[] = [];
        for (const given of next) {
          const before = current.find((match) => match.id === given.id);
          // A match kept as it was is the stored one, not the copy given: extra fields or a changed source never get in.
          let match: ReconciliationMatch = before && same(given, before) ? before : given;
          if (!before || !same(given, before)) {
            if (given.status && given.status !== "suggested") {
              throw new BookiError("reconciliation.only-a-person-decides", {
                id: String(given.id ?? "new"),
                status: String(given.status),
              });
            }
            match = {
              id: given.id ?? nextId([...current, ...checked]),
              bankLineIds: given.bankLineIds,
              postIds: given.postIds,
              status: "suggested",
              source: "agent",
            };
          }
          if (match.status !== "rejected") {
            validateMatch(bankLines, openPosts, checked, match.bankLineIds, match.postIds);
          }
          checked = [...checked, match];
        }
        return commit(checked, "set-matches");
      },
      assertReconciled: () => {
        const { bankLines } = lists();
        return assertReconciled(bankLines, context.store.get().matches);
      },
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-reconciled": state.reconciled ? "true" : "false" }),
      state: (state) => ({
        matches: state.matches,
        // A layout of the app's own is for the person: the rows with their references.
        // The agent reads the tagged ones, from the store.
        unmatchedBankLines: state.openBankLines,
        unmatchedPosts: state.openPostsLeft,
        openBankLines: state.openBankLines,
        openPostsLeft: state.openPostsLeft,
        summary: summarize(state.bankLines, state.matches),
      }),
    }),
    match: slot<{ bankLineIds?: string | string[]; postIds?: string | string[] }, {}>({
      props: { bankLineIds: "list", postIds: "list" },
      attrs: () => ({ type: "button" }),
      press: ({ api, props }, event) => {
        // A stale button (a match already decided) refuses; never an uncaught error in the page.
        try {
          api.matchSelected(props.bankLineIds ?? [], props.postIds ?? [], event);
        } catch {
          /* refused */
        }
      },
    }),
    // One part per suggestion. `value` is the match id and becomes the part's
    // key, so each button acts on its own match (ui-sdk's pattern for lists).
    approve: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }, event) => {
        try {
          api.approveMatch(String(key), event);
        } catch {
          /* refused */
        }
      },
    }),
    reject: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button", "data-variant": "secondary" }),
      press: ({ api, key }, event) => {
        try {
          api.rejectMatch(String(key), event);
        } catch {
          /* refused */
        }
      },
    }),
  }),
  agent: { actions: ["suggestMatch", "withdrawMatch", "setMatches", "assertReconciled"] },
});
