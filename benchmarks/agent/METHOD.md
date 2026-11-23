# Method

How the agent benchmark is built, what it counts, and where it can be wrong.
Commands and flags are in [README.md](README.md).

## Hypothesis

An agent that does a bookkeeping task through Booki controls and the ui-sdk
agent bridge spends fewer tokens and calls than the same agent doing it
through browser tools on the screens ERP products ship today, gets the end
state right at least as often, and is held to the company's rules for the
steps that need them.

## Tasks

The same system prompt and the same task text go to every page of a task. The
model gets only the tools of its page.

- **voucher** (Norwegian, as the screens are): post a voucher dated
  2026-10-31, debit 6800 office supplies with 25 % input VAT, credit 2400
  accounts payable, 15 500,00 including VAT; check that it balances; create it.
- **supplier-invoice** (Norwegian): register a supplier invoice from
  Kontorrekvisita AS, invoice 8841, dated 2026-10-12, due 2026-11-11, KID
  10012342, 15 500,00 including 25 % VAT on account 6800, and post it.
- **sales-invoice** (Norwegian): invoice customer Brattli AS with two lines
  (Rådgivning, 12,5 hours at 1 450,00; Reiseutlegg, 1 at 2 380,00), 25 % VAT,
  and create it.
- **dashboard** (Norwegian, read only): read from a dashboard, with exact
  amounts, October 2026's income and costs, which of the last twelve months
  had the highest income and how much, and how much of the receivables is
  overdue more than 30 days. Nothing is changed. The answer is the agent's
  final text and is checked against the data. A payroll question
  (employer's tax this month) was dropped because one of the two mapped
  dashboards has no payroll widget, and the task must be the same on every page.
- **invoice** (US): set an amount and a tax code, write three voucher lines,
  confirm the balance, pay.

Three workflow tasks, each a month's worth of one job on one page per side:

- **inbox** (Norwegian): eight supplier invoices read from documents. Three
  fields were read with low confidence (a gross amount read wrong, an invoice
  number read wrong, a due date right as read); the task text gives what the
  paper invoices say. One invoice has no coding and must go to 6810 with
  25 % VAT; one is a second copy of an invoice booked in September and must
  be rejected; the rest are booked as coded.
- **reconcile** (Norwegian): twelve lines on the October statement for 1920
  and twelve open posts. Ten matches: two pairs of equal amounts told apart
  only by reference, one invoice paid in two parts, and one bank line with no
  post, to be left open. Two posts have no payment.
- **close** (Norwegian): October's checklist. In the order the tasks depend
  on: check that October is open for posting, post the depreciation voucher
  (2026-10-31, debit 6010, credit 1290, 12 500,00), mark it done, check that
  the trial balance sums to zero with the depreciation in it. The two
  sign-offs and closing the period are a person's and must be left. Both
  pages show the trial balance (a plain table; a Booki `DataTable` with the
  balance summed) and add the voucher to it once posted. The first real runs
  had no trial balance on either page, and the models rightly would not tick
  a check they could not make; those runs were discarded and the task rerun.

The workflow data is in `apps/www/src/components/bench/workflow-data.ts`,
shared by both pages of a task; the checks keep their own copy of the end
state in `src/verify.ts`.

**Step caps.** A single-screen task gets 30 model requests. The workflows are
longer, so each has its own cap, set at more than twice what the scripted
best case needs on the replica (h2h, 21 Nov 2026): inbox 90 (the script takes
35 calls), reconcile 70 (33), close 40 (11). `--max-steps` overrides it. A
run that hits the cap is a failed run.

The texts are in `src/tasks.ts`. The system prompt is one neutral sentence and
names no tool or product.

## Hard tasks (written before Booki ran them)

Five harder tasks were written before any run of them: `doc-error`,
`closed-period`, `duplicate`, `foreign-currency` and `partial-vat`. Each has a
raw page (`/bench/<id>-raw`) and a Booki page (`/bench/<id>-acc`). Their checks
read the end state the page writes to `window` (`src/verify-hard.ts`), and the
checks are unit-tested in `src/verify-hard.test.ts`
(`pnpm --filter agent-benchmark test`).

- The task ids, page paths, fixture numbers, window-state shapes, expected end
  states and check names are fixed as of the commit that adds them. They must
  not be tuned against any result. A change needs a new task id, not an edit.
- No runs exist yet. `RUNS.md` has no row for these tasks, and no number is
  claimed for them.
- They are not part of `pnpm proof` or the head-to-head (`h2h`).
- The model-free dry run exercises the pages with scripted agents, in a local
  browser, and no model is called: `pnpm --filter agent-benchmark bench -- --dry-run --task <id>`.
- What Booki can and cannot do on each task, and where its controls do not
  help, is in [HARD-NOTES.md](HARD-NOTES.md).

## Pages

| Page | Built from | Tools |
| --- | --- | --- |
| `/bench/voucher-raw` | A read-only DOM snapshot of a listbox-style voucher screen | Playwright MCP |
| `/bench/voucher-grid` | A read-only DOM snapshot of a grid-style voucher screen | Playwright MCP |
| `/bench/voucher-acc` | Booki: `FinancialDateField`, `VoucherComposer`, a ui-sdk `Button` | ui-sdk bridge |
| `/bench/supplier-invoice-raw` | A read-only DOM map of the same product's detailed supplier-invoice entry | Playwright MCP |
| `/bench/supplier-invoice-acc` | Booki: `AccountPicker` ×2, `InvoiceNumberInput`, `FinancialDateField` ×2, `PaymentReferenceInput`, `AmountField`, `TaxCodeSelect`, read-only `VoucherLines`, a ui-sdk `Button` | ui-sdk bridge |
| `/bench/sales-invoice-raw` | A read-only DOM map of the same product's new order/invoice screen | Playwright MCP |
| `/bench/sales-invoice-acc` | Booki: `AccountPicker` (customers), `InvoiceEditor`, a ui-sdk `Button` | ui-sdk bridge |
| `/bench/dashboard-raw` | A read-only structural map of one product's dashboard: SVG charts | Playwright MCP |
| `/bench/dashboard-grid` | A read-only structural map of another product's dashboard: canvas charts | Playwright MCP |
| `/bench/dashboard-acc` | Booki: `KpiStat` ×2, `TrendChart`, `AgingChart`, `BarChart` | ui-sdk bridge |
| `/bench/inbox-raw` | Built for this benchmark in the patterns of the listbox supplier-invoice replica; not a map of a product's inbox | Playwright MCP |
| `/bench/inbox-acc` | Booki: `SupplierInvoiceInbox` | ui-sdk bridge |
| `/bench/reconcile-raw` | Built for this benchmark: two plain tables with unlabeled checkboxes and an icon-named reconcile button; not a map of a product's screen | Playwright MCP |
| `/bench/reconcile-acc` | Booki: `BankReconciliation` | ui-sdk bridge |
| `/bench/close-raw` | Built for this benchmark: a plain checklist, a period table and a voucher form; not a map of a product's screen | Playwright MCP |
| `/bench/close-acc` | Booki: `CloseChecklist`, `PeriodLock`, `DataTable` (trial balance), `FinancialDateField`, `VoucherComposer`, a ui-sdk `Button` | ui-sdk bridge |
| `/bench/semantic` | Plain, well-labelled semantic HTML | Playwright MCP |
| `/bench/acc` | Booki: `AmountField`, `TaxCodeSelect`, `VoucherComposer` | ui-sdk bridge |

The two voucher replicas were rebuilt by hand from DOM snapshots taken read
only (nothing was submitted), with invented data and a neutral look. What was
kept, because it is what a browser agent reads:

- widget roles as shipped: pickers as `<a role="listbox">` with no name; a
  plain `<table>` without `role="grid"` and one floating, unlabeled
  `<input role="combobox">` editor
- missing labels: the amount and reference inputs have none; icon buttons are
  named by their icon-font ligature ("close", "content_copy")
- defaults: "post on save" ticked; one button that saves and posts
- the pick dialog's single list mixing accounts, customers, suppliers and
  employees
- on the supplier-invoice and order replicas: pickers as `div role="listbox"`
  whose accessible name is literally "[object Object] (Ikke valgt)" (or
  "(Velg kunde)", "(Velg produkt)"), a bug kept because it is what an agent
  reads; order-line inputs with an empty placeholder and no label; an
  unnamed native select and `button role="combobox"`; unlabeled checkboxes;
  "Bokfør nå" ticked by default; line headers as plain text

On the dashboard replicas, what decides how an agent can read them:

- SVG dashboard: charts are `svg role="application"` with no name and an
  empty `<title>`/`<desc>`; bars carry only a class; the income/cost chart's
  per-month values are not in the DOM until a month is hovered, and then only
  in an HTML tooltip; the chart shows one calendar year at a time (a year
  select), so November and December 2025 need the year switched; the
  invoice donut's totals sit in an HTML legend; the payroll split exists only
  as drawn segments
- canvas dashboard: charts are `<canvas>` with no role, name or fallback;
  hovering a bar adds an HTML tooltip "Inntekter # Kostnader # Resultat #"
  with no month, so the month is known only from where the pointer is; the
  year is a dropdown button. Changed on purpose: the mapped account showed
  the receivables widget as an empty state; the replica gives it the overdue
  breakdown (not due / 1-30 / over 30) as a canvas donut with HTML totals, so
  the same overdue question can be answered there
- all three dashboards show the same invented figures (the overview's twelve
  months 2025-11..2026-10 and the demo receivables aged on 2026-10-31)

The two newer replicas were built from a structural map, not a full DOM
snapshot: where the map is silent (the Merverdiavgift section, the pick
dialogs, how VAT is set on an order line) the component says so and follows
the voucher screen's patterns. A grid-style counterpart of each can be added
as one more page of its task, as `voucher-grid` is for the voucher.

The three workflow replicas were not rebuilt from a DOM map of the products'
own inbox, reconciliation or close screens: none was taken. They are built
in the patterns the mapped screens show (unnamed pickers named "[object
Object] …", unlabeled inputs and checkboxes, icon-ligature button names, one
button that posts at once, no rule that stops an agent), and are labelled as
built, not rebuilt, in the tables. On them nothing tells a person's step from
anyone's: "Signer", "Lukk periode", "Bokfør" and "Avvis" are ordinary buttons.

