import type { ReconciliationMatch } from "@booki/core/reconciliation";
import { BankReconciliation } from "@booki/react";
import { useState } from "react";

import { BANK_LINES, OPEN_POSTS } from "./workflow-data";

/**
 * Bank reconciliation on Booki: the same twelve statement lines and twelve
 * open posts as the replica, and no matches made in advance (the page does
 * not run the library's own matching rule, so the agent does the work). An
 * agent may suggest a match; approving or rejecting a suggestion is a
 * person's button in BankReconciliation, so the agent's part ends with every
 * line it can match waiting for the person.
 */

export type BookiReconcileState = { matches: ReconciliationMatch[] };

export function BookiReconcile() {
  const [matches, setMatches] = useState<ReconciliationMatch[]>([]);

  // For the benchmark's end-state checks only.
  (window as unknown as { __accReconcile?: BookiReconcileState }).__accReconcile = { matches };

  return (
    <div className="acc-invoice">
      <h1 className="mt-0 text-xl font-semibold">Bankavstemming · 1920 Bankinnskudd · oktober 2026</h1>
      <BankReconciliation
        bankLines={BANK_LINES}
        openPosts={OPEN_POSTS}
        matches={matches}
        onMatchesChange={setMatches}
        aria-label="Bankavstemming"
      />
      <p className="m-0 text-sm text-muted-foreground">Forslag til avstemming godkjennes av en person.</p>
    </div>
  );
}
