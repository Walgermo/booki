# A one-screen pilot

For an ERP or accounting product that wants to know, with its own numbers,
what Booki changes for agents. One screen, two weeks, measured before and
after on your own staging, with your own data.

## What you get at the end

- One screen in your product that agents operate by name, under your rules,
  recorded in your audit trail as the agent.
- The same rules enforced in your API for that screen.
- A before/after report from your own screen: tool calls, model turns, tokens
  billed, cost at list prices, time, and how often the agent got it right.

## Pick the screen

Pick one where agents already struggle and where a mistake costs something.

Supplier invoice entry exercises amount, account and VAT pickers. A read-only
dashboard is a smaller first step if the goal is to make figures in charts
available to the agent.

The [live benchmark](https://booki.dev/#benchmark-summary) shows the current
counted results. The [run ledger](../benchmarks/agent/RUNS.md) records which
runs were withdrawn and why. The [API comparison](../benchmarks/agent/README.md#booki-against-an-agent-on-an-api-25-november-2026)
also matters if your product already has a bookkeeping API. Use your own
staging screen for the pilot baseline.

## Two weeks

| Days | Step | Done when |
| --- | --- | --- |
| 1–2 | **Baseline.** Add your current screen as a `browser` page in `benchmarks/agent/src/tasks.ts` (a `path`, a `ready` check and a `verify` that reads your screen's end state), and write the task the way your users phrase it (add its id to `TaskId`). Run `pnpm proof --task <yours>` with a key. For the free scripted comparison (`h2h`), also add a best-case script for the page in `src/scripted.ts`. | You have the "before" numbers. |
| 3–6 | **Swap the controls.** Replace the amount, account, VAT, date, KID and line inputs with Booki controls, or give a control of your own a primitive (`definePrimitive`) and create its parts with your own tags and names. Keep your layout, your API and your save flow. Mark posting and paying with `data-agent-confirm`. | `window.agent.snapshot()` lists the screen's controls with named actions. |
| 7–8 | **Server.** Run the screen's write route through `@booki-aui/core/server` (`guardPostVoucher` or your own `guard()`), with the agent on its own credential. | The API refuses an agent's approval and an unbalanced voucher with 403 / 422. |
| 9 | **Rules.** Put your company policy in `allow`: what an agent may post alone (an amount limit, balanced, dated in an open period), what goes to a person. | A step over the limit waits for a person; one under it posts and is logged as the agent. |
| 10 | **After.** Add the new screen as a `bridge` page next to the old one and run `pnpm proof` again (and `h2h`, if you scripted both pages). | You have the "after" numbers and the report. |

## Success criteria

Agree on them before day 1. Suggested:

- Tool calls and tokens billed down by at least 5× on the screen's main task.
- The agent's result is correct in at least 9 of 10 real-model runs (`pnpm proof`, 5 runs × 2 task phrasings).
- No person-only decision can be taken by an agent, on the screen or through the API.
- Every agent change shows in the audit trail as `agent:<id>`.

## Security checklist

- [ ] The agent has its own credential; the server knows `kind: "agent"`.
- [ ] Approving, signing off, finalizing and releasing are not agent actions, and the API refuses them for the agent.
- [ ] Bank account numbers, IBAN and KID read as `[redacted]` in the snapshot.
- [ ] Posting into a closed period is refused on screen and in the API.
- [ ] The agent's work is visible to the person (`AgentPresence`, `AgentCursor`).

## Running the real-model numbers

```bash
echo "ANTHROPIC_API_KEY=…" >> apps/www/.env.local   # git-ignored; never printed
pnpm --filter @booki-aui/www dev -- --port 5183
pnpm proof                      # all tasks, 5 runs per page
pnpm proof --task voucher       # one task
```

`pnpm proof` costs real money: roughly the per-run costs in the benchmark table
times runs times pages. The scripted `h2h` is free and is the baseline.

## What it does not cover

- Any stack: `@booki-aui/react`, `@booki-aui/web` (Angular, server-rendered pages),
  `@booki-aui/vue`, `@booki-aui/svelte` or `@booki-aui/solid`. Outside React you write the
  markup around the parts; the agent cursor is `<booki-agent-cursor>` there.
- Your ERP's own integrations (bank, tax authority, document scanning) stay yours.
- The [Agent Contract](../spec/agent-contract.md) lists what a conforming
  screen must do; the pilot screen can claim it once the checks above pass.