On Booki the workflows end where the controls hand over to a person:
approving and rejecting supplier invoices, approving suggested matches, and
signing off and closing are a person's buttons and not agent actions. So the
inbox and reconcile tasks end, on Booki, with everything ready for the person
and nothing decided; the close task posts its voucher under the company's
rule (balanced, dated in an open period, at most 50 000 kr) and leaves the
sign-offs. The replicas have no such hand-over, so the same task text ends
there with the invoices booked, the lines reconciled and the voucher posted.
What each side's end state must be is listed under Success.

Each component's header comment lists what it keeps and what was not observed
(`apps/www/src/components/bench/*.tsx`). Every bench page sets the same neutral
tab title for its task, because browser tools report the title to the model.

The Booki voucher page also carries the company's rule for posting without a
person (balanced, passes the account rules, dated, at most 50 000 kr). The
Booki supplier invoice has one too (invoice number and dates filled, due on
or after the invoice date, KID check digit valid, at most 50 000 kr). The
Booki order lets an agent create the draft order when it has no issues;
finalizing the invoice (number, fixed) stays a person's button. The replicas
have no such rules, because the screens they copy have none.

Starting values are matched where the controls allow it: Booki's pickers
always hold a value, so their lists are in the same order as the replicas'
and start on the same first entry (not the one the task needs), and the VAT
picker starts on 0 % like the replica's.

