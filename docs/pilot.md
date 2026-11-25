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
The ones we measured, in order of payoff:

| Screen | Why | Measured on a rebuilt screen, Claude Opus 5.5 |
| --- | --- | --- |
| Supplier invoice entry | Many pickers, every field matters | 24 → 4 calls, 5.9× cheaper, 2.6× faster |
| Sales invoice | Line tables with unnamed inputs | 16 → 3 calls, 6.4× cheaper, 3× faster |
| Dashboard / reports | Figures only in pixels or tooltips | 4 → 1 call, 6.5× cheaper, 3.8× faster |
| Voucher entry | Unnamed account and VAT pickers | 16 → 6 calls, 2.3× cheaper, 2.1× faster |

The two cheapest models (Claude Haiku 5.5, DeepSeek V4.1 Flash) were right 20 of
20 times on the Booki screens, and 23 and 18 of 30 on the rebuilt ones (median of
five runs per screen and model, 21 November 2026, at list price). Those runs were on screens rebuilt
from DOM snapshots (see `benchmarks/agent/README.md`); the pilot replaces them
with numbers from yours.

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
