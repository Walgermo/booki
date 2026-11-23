# Agent benchmark

A bookkeeping task, done by a Claude model on screens built the way ERP
products build them today and on the same task built with Booki, with the
tokens, calls, time and cost of each counted from the API's own `usage`.

How it is built, what it counts and where it can be wrong: [METHOD.md](METHOD.md).


> **Corrected 23 November 2026.** The voucher and sales invoice results below
> are withdrawn: the Booki control's format hint held the task's answer
> (VoucherComposer: account 6800, 1550000 øre, VAT code 1; InvoiceEditor: the
> sales invoice's first line). The inbox's hint named the VAT code the task
> asks for. The hints are changed and a test keeps task answers out of every
> hint; these tasks will be run again. [RUNS.md](RUNS.md) lists every run,
> counted or not.

## Real-model results, 21 November 2026

Run with `pnpm proof` through Vercel AI Gateway: five runs per page, effort
`medium` for Claude, none for DeepSeek (an Anthropic-only setting), 30-step cap,
Playwright MCP 0.0.84. Medians; cost is what the gateway billed at list price.
Right means the end state (or, for the dashboard, the answer) passed the check.
DNB Regnskap's voucher and dashboard screens were run too; they are in the
result files and the site's table.

| Model | Right on Booki | Right on the rebuilt screens |
| --- | --- | --- |
| Claude Opus 5.5 | 20/20 | 29/30 |
| Claude Sonnet 5.5 | 20/20 | 30/30 |
| Claude Haiku 5.5 | 20/20 | 23/30 |
| DeepSeek V4.1 Flash | 20/20 | 18/30 |

Each cell: right · tool calls · start to finish · cost per run.

| Task | Model | Tripletex | Booki |
| --- | --- | --- | --- |
| Voucher | Claude Opus 5.5 | 5/5 · 16 · 30.3 s · $0.088 | **5/5 · 6 · 14.6 s · $0.039** |
| Voucher | Claude Sonnet 5.5 | 5/5 · 16 · 21.6 s · $0.048 | **5/5 · 8 · 16.9 s · $0.026** |
| Voucher | Claude Haiku 5.5 | 4/5 · 24 · 35.0 s · $0.008 | **5/5 · 9 · 11.6 s · $0.002** |
| Voucher | DeepSeek V4.1 Flash | 2/5 · 30 · 113.0 s · $0.020 | **5/5 · 10 · 18.5 s · $0.004** |
| Supplier invoice | Claude Opus 5.5 | 5/5 · 24 · 32.3 s · $0.181 | **5/5 · 4 · 12.4 s · $0.031** |
| Supplier invoice | Claude Sonnet 5.5 | 5/5 · 20 · 21.0 s · $0.056 | **5/5 · 3 · 7.1 s · $0.008** |
| Supplier invoice | Claude Haiku 5.5 | 4/5 · 23 · 27.9 s · $0.007 | **5/5 · 5 · 7.2 s · $0.001** |
| Supplier invoice | DeepSeek V4.1 Flash | 4/5 · 23 · 48.7 s · $0.015 | **5/5 · 6 · 13.1 s · $0.003** |
| Sales invoice | Claude Opus 5.5 | 4/5 · 16 · 24.6 s · $0.100 | **5/5 · 3 · 8.1 s · $0.015** |
| Sales invoice | Claude Sonnet 5.5 | 5/5 · 14 · 16.2 s · $0.039 | **5/5 · 3 · 6.3 s · $0.006** |
| Sales invoice | Claude Haiku 5.5 | 5/5 · 16 · 16.8 s · $0.004 | **5/5 · 5 · 7.4 s · $0.001** |
| Sales invoice | DeepSeek V4.1 Flash | 3/5 · 29 · 51.7 s · $0.015 | **5/5 · 5 · 7.3 s · $0.002** |
| Dashboard | Claude Opus 5.5 | 5/5 · 4 · 22.1 s · $0.069 | **5/5 · 1 · 5.8 s · $0.011** |
| Dashboard | Claude Sonnet 5.5 | 5/5 · 6 · 18.0 s · $0.036 | **5/5 · 1 · 3.6 s · $0.003** |
| Dashboard | Claude Haiku 5.5 | 5/5 · 16 · 56.3 s · $0.006 | **5/5 · 1 · 3.3 s · $0.000** |
| Dashboard | DeepSeek V4.1 Flash | 4/5 · 21 · 71.7 s · $0.013 | **5/5 · 1 · 4.0 s · $0.001** |

What it shows:

- **Every model was right every time on Booki.** 20 of 20 for all four. On the
  rebuilt screens Opus missed once, and the two cheapest were right 23 and 18
  of 30 times. (Haiku and DeepSeek reached 20/20 after the voucher fix below;
  their voucher rows are from the rerun.)
- **A small model on Booki beats a large one on a rebuilt screen on cost.**
  Haiku 5.5 posted the voucher on Booki for $0.002 a run, right 5 of 5 times;
  Opus took $0.088 on the Tripletex snapshot. Sonnet 5.5 matched Opus on Booki
  at about half the cost.
- **Same model, same task:** Booki was 1.8× (Sonnet's voucher) to 11× (Opus on
  DNB Regnskap's dashboard) cheaper and up to 19× faster (Haiku on the same
  dashboard), and took 1 to 13 tool calls where the rebuilt screens took 4 to 37.
- **The sales invoice changed most after a fix.** Opus first took 10 calls
  there, because a line took thousandths and basis points by position and the
  refusal named no fields; it guessed field names seven times. Lines now take
  the names people use (`quantity: 12.5`, `taxRate: 25`), the snapshot shows
  the line format, and a refusal lists the fields. Opus went to 3 calls.

Found along the way, and acted on:

- **VAT on a line was ambiguous in Booki.** The first real run failed on the
  Booki voucher: Opus entered the purchase gross with the 25 % code, as in
  Tripletex, while DeepSeek entered three lines with the code on the net line.
  Booki said neither what the code meant nor what the ledger would receive.
  Fixed in the library: a coded line is gross and its VAT is posted for it
  (`vatPostings`), the voucher snapshot shows `postings`, and posting VAT twice
  is refused with a sentence that says how to fix it. The voucher check now
  compares postings, as the listbox check always did.
- **Opus read chart data with code.** On the replica dashboards it used
  `browser_evaluate` (3–7 calls a run) to read figures from the page instead of
  hovering or taking a screenshot. That is fair use of the tools, and it made
  those screens cheaper than the scripted hover route; real products that draw
  charts on canvas without the data in the page would not allow it.
- **The answer check was too strict once.** One DeepSeek dashboard answer on
  Booki wrote "NOK 486,500" (English grouping), which the check read as 486,50.
  The check now reads Norwegian and English number formats, and
  `src/reverify.ts` re-checked the saved answers without running anything: one
  run changed from wrong to right, and is marked `reverified` in its result file.
- **DeepSeek mixed up units once.** One Booki voucher was entered as 15 500
  øre (155 kr). The control accepted it, since minor units are its contract;
  the run counts as wrong. The voucher's format hint now says it in numbers:
  15 500,00 is 1550000.
- **Haiku called `addLine()` with no account once.** The refusal said account
  "" was not in the chart and listed five of eleven accounts, without 6800, so
  Haiku concluded 6800 did not exist and stopped. A missing account now gets its
  own sentence with the call to make, and a short chart is listed whole. After
  both fixes Haiku and DeepSeek were right 5 of 5 on the Booki voucher.

## Workflow results, 21 November 2026

Three workflow tasks, each a month's worth of one job on one page per side:
an inbox of eight supplier invoices, a bank reconciliation of twelve lines,
and October's close. Run with `pnpm proof --task …` through Vercel AI Gateway
against a built copy of the site (`vite preview`), five runs per page, effort
`medium` for Claude, none for DeepSeek, each task's own step cap (inbox 90,
reconcile 70, close 40), Playwright MCP 0.0.84. Medians; cost is what the
gateway billed at list price, $1.50 for the first round and about $0.60 for
the reconciliation rerun after the `setMatches` fix. The
ordinary pages here were **built** for this benchmark in the patterns of the
mapped screens, not rebuilt from a map of a product's own inbox,
reconciliation or close screen.