## Tools

- **Browser pages:** the official Playwright MCP server, `@playwright/mcp`
  pinned to an exact version, started per run over stdio from the harness with
  the MCP SDK client (`src/mcp.ts`). Command line: `--browser chrome --isolated
  --viewport-size 1280x900 --headless`; everything else is the server's
  default. The model gets the server's full default tool list (25 tools in
  0.0.84) with their definitions unchanged, and every result exactly as the
  server returns it. In this version an action's reply links the new snapshot
  as a file instead of inlining it, so reading the page after an action costs
  a `browser_snapshot` call; the model has no file tool.
- **Bridge pages:** ui-sdk's `agentTools` (`snapshot`, `act`, `query`),
  unchanged, run in the page against `window.agent`.
- **Fallback:** `--browser-tools legacy` swaps the server for the old
  in-process four-tool imitation (`src/tools.ts`). It exists only for machines
  where the server cannot run, and its results say so.

The harness opens each page before the run, in a fresh browser profile
(browser pages) or a fresh browser context (bridge pages), and waits until it
is ready. That navigation and the end-state reads after the run go through the
harness's own channel and are never shown to the model or counted.

## Two measurements

**`bench`: a real model.** A plain tool-use loop per run: send, run the tools
the model asked for, send every result back, until the model ends its turn or
`--max-steps` requests. Prompt caching is on (top-level `cache_control`), as in
a real loop. Pages alternate within each round of runs.

