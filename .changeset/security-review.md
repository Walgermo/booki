---
"@booki/core": minor
"@booki/primitives": minor
"@booki/react": patch
---

Fixes from an internal security review.

- **Bank reconciliation no longer shows payment references (KIDs) to an agent.** `unmatchedBankLines` and `unmatchedPosts` carry `referenceTag` (`ref-1`, …), equal for a line and the post with the same reference, instead of `reference`. The person's tables read `openBankLines` and `openPostsLeft`.
- **A rule's error is no longer sent to the caller.** The server guard answers a duty rule with 403 `permissions.duty` (now thrown as `DutyRefusal`) and `throw new RuleRefusal(sentence)` from your own rule with 422 `server.rule`. Any other error is rethrown. If your rules threw a plain `Error` to refuse, throw `RuleRefusal` instead.
- **`ApprovalRequest.requestedFor`**: the person whose agent raised a request may not decide it.
- **`releaseBatch` refuses `requiredApprovals`** that is not a whole number of at least 1.
- **An empty `entity` is an entity**: an actor limited to other companies is refused, not let through.
- **Text read off a document** (supplier name, invoice number) is quoted and shortened in Booki's refusal sentences, so it cannot read as Booki's own words.
- `isPersonOnly` recognises a person-only sentence among several joined confirm marks.