On Booki the inbox and reconcile tasks end where the control hands over to a
person: right means every invoice ready to approve (or every match suggested)
and nothing decided by the agent. On the ordinary pages nothing stops the
agent, so right means booked, reconciled and posted. The close posts its
voucher on both sides.

| Model | Right on Booki | Right on the ordinary pages |
| --- | --- | --- |
| Claude Haiku 5.5 | 15/15 | 14/15 |
| DeepSeek V4.1 Flash | 15/15 | 8/15 |
| Claude Sonnet 5.5 (reconcile only) | 5/5 | 5/5 |

Each cell: right · tool calls · start to finish · cost per run.

| Task | Model | Ordinary page (built) | Booki |
| --- | --- | --- | --- |
| Inbox | Claude Haiku 5.5 | 5/5 · 52 · 50.8 s · $0.018 | **5/5 · 6 · 16.0 s · $0.005** |
| Inbox | DeepSeek V4.1 Flash | 1/5 · 90 · 340.9 s · $0.094 | **5/5 · 20 · 55.1 s · $0.020** |
| Reconcile | Claude Haiku 5.5 | 5/5 · 51 · 68.5 s · $0.021 | **5/5 · 3 · 10.6 s · $0.003** |
| Reconcile | DeepSeek V4.1 Flash | 5/5 · 19 · 62.4 s · $0.021 | **5/5 · 5 · 18.1 s · $0.007** |
| Reconcile | Claude Sonnet 5.5 | 5/5 · 6 · 14.4 s · $0.030 | **5/5 · 2 · 7.5 s · $0.013** |
| Close | Claude Haiku 5.5 | 4/5 · 11 · 18.6 s · $0.004 | **5/5 · 11 · 18.3 s · $0.003** |
| Close | DeepSeek V4.1 Flash | 2/5 · 13 · 25.7 s · $0.008 | **5/5 · 13 · 20.9 s · $0.005** |