**`h2h`: a scripted agent, no model.** A script
that never errs does the task on each page through the same tools. It is the
best case for the replicas: it knows which unnamed widget is which, never
retries, skips the search boxes, and takes a snapshot only where it needs refs
it has not seen or must read the page (the balance check the task asks for).
`--dry-run` runs the same scripts on every page of every task.

On the dashboard replicas the script runs two strategies, reported as
separate rows:

- **hover**: one snapshot, then for each month with data (October back to
  January 2026, then the year switched, then November and December 2025) a
  hover and a `browser_snapshot` to read the tooltip. On the SVG dashboard
  the bars have no refs, so the script targets each month's hover area by
  CSS selector (the tool accepts one), which a model would first have to
  discover. On the canvas dashboard there is nothing to target at all: the
  script moves the pointer to each bar's position with
  `browser_mouse_move_xy`, which Playwright MCP offers only with `--caps
  vision` (six more tool definitions, counted), and it knows the bar
  positions from the page's layout (read by the harness, not counted) and
  which month each tooltip belongs to. This route gets exact numbers.
- **screenshot**: one snapshot (for the text that is in the DOM), a
  full-page `browser_take_screenshot`, the year switched, and a second
  screenshot. A screenshot gives bar heights, not values, so the monthly
  amounts can only be estimated: this route is reported as cost only, with
  its answer marked "approximate" and never counted as correct. The
  scripted answer text on this route is a stand-in for what a model would
  write from the picture.

On Booki one bridge snapshot holds every series by period, the aging
buckets and the KPI values: one call.

A real model on these pages (`bench --task dashboard`) gets the server's
default tools, without `--caps vision`; on the canvas dashboard that leaves
it screenshots and code tools. `h2h` runs
the voucher, supplier-invoice, sales-invoice, dashboard, inbox, reconcile
and close tasks by default (`--task` picks one) and repeats each scripted run `--repeats` times (default 3) for
timing; tokens are counted on the first repeat, since the calls are the same.

## Metrics and how they are counted

`bench`, per run, all from the API's `usage` of every request:

- requests and tool calls
- input, cache-write, cache-read and output tokens (output includes thinking)
- wall time from the first request to the end of the loop, tool time included
- cost from list prices in `src/pricing.ts`
- tool-definition tokens per page, once, from count_tokens (tools vs. no tools)
- calls to tools that run code in the page (`browser_evaluate`,
  `browser_run_code_unsafe`): allowed, because a real agent has them, and
  counted, because they bypass the screen
- the end state, whether the pay/post step happened, and the full transcript
  (every message as sent and received, thinking included)

Reported: every run, and per page the median with min and max.

`h2h`, per page:

- tool-definition tokens: count with tools minus count without, which
  includes the tool-use preamble the API adds when tools are present
- calls, and the tokens each call adds to the history (tool_use + tool_result)
- the whole transcript once (system, task, tool definitions, every call)
- input over the loop: one request per call plus the final one, each
  resending the history so far, without caching (an upper bound on billing)

