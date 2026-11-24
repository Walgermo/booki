# A sales CRM

A Next.js app with the screens a sales team works in every day, built from
Booki: the pipeline board, a deal's value with where the figure came from, its
history and next steps, the forecast, the conversion funnel, time in stage and
recurring revenue. Two people and an agent work it, and the server decides
every write.

```bash
pnpm install
```

```bash
pnpm --filter @booki/example-crm dev
```

Open http://localhost:3200. Sign in as one of the two people with the switch
at the top, pick a deal, and try the agent's tasks on the right. The screen is
in Norwegian; the code is commented in English.

## The agent's tasks

| Task | What the agent does | What stays with a person |
| --- | --- | --- |
| Log the call and plan the follow-up | `logActivity` (a call, with what it can be checked against) and `scheduleTask` three days out | Removing an entry |
| Update the deal after the meeting | `setValue` with an estimate and its source, `moveDeal` to the next open stage, `setExpectedClose` | Marking the deal won or lost |
| Tidy the pipeline | Reads the board's `issues`, moves close dates that have passed | Confirming amounts without a source, deals with no value, deals stuck in a stage |
| What does the forecast say? | `setGrouping("quarter")` on the forecast, reads won, committed, best case and weighted, drills into the funnel's biggest drop, reads the slowest stage | Nothing: it only reads |
| Mark the deal won | Tries `moveDeal` to the won stage and is refused: closing a deal is a person's | Pressing **Marker vunnet** |

Each task reports what it did and what waits for a person. The scripted agent
needs no key and runs the same every time; a model uses the same bridge
(`snapshot`, then `act`), as in the accounts-payable example.

## What to look at

- **`lib/crm.ts`: the server decides.** A screen proposes a whole new list
  (the board's deals, one deal's activities). The server compares it with
  what it holds and lets through only what this actor may do: moving and
  valuing a deal is `deal.edit`, closing it goes through `guardCloseDeal`,
  which refuses any agent, and removing an activity is `activity.remove`. A
  new activity is logged again on the server under the caller's own name, and
  the closer comes from the credential, never from the body.
- **`lib/people.ts`: the agent has its own credential.** `agent:kari` is the
  agent working for Kari, so the server can tell it from her.
- **Whose write it is comes from the change.** `components/crm-app.tsx` reads
  `source` from each `on…Change` and sends the agent's credential only for
  the agent's own changes.
- **`components/deal-panel.tsx`: the product's own field.** How sure the value
  is (known, estimate, unverified) is the product's `<select>` wrapped in
  `useBookiField`, so an agent can set it by name with Booki's rules.
- **One set of deals, five views.** The board, the forecast, the funnel and
  time in stage all read the same deals and stages; a known or estimated
  value without a source is shown and never summed, and the forecast names
  every deal it leaves out.
- **Recurring revenue from billed amounts.** The agreements are billed per
  month, quarter or year; `RecurringRevenue` sums them exactly per year and
  says what monthly rounding moved.
- **`lib/data.ts`: a fixed day.** The example's date is 24 November 2026, so
  the reports and the tests come out the same every time.

## Tests

```bash
pnpm --filter @booki/example-crm test
```

`test/crm.test.ts` checks the server's rules on their own. `test/tasks.test.tsx`
renders the page, runs each task through the bridge and checks what reached
the server, with the page's `fetch` going straight to the real handler.