What it shows:

- **Booki was right every time on all three, with the cheapest models.**
  Haiku 5.5 and DeepSeek V4.1 Flash were right 15 of 15 each. On the ordinary
  pages Haiku was right 14 of 15 and DeepSeek 8 of 15.
- **The inbox is where Booki saves the most.** Haiku did it in 6 tool calls on
  Booki against 52, 3.2× faster and 3.3× cheaper ($0.005 a run).
- **The reconciliation now costs a seventh.** Haiku suggested all ten matches
  in 3 tool calls on Booki against 51, 6.5× faster and 7× cheaper
  ($0.003 a run). Sonnet 5.5 did it in 2.
- **The close costs the same on both sides.** 11 or 13 calls either way, and
  the same time within a few seconds. What Booki adds there is the order:
  `CloseChecklist` refuses a task before the ones it depends on.
- **The reconciliation first failed on Booki for every model,** 0 of 15, and
  not because a match was wrong: the ten matches were right in every run.
  Every model used `setMatches` to write the whole list at once and gave the
  matches no `status`, so they were neither suggested nor approved and no
  person was asked; the same action let an agent write `status: "approved"`.
  `setMatches` now turns a new or changed match into a suggestion and refuses
  any other status on it ([docs/workflow-gaps.md](../../docs/workflow-gaps.md),
  item 4). The rerun above, both pages and all three models, is after that
  fix; the ordinary page was rerun too, so the two sides are from the same
  hour.
- **So for a month's work today:** Haiku 5.5 on Booki does the inbox, the
  reconciliation and the close right every time for about a cent ($0.011).
  On the ordinary pages Haiku does all three right 14 times of 15 for about
  $0.04.

Found along the way, and acted on:

- **The close task first asked for a check that could not be made.** It said
  "kontroller saldobalansen", and neither page showed a trial balance. Both
  models on both sides marked the earlier tasks done and refused to tick that
  one, which was the right thing to do. Both pages now show a trial balance
  (a plain table; a Booki `DataTable` with the balance summed), the task says
  what to check, and close was rerun; the first runs are not counted.
- **DeepSeek left the page.** In four inbox runs and one close run on the
  ordinary pages it navigated elsewhere (`localhost:3000`, `example.com`,
  other routes) and lost the page, or ran out of steps doing so. Those runs
  stay as failures, as any wrong end state does. It also ran page code
  heavily there (a median of 52 calls to `browser_run_code_unsafe` or
  `browser_evaluate` per inbox run). The bridge offers no tool that runs page code.
- **An out-of-order tick sticks on a plain checklist.** In one Haiku and two
  DeepSeek close runs on the ordinary page the model ticked the depreciation
  task before checking the period, noticed, and unticked it. The page allowed
  it and the order check failed. On Booki the dependency refuses it.

## What is measured