- output tokens: the tool_use blocks only (tool name and arguments): what
  the model has to write at the least. A lower bound: a real model also
  writes reasoning and text
- model requests: one per call plus the final answer
- images: a screenshot in a tool result is input like any other result.
  Without a key it is counted by Anthropic's documented rule: the image is
  scaled down (aspect kept) to fit the model's limits, then costs (width ×
  height) / 750 tokens. For Opus 5.5 (the high-resolution tier, as Opus 4.7
  and later), per the claude-api skill's model guide: 2576 px on the long
  edge, 3.75 megapixels, at most 4 784 tokens per image. With a key,
  count_tokens counts the image; the pixel-rule figure is still reported as
  `imageTokens`. Image tokens are priced as input
- cost at the model's list prices from `src/pricing.ts` (Claude Opus 5.5:
  $4 / MTok input, $20 / MTok output, $0.20 / MTok cache read, 5-minute cache
  write 1.25× input = $5 / MTok), two ways:
  - no cache: every request's whole input at the input price, plus output
  - with cache: in each request, the prefix already sent before is a cache
    read and the newly appended part a 5-minute cache write; plus output.
    This ignores the model's minimum cacheable prefix length: a transcript
    shorter than that is not cached at all, so for the short Booki
    transcripts the with-cache figure is lower than what would be billed and
    the no-cache figure is the realistic one
  - and both times 1 000 and 100 000 runs, and the ratio of each replica to
    Booki
- tool time: wall time around each tool call from the harness, real MCP
  server and bridge alike, summed per run; median, min and max over the
  repeats. It includes Playwright MCP's default wait for the page to settle
  after an action. It is tool time only: no model latency is modelled, and
  end-to-end time needs `bench` with a key

With `ANTHROPIC_API_KEY` set, every h2h number comes from the Messages API
count_tokens endpoint for `--model` (free; no model runs). Without a key it is
characters ÷ 4, and the console and the JSON say "estimate" on every number.

## Model

`--model` (default `claude-opus-5-5`), `--effort` (default `medium`, sent as
`output_config.effort`; `none` leaves it out), thinking at the model's default.
The results file records the requested model id and the id the API answered
with on every request.

## Runs

`--runs` per page (default 3). Medians with min and max. Failed runs stay in
the statistics; only runs the API never completed (`api_error`) are left out,
and are reported.

## Success

A run succeeds when the model ended its turn on its own and every end-state
check holds (`src/verify.ts`):

- voucher, replicas: date 31.10.2026 (as `2026-10-31` or `31.10.2026`), one
  line, 6800 with the 25 % input VAT code (listbox page), 2400 without VAT, 15
  500,00 gross, posted
- supplier invoice, replica: supplier 20001, invoice number, both dates (ISO
  or d.m.yyyy), KID, Totalt beløp and Beløp NOK 15 500,00, one line on 6800
  with VAT code 1 (25 %) and either net 12 400,00 or gross 15 500,00, posted
- supplier invoice, Booki: the same fields, gross 15 500,00, 6800, MVA25,
  posted (the page splits net and VAT)
- sales invoice, both: customer 10001, exactly two lines with the right
  description, quantity and unit price and no markup or discount, net
  20 505,00, VAT 5 126,25, created. On Booki the agent sets 25 % on each
  line itself; on the replica it is the screen's default
- dashboard, every page: the final answer contains 486 500,00 and 318 400,00
  (October 2026), December 2025 and 512 900,00 (highest income), and
  23 610,00 (overdue more than 30 days), in any wording or order; amounts are
  read from the text in Norwegian or plain notation. Nothing is posted
- voucher, Booki: date, exactly three lines (6800 debit 12 400 with MVA25,
  2710 debit 3 100, 2400 credit 15 500), posted. The agent writes the VAT split
  itself, which is more work than the replicas ask for
- inbox, replica: each of the seven invoices booked with every field and
  the coding right (si-02's gross 9 375,00, si-04's number 4471, si-05 on
  6810 with 25 %), the copy si-06 rejected, the booked original untouched
