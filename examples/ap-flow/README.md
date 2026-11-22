# Supplier invoice to payment

A Next.js app that runs one accounts-payable flow end to end with Booki: an
inbox of scanned supplier invoices, approval, a payment batch, release to the
bank, and reconciliation against the statement. Four people and an agent work
it, and the server decides every write.

```bash
pnpm install
```

```bash
pnpm --filter @booki/example-ap-flow dev
```

Open http://localhost:3100. Sign in as one of the four people with the
switch at the top, press **Kjør agenten**, and work through the steps. The
screen is in Norwegian; the code is commented in English.

## The flow

| Step | Who | What the page shows |
| --- | --- | --- |
| Code the invoices | The agent | `proposeCoding` on each invoice it knows the supplier of |
| Spot the second copy | The agent proposes, Kari decides | `proposeRejection` fills Kari's reason; she rejects |
| Approve | Kari, or the agent under the company's rule | Small invoices from a regular supplier pass the rule (`approveUnderRule`); the rest wait for Kari |
| Prepare the batch | Nina or the agent | A ui-sdk `Button` the agent can press, like a person |
| Approve the payment | Ola | Not Kari: she approved one of the invoices |
| Release to the bank | Per | Not Ola: he approved the payment |
| Reconcile | The agent suggests, Nina approves | `suggestMatch` per bank line with exactly one open post of the same amount |

The blurry KID on the IT invoice (`si-4`) is left for a person on purpose: a
secret field is never the agent's to confirm.

## What to look at

- **`lib/books.ts`: the server decides.** Each screen proposes a whole new
  list; the server compares it with what it holds and lets through only the
  transitions this actor may make, through `@booki/core/server`'s `guard`.
  The approver comes from the credential, never from the request body. A
  refusal changes nothing and lands in the audit trail.
- **`lib/people.ts`: the agent has its own credential.** `agent:nina` is the
  agent working for Nina, so the server can tell it from her. Its deeds count
  as hers for the duty rules: a batch the agent prepared for Nina is one Nina
  may not approve.
- **`lib/rule.ts`: one rule, two places.** The inbox's `rule` option previews
  it; the server runs it again and decides.
- **Whose write it is comes from the change.** `components/ap-flow.tsx` reads
  `source` from each `on…Change` and sends the agent's credential only for the
  agent's own changes. A person's click while an agent step waits stays theirs.
- **The agent does no more than the person it works for.** `personOf` in
  `lib/books.ts`: working for Kari, it may not prepare a payment batch.
- **`lib/agent.ts`: the bridge.** `createBookiAgent` with a visible cursor.
  Approving, rejecting and releasing are a person's in Booki; the agent can't
  press those buttons, whatever `allow` says.
- **`components/ap-flow.tsx`: controlled controls.** A change shows once the
  server has answered; `lib/writes.ts` lets the agent wait for that before its
  next step.
- **`lib/script.ts` and `lib/model-agent.ts`: two agents, one bridge.** The
  scripted agent needs no key and runs the same every time. With
  `ANTHROPIC_API_KEY` in `.env.local`, **Spør agenten** hands the same page to
  Claude through `snapshot`, `query` and `act` (`app/api/agent/route.ts` is a
  fixed-purpose proxy; the tools run in the browser).

## Tests

```bash
pnpm --filter @booki/example-ap-flow test
```

`test/books.test.ts` checks the server's rules on their own;
`test/flow.test.tsx` runs the whole flow on the real page: the agent through
the bridge, the people by clicking, the server in-process.

## Not in the example

The books live in memory and reset with **Start på nytt**; your app keeps
them in its database. There is no sign-in: the switch at the top stands in
for it. Posting to the ledger, sending the batch to a bank and reading a
real statement are your integrations.