Eight tasks, each on its own pages: five single screens and three workflows
(a month's inbox, the bank reconciliation, the close). Every page of a task gets the same system
prompt and the same task text; the model gets only that page's tools.

| Task | Page | The model gets |
| --- | --- | --- |
| `voucher` | `/bench/voucher-raw`, rebuilt from a DOM snapshot of Tripletex's voucher screen | Playwright MCP |
| `voucher` | `/bench/voucher-grid`, rebuilt from a DOM snapshot of DNB Regnskap's voucher entry | Playwright MCP |
| `voucher` | `/bench/voucher-acc`, Booki | the ui-sdk bridge |
| `supplier-invoice` | `/bench/supplier-invoice-raw`, rebuilt from a DOM map of the same product's detailed supplier-invoice entry | Playwright MCP |
| `supplier-invoice` | `/bench/supplier-invoice-acc`, Booki | the ui-sdk bridge |
| `sales-invoice` | `/bench/sales-invoice-raw`, rebuilt from a DOM map of the same product's new order/invoice screen | Playwright MCP |
| `sales-invoice` | `/bench/sales-invoice-acc`, Booki (`InvoiceEditor`) | the ui-sdk bridge |
| `dashboard` | `/bench/dashboard-raw`, rebuilt from a structural map of the same product's dashboard (SVG charts) | Playwright MCP |
| `dashboard` | `/bench/dashboard-grid`, rebuilt from a structural map of the same product as `voucher-grid` (canvas charts) | Playwright MCP |
| `dashboard` | `/bench/dashboard-acc`, Booki chart controls | the ui-sdk bridge |
| `inbox` | `/bench/inbox-raw`, built for this benchmark in the patterns of the listbox supplier-invoice replica (no map of a product's inbox was taken) | Playwright MCP |
| `inbox` | `/bench/inbox-acc`, Booki (`SupplierInvoiceInbox`) | the ui-sdk bridge |
| `reconcile` | `/bench/reconcile-raw`, built for this benchmark: plain tables, unlabeled checkboxes, a reconcile button named by its icon | Playwright MCP |
| `reconcile` | `/bench/reconcile-acc`, Booki (`BankReconciliation`) | the ui-sdk bridge |
| `close` | `/bench/close-raw`, built for this benchmark: a plain checklist page with a period table, a trial balance and a voucher form | Playwright MCP |
| `close` | `/bench/close-acc`, Booki (`CloseChecklist`, `PeriodLock`, `DataTable`, `VoucherComposer`) | the ui-sdk bridge |
| `invoice` | `/bench/semantic`, plain semantic HTML | Playwright MCP |
| `invoice` | `/bench/acc`, Booki | the ui-sdk bridge |

- **Playwright MCP** is the official server, `@playwright/mcp` 0.0.84, started
  per run over stdio and driven with the MCP SDK client. The model gets the
  server's full default tool list (25 tools) and every result exactly as the
  server returns it.
- **The ui-sdk bridge** is `snapshot`, `act`, `query`: ui-sdk's own
  `agentTools`, unchanged, run in the page against `window.agent`.

The tasks:

> **voucher:** Registrer et bilag datert 2026-10-31: debet 6800 Kontorrekvisita med 25 % inngående mva, kredit 2400 Leverandørgjeld, 15 500,00 inkludert mva. Kontroller at det balanserer, og opprett det.

> **supplier-invoice:** Registrer en leverandørfaktura fra Kontorrekvisita AS: fakturanummer 8841, fakturadato 2026-10-12, forfall 2026-11-11, KID 10012342, 15 500,00 inkludert 25 % mva, kostnadskonto 6800. Bokfør den.

> **sales-invoice:** Lag en faktura til kunden Brattli AS med to linjer: Rådgivning, 12,5 timer à 1 450,00, og Reiseutlegg, 1 à 2 380,00, begge med 25 % mva. Opprett den.

> **dashboard:** Les tallene på dashbordet og svar med eksakte beløp i kroner: (1) inntekter og kostnader i oktober 2026; (2) hvilken av de siste tolv månedene (november 2025 til oktober 2026) som hadde høyest inntekt, og hvor mye; (3) hvor mye av kundefordringene som er forfalt mer enn 30 dager. Ikke endre noe.

> **inbox:** Gå gjennom leverandørfakturaene i innboksen og bokfør dem. Rett eller bekreft felt som er lest med lav sikkerhet; ifølge papirfakturaene er totalbeløpet fra Fjordkraft Strøm AS 9 375,00, forfallsdatoen fra Nordlys Eiendom AS 2026-11-01 og fakturanummeret fra Kontorservice Vest AS 4471. Kontér faktura 3318 fra Datahjelp Norge AS på 6810 Datakostnader med 25 % mva. Avvis den fakturaen som er en kopi av en faktura som allerede er bokført. Konteringen som allerede står på de andre fakturaene, er riktig.

> **reconcile:** Avstem bankkonto 1920 for oktober 2026: koble hver banklinje til den eller de åpne postene den betaler. Der flere poster har samme beløp, avgjør referansen. Én faktura er betalt i to deler. Én banklinje har ingen åpen post; la den stå uavstemt. Ikke lag andre koblinger.

> **close:** Gjør månedsavslutningen for oktober 2026 på sjekklisten, i den rekkefølgen oppgavene avhenger av: kontroller at oktober er åpen for bokføring, bokfør avskrivningen for oktober (bilag datert 2026-10-31: debet 6010 Avskrivning på inventar 12 500,00, kredit 1290 Akkumulerte avskrivninger 12 500,00), og kontroller at saldobalansen går i null med avskrivningen i. Marker hver oppgave som utført når den er gjort. Signering og stenging av perioden skal en person gjøre; la dem stå.

> **invoice:** Book this invoice: set the amount excluding tax to 3,125.00, set the tax code to 8.875%, write three voucher lines (debit 1200 Accounts receivable 3,402.34; credit 4000 Sales revenue 3,125.00; credit 2150 Sales tax payable 277.34), confirm debit equals credit, then pay the invoice.

Each run is a plain tool-use loop on a freshly loaded page, until the model
stops or `--max-steps` requests have been made. Per run the results file holds:

- model requests and tool calls
- input, cache-write, cache-read and output tokens, summed from `usage` over every request (output includes thinking)
- wall time, from the first request to the end of the loop, tool execution included
- cost, from the list prices in `src/pricing.ts`
- whether the page ended in the right state, check by check, and whether the pay/post step happened
- calls to the tools that run code in the page (`browser_evaluate`, `browser_run_code_unsafe`)
- the full transcript, every message as sent and received

and, per page, the tool definitions and their token count, plus every version
that can move a number (model ids, Playwright MCP, MCP SDK, ui-sdk, Chrome,
Node, git commit).

## Run it

```bash
pnpm install
ANTHROPIC_API_KEY=… pnpm --filter agent-benchmark bench --task voucher
ANTHROPIC_API_KEY=… pnpm --filter agent-benchmark bench --task supplier-invoice
ANTHROPIC_API_KEY=… pnpm --filter agent-benchmark bench --task sales-invoice
ANTHROPIC_API_KEY=… pnpm --filter agent-benchmark bench --task dashboard
ANTHROPIC_API_KEY=… pnpm --filter agent-benchmark bench --task invoice
ANTHROPIC_API_KEY=… pnpm --filter agent-benchmark bench --task inbox
ANTHROPIC_API_KEY=… pnpm --filter agent-benchmark bench --task reconcile
ANTHROPIC_API_KEY=… pnpm --filter agent-benchmark bench --task close
```

The API baseline (the same three tasks with tool calls to a bookkeeping API and
no screen) is in `src/api/`, and it has no run yet; see
[METHOD.md](METHOD.md#api-baseline-not-run). `pnpm --filter agent-benchmark test`
runs its unit tests, which never call a model.

It builds the packages, starts the site on port 5199 (or uses `--url`), starts
one Playwright MCP server per run on the installed Chrome (`--browser
chrome`; no browser is downloaded), prints every run and the median (min–max)
per page, and writes everything to `results/bench-<task>-<timestamp>.json`.

| Flag | Default | |
| --- | --- | --- |
| `--task <id>` | `invoice` | `voucher`, `supplier-invoice`, `sales-invoice`, `dashboard`, `inbox`, `reconcile`, `close` or `invoice`. |
| `--model <id>` | `claude-opus-5-5` | Any model id. |
| `--runs <n>` | `3` | Runs per page. Median, min and max are reported. |
| `--effort <level>` | `medium` | `low`, `medium`, `high`, `xhigh`, `max`, or `none` to leave the parameter out for models that don't take it. |
| `--max-steps <n>` | the task's | Cap on model requests per run: 30 for a single screen; inbox 90, reconcile 70, close 40 (more than twice the scripted best case on the replica; see METHOD.md). |
| `--browser-tools <t>` | `mcp` | `legacy` swaps the server for the old in-process imitation (four tools, snapshot inline after every action). Only for a machine where the server cannot run; results say which was used. |
| `--url <origin>` | | Use a site that is already running. |
| `--skip-build` | | Don't run `pnpm build:packages` first. |
| `--prices a,b,c,d` | | USD per million tokens: input, output, cache write, cache read. For a model that isn't in `src/pricing.ts`, or a price that has moved. |
| `--headed` | | Show the browser. |
| `--dry-run` | | No model and no key. See below. |

Without `ANTHROPIC_API_KEY` the script stops before it builds or starts anything.

Before the first request it checks every page of the task: it loads, an
untouched page fails its checks, and for the invoice both pages offer the
8.875% code. If not, it stops, since every run there would fail.

### Without a key

```bash
pnpm --filter agent-benchmark bench --dry-run --url http://localhost:5183 --skip-build
```

On every page of every task (or of `--task`): an untouched page must fail its
checks, a scripted agent does the task through the same tools a model gets
there (the real Playwright MCP server on the browser pages), the end state
must pass, and a bad ref and an unknown tool must come back as tool errors; on
the bridge pages a `query` and an `act` on an unknown ref are tried too. It
proves the plumbing, not the model, and prints no token or cost numbers. It
exits non-zero if anything is off.

## What counts as success

A run succeeds when the model ended its turn on its own and the page, read
after the loop, passes every check in `src/verify.ts`:

- **voucher, both replicas:** dated 31.10.2026, one line, 6800 (with the 25 %
  input VAT code on the listbox page), 2400 without VAT, 15 500,00 gross, posted.
- **voucher, Booki:** dated, three lines (6800 debit 12 400 with MVA25, 2710
  debit 3 100, 2400 credit 15 500), posted. The agent writes the VAT split
  itself. The page lets an agent post when the voucher meets the company's
  rule (balanced, passes the account rules, dated, at most 50 000 kr) and
  records the posting as the agent's.
- **supplier-invoice:** supplier, invoice number, both dates, KID, the total
  and one line on 6800 with 25 % VAT, posted. Booki posts it under the
  company's rule (fields complete, KID valid, at most 50 000 kr).
- **sales-invoice:** Brattli AS, the two lines, net 20 505,00, VAT 5 126,25,
  created. On Booki the agent may create the draft order when it has no
  issues; finalizing the invoice stays a person's button.
- **dashboard:** read only. The model's final answer must contain October
  2026's income and costs, December 2025 and its income as the highest, and
  the amount overdue more than 30 days, all exact. Nothing is posted.
- **inbox, replica:** the seven invoices booked with every field and the
  coding right (9 375,00 gross from Fjordkraft, number 4471 from Kontorservice
  Vest, 3318 on 6810 with 25 %), the copy of 3307 rejected.
- **inbox, Booki:** the same values, and each of the seven with no issue left,
  ready for a person to approve; the copy still flagged; nothing approved or
  rejected, since `SupplierInvoiceInbox` makes both a person's.
- **reconcile:** exactly the ten matches (one of them two bank lines to one
  invoice) and the unknown transfer left open. On Booki each match must still
  be a suggestion waiting for a person.
- **close:** period checked, depreciation voucher posted (2026-10-31, 6010 /
  1290, 12 500,00), its task done, balance checked, in that order; no sign-off
  given, the closing task and the period left for a person. Booki posts the
  voucher under the company's rule (balanced, open period, at most 50 000 kr).
- **invoice:** amount 3,125.00, tax code `TAX8875`, the three lines in any
  order, debit equal to credit; the payment **made** on the HTML page and
  **not made** on the Booki page, whose pay button is marked
  `data-agent-confirm` so the bridge refuses it.

The `pay/post` column says `done`, `refused` (the bridge stopped it for a
person) or `not_attempted`.

A run that ends in the wrong state, hits the step cap, or is declined by the
model is `FAILED` and stays in the table, the statistics and the JSON. Only a
run the API never completed (`api_error`) is left out of the statistics.

## Choices that affect the numbers

- **Playwright MCP runs with its defaults.** In 0.0.84 an action's reply links
  the new snapshot as a file instead of inlining it; the model has no file tool
  and reads the page with `browser_snapshot`. The full tool list (25 tools) is
  sent on every request, which is a fixed cost: it is counted and reported.
- **Prompt caching is on** (top-level `cache_control`), as it would be in a real
  loop. Cached and uncached tokens are reported and priced separately.
- **Effort is sent explicitly** (`medium`), and thinking is left at the model's
  default. Both are in the results file.
- **No refusal fallback.** A run the model declines is a failed run.
- **The site runs on Vite's dev server**, so wall time includes development-mode
  React. Token counts don't depend on it.
- **Prices** are Anthropic's first-party list prices as cached in Claude Code's
  `claude-api` skill on 2026-11-03. Check them against
  https://platform.claude.com/docs/en/about-claude/pricing before quoting a cost.

Limits and threats to validity: [METHOD.md](METHOD.md#threats-to-validity).

## Head-to-head without a model

```bash
pnpm --filter agent-benchmark h2h --url http://localhost:5183
ANTHROPIC_API_KEY=… pnpm --filter agent-benchmark h2h --url http://localhost:5183   # real token counts
```

The voucher, supplier-invoice, sales-invoice, dashboard, inbox, reconcile and
close tasks (`--task` picks one) on every page, each driven by a scripted agent that never errs, through the same
tools as above: the real Playwright MCP server on the replicas, the bridge on
Booki. That is the best case for the replicas: the script already knows which
unnamed picker is which, skips the search boxes, and takes a snapshot only when
it needs refs it has not seen or has to read the page. A real model adds
retries and wrong guesses on that side; run `bench --task <id>` to measure them.

- **Tokens:** with `ANTHROPIC_API_KEY`, the Messages API's count_tokens
  endpoint for `--model` (free; no model runs). Without it, characters ÷ 4,
  and every token and cost number is labelled "estimate".
- **Cumulative input:** one request per call plus the final one, each resending
  the history so far. **Output** is the tool_use arguments only, a lower bound.
- **Cost** at the model's list prices (Opus 5.5: $4 / MTok in, $20 / MTok out,
  $0.20 cache read, $5 5-minute cache write): without cache, and with the
  earlier prefix of each request read from cache and the new part written.
  The cached figure ignores the minimum cacheable length, so for the short
  Booki transcripts the uncached figure is the realistic one. Per 1 000 and
  100 000 runs are in the JSON.
- **Dashboard strategies:** on the two dashboard replicas the script runs
  twice. *hover*: hover each month and read the tooltip (CSS selectors on the
  SVG page; pointer coordinates with `browser_mouse_move_xy` on the canvas
  page, which needs Playwright MCP's `--caps vision`); exact numbers.
  *screenshot*: two full-page screenshots; bar heights only, so the answer is
  marked "approximate" and reported as cost only. Images are counted by
  (width × height) / 750 after the model's resize limits without a key, by
  count_tokens with one. Booki answers from one bridge snapshot.
- **Tool time:** wall time around each tool call, median of `--repeats`
  (default 3). No model latency: end-to-end time needs `bench` with a key.

Every call in and out, every repeat's timing, and all versions go to
`results/h2h-<time>.json`. How each number is counted: [METHOD.md](METHOD.md).

Last run (21 Nov 2026, Playwright MCP 0.0.84, Chrome 158, no key, so token and
cost numbers are **estimates**, characters ÷ 4):

**voucher**

| Page | Calls | Requests | Cumulative input | Output (lower bound) | Cost, no cache | Cost, with cache | Tool time (median) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tripletex DOM snapshot + Playwright MCP | 14 | 15 | ≈ 118 979 | ≈ 156 | ≈ $0.479 | ≈ $0.079 | 4.2 s |
| DNB Regnskap DOM snapshot + Playwright MCP | 19 | 20 | ≈ 138 178 | ≈ 188 | ≈ $0.557 | ≈ $0.075 | 4.0 s |
| Booki + bridge | 2 | 3 | ≈ 3 682 | ≈ 89 | ≈ $0.017 | ≈ $0.010 | 0.3 s |

**supplier-invoice**

| Page | Calls | Requests | Cumulative input | Output (lower bound) | Cost, no cache | Cost, with cache | Tool time (median) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| listbox replica (DOM map) + Playwright MCP | 18 | 19 | ≈ 163 910 | ≈ 220 | ≈ $0.660 | ≈ $0.095 | 4.1 s |
| Booki + bridge | 2 | 3 | ≈ 4 688 | ≈ 124 | ≈ $0.021 | ≈ $0.014 | 0.3 s |

**sales-invoice**

| Page | Calls | Requests | Cumulative input | Output (lower bound) | Cost, no cache | Cost, with cache | Tool time (median) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| listbox replica (DOM map) + Playwright MCP | 14 | 15 | ≈ 109 942 | ≈ 183 | ≈ $0.443 | ≈ $0.072 | 2.4 s |
| Booki + bridge | 2 | 3 | ≈ 3 860 | ≈ 81 | ≈ $0.017 | ≈ $0.011 | 0.2 s |

**dashboard** (read only; "screenshot" rows are cost only, their answers approximate)

| Page | Calls | Requests | Cumulative input | Images | Output (lower bound) | Cost, no cache | Cost, with cache | Tool time (median) | Answer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SVG dashboard replica, hover | 26 | 27 | ≈ 294 880 | 0 | ≈ 346 | ≈ $1.186 | ≈ $0.147 | 1.0 s | exact |
| SVG dashboard replica, screenshot | 4 | 5 | ≈ 34 689 | 3 702 | ≈ 43 | ≈ $0.140 | ≈ $0.053 | 0.2 s | approximate |
| canvas dashboard replica, hover (`--caps vision`) | 28 | 29 | ≈ 436 084 | 0 | ≈ 213 | ≈ $1.749 | ≈ $0.209 | 1.3 s | exact |
| canvas dashboard replica, screenshot | 6 | 7 | ≈ 58 128 | 4 084 | ≈ 53 | ≈ $0.234 | ≈ $0.069 | 1.3 s | approximate |
| Booki + bridge | 1 | 2 | ≈ 2 941 | 0 | ≈ 3 | ≈ $0.012 | ≈ $0.010 | 0.01 s | exact |

Cumulative input on the replicas is 28–38× Booki's. Without cache they cost
26–34× as much; with cache 7–8×, a ratio that flatters the replicas because
Booki's short transcripts would not reach the cache's minimum. All pages
reached the right end state. Only Booki checked a rule before posting or
creating, and recorded the step as the agent's. On the dashboard, the routes that get exact numbers
cost 100–150× Booki's input; the screenshot routes are cheaper than hovering
but cannot give the exact figures the task asks for. Image counts follow the
documented pixel rule. These are estimates until someone runs it with a key.

The workflow tasks, same run (`h2h --task all --repeats 3`, 21 Nov 2026; close
rerun with `--task close` after its trial balance was added; built
site under `vite preview`, no key, so **estimates**). "Built" marks a replica
made in the mapped patterns, not rebuilt from a map of a product's own
workflow screen.

**inbox**

| Page | Calls | Requests | Cumulative input | Output (lower bound) | Cost, no cache | Cost, with cache | Tool time (median) | Repeats right |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| listbox-style inbox (built) + Playwright MCP | 35 | 36 | ≈ 532 625 | ≈ 364 | ≈ $2.138 | ≈ $0.233 | 12.7 s | 3/3 |
| Booki + bridge | 2 | 3 | ≈ 15 099 | ≈ 78 | ≈ $0.062 | ≈ $0.057 | 0.2 s | 3/3 |

**reconcile**

| Page | Calls | Requests | Cumulative input | Output (lower bound) | Cost, no cache | Cost, with cache | Tool time (median) | Repeats right |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| checkbox reconciliation table (built) + Playwright MCP | 33 | 34 | ≈ 282 884 | ≈ 512 | ≈ $1.142 | ≈ $0.120 | 17.2 s | 3/3 |
| Booki + bridge | 2 | 3 | ≈ 10 448 | ≈ 163 | ≈ $0.045 | ≈ $0.042 | 0.3 s | 3/3 |

**close**

| Page | Calls | Requests | Cumulative input | Output (lower bound) | Cost, no cache | Cost, with cache | Tool time (median) | Repeats right |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| plain checklist page (built) + Playwright MCP | 11 | 12 | ≈ 80 268 | ≈ 172 | ≈ $0.325 | ≈ $0.059 | 2.3 s | 3/3 |
| Booki + bridge | 2 | 3 | ≈ 6 032 | ≈ 134 | ≈ $0.027 | ≈ $0.019 | 0.3 s | 3/3 |

On the workflows the scripted replica takes 11 to 35 calls where Booki takes
2 (one snapshot, one `act`). Cumulative input on the replicas is 13–35× Booki's
and the uncached cost 12–35×; with cache 2.8–4.1×, which again flatters the
replicas. Booki's inbox transcript is its largest anywhere (≈ 10 900 tokens):
each `act` step returns the whole inbox, a gap written up in
[docs/workflow-gaps.md](../../docs/workflow-gaps.md). On Booki the inbox and
reconcile runs end with the work ready and the decision left for a person;
the replicas book and reconcile at once, since nothing there stops them.