- inbox, Booki: the same values on each invoice; each of the seven with no
  issue left (fields reviewed, coded, totals adding up), so a person can
  approve it; the copy still open and flagged against invoice 3307; no
  invoice approved or rejected (those are a person's)
- reconcile, replica: exactly the ten matches, b12 left open
- reconcile, Booki: exactly the ten matches, each still a suggestion waiting
  for a person; b12 left open
- close, both: the period task, the voucher (dated 2026-10-31, two lines,
  6010 debit and 1290 credit 12 500,00, posted), the depreciation task and
  the balance task, in that order (read from the page's own event log);
  nothing reopened; neither sign-off given; the closing task open; the
  periods as they were
- invoice: amount, tax code, three lines in any order, debit equals credit;
  paid on the HTML page, not paid on the Booki page (its pay button is marked
  `data-agent-confirm`, so the bridge refuses it and a person must pay)

## Excluded

- the harness's navigation, readiness polling and end-state reads
- runs that ended in `api_error`, from the statistics only
- nothing else: wrong end states, step-cap runs and declined runs are failures
  and stay in the medians

## Versions

Every results file holds the model ids, Playwright MCP (package and the
Playwright build it reports in the MCP handshake), its command line, the MCP
SDK, playwright-core, `@ui-sdk/react`, the Anthropic SDK, Chrome, Node, the
platform, and the git commit with a flag for uncommitted changes. The console
prints the same line.

## Real-model runs

`pnpm proof` runs `bench` for every task, five runs per page. The key comes from
`ANTHROPIC_API_KEY` or a Vercel AI Gateway key in `apps/www/.env.local`; with a
gateway key the runs use the gateway's Anthropic-compatible endpoint and its
model ids, and prices come from the gateway's model list, so cost is right for
any model. Anthropic's `effort` is left out for other providers. The workflow
tasks were run against a built copy of the site under `vite preview`, so that
other work on the dev server could not disturb them. Results and what they
showed are in the README.

## Tools the model never gets

`browser_run_code_unsafe` runs Node code in the Playwright MCP server, with the
file system and network of the machine the benchmark runs on, and
`browser_file_upload` reads local files. Both are withheld from the tool list,
and the browser may only request the benchmark site (`--allowed-origins`). In
the runs of 21 November they were available: models used the first to read
pages, and in four runs to list folders, read files and scan ports on the
benchmark machine. Those transcripts are not published; [RUNS.md](RUNS.md)
lists every run.

## API baseline (not run)

The same three tasks (voucher, supplier invoice, sales invoice) and the same
end-state checks exist for an agent that has tool calls straight to a
bookkeeping API and no screen. The code is in `src/api/`: an in-process
`BookkeepingApi` for the Norwegian profile, its tool definitions, and
`verify.ts`, which reuses the screen runs' expected numbers and check names.
It is unit-tested (`pnpm --filter agent-benchmark test`) and has never been run
against a model. No figures exist and none are published. The paid runs, the
figures and the FAQ update on the site are still open under issue #13.

## Threats to validity

- **Code tools.** A model may read a page with `browser_evaluate`; Opus did on the replica dashboards. Real products whose chart data is not in the page would deny that.
- **Re-checked answers.** After the answer check was widened to English number formats, saved dashboard answers were re-checked from their final text (`src/reverify.ts`); changed runs are marked `reverified`.

| Threat | What was done |
| --- | --- |
| The replicas are not the live products. Markup, timing and data differ. | Built from read-only DOM snapshots; roles, missing labels and defaults kept and listed in each component. Not done: running against the live products. |
| The scripted agent is the best case for the replicas, so h2h understates their cost. | Said in the output and here. `bench` measures what a model actually does. |
| One small task per benchmark. Snapshots grow with the DOM, bridge snapshots with the number of components; nothing here says how either scales. | Two tasks on five pages. Larger tasks not done. |
| One model per invocation. Another model or effort can change both sides. | `--model` and `--effort`; both recorded per run. |
| Model runs vary. | Medians with min and max, every run listed; raise `--runs` before comparing close numbers. |
| The Booki pages were built by the people who built Booki. | The bridge tools are ui-sdk's, unchanged; the browser side is the unmodified Playwright MCP server; page sources are in the repo. An independent rebuild of the Booki page was not done. |
| The Booki voucher page has an auto-post rule the replicas lack. | Reported as a difference ("rules checked"), not folded into tokens. The Booki task is also harder: the agent splits VAT itself. |
| Playwright MCP's defaults decide its token cost (25 tools, snapshots linked as files). Other settings or other browser agents (screenshots, computer use) give other numbers. | Defaults used, command line recorded. `--browser-tools legacy` shows the effect of a smaller, inlining tool set. Other agents not measured. |
| The model on the browser side cannot open the snapshot files the server links. | It can read the same snapshot with `browser_snapshot`, which the tool list offers. |
| Code-running browser tools let a model bypass the screen. | Kept (a real agent has them), counted per run, visible in the transcript. |
| Characters ÷ 4 is not a token count. | Used only without a key, and labelled "estimate" everywhere. With a key, count_tokens. |
| Tool definitions are a fixed cost per request that differs a lot between sides. | Counted and reported for both sides. |
| Caching changes what is billed. | `bench` caches and reports cached and uncached tokens apart; h2h's loop input is uncached, an upper bound. |
| Page titles and other site chrome could tell the model which side it is on. | Bare pages with one neutral title per task. |
| End-state hooks (`window.__rawVoucher` and the others) are readable by a model with `browser_evaluate`. | They are read-only mirrors of React state, rewritten every render; writing them changes nothing. |
| Wall time depends on the API, this machine and Vite's development build. | Reported, not used for any claim; token counts don't depend on it. h2h reports tool time only, as a median over repeats, and says so. |
| The two newer replicas come from a structural map, not a full DOM snapshot. | Each component lists what was kept and what was not observed. |
| "Create" means different things: posting on the replicas, creating a draft order or posting under a rule on Booki. | Each page's end state is checked separately and listed above. |
| The with-cache cost ignores the minimum cacheable prefix. | Said in the output and here; the no-cache cost is also reported. |
| A scripted repeat can fail where the others pass (a page still re-rendering, a ref the server no longer resolves). | Tokens and timing come from the repeats that finished; every repeat's call count, end state and error is in the JSON (`perRepeat`), the console flags the side, and h2h exits non-zero only when no repeat finished. |
| On the dashboard replicas the hover script knows things a model would have to find out: CSS selectors for the SVG bars, pixel positions and month order of the canvas bars. | Stated here and in the output; it makes the hover numbers a best case. |
| The screenshot route cannot be checked for exact numbers. | It is reported as cost only, marked "approximate", never as correct. |
| The canvas hover route needs `--caps vision`, which a default Playwright MCP setup does not have. | Its extra tool definitions are counted; `bench` runs the default tools. |
| The canvas dashboard's receivables widget was changed from the mapped empty state. | Said above; without it the overdue question could not be asked there. |
| The dashboard figures and timing exclude model latency. | h2h reports tool time only; end-to-end time needs `bench` with a key. |
| Prices move. | List prices dated in `src/pricing.ts`; `--prices` overrides. |
| The workflow replicas were built in the mapped patterns, not rebuilt from a map of the products' own workflow screens. | Said in the pages table, in each component and in the result tables ("built", not "rebuilt"). |
| On Booki the inbox and reconcile workflows stop at the person's step; on the replicas the agent finishes them. Booki asks less of the agent there. | Each side's end state is checked against what its page allows and listed under Success; the step that is left is a person's on purpose. Booki's close task posts, as the replica's does. |
| The task text tells the model the right values for the low-confidence fields. | The same text on both sides. Without it neither side could know them: the documents are not on the pages. |
| The scripted best case on the workflow replicas knows each row's text and the order of the unnamed inputs. | As for the single screens: it is a best case, and `bench` measures what a model does. |
| The workflow step caps were set from the scripted replica runs. | Set at more than twice the script's calls; a model on Booki needs far fewer. |
