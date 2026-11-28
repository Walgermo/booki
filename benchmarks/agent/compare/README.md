# Side by side: live public pages with and without Booki

**Internal only.** Not for the site, the launch post or anything public: #201
took public-site comparisons out, and this does not bring them back. The
replays name and show the live pages.

One task, two agents, started at the same moment:

| Side | Page | Tools |
| --- | --- | --- |
| Without Booki | the live public page | Playwright MCP, allowed to request that site's own origin only |
| With Booki | the same calculator rebuilt on Booki (`/bench/tax-acc`, `/bench/price-acc`) | the bridge |

Same model, system prompt, task text, loop and step cap on both, and the same
check of the answer. Every tool call is recorded with its time and a
screenshot of the page after it; `viewer.html` plays the two runs next to each
other in real time, with tool calls, requests, tokens and cost counting up.

## The two tasks

| Task | Live page | Question | Right answer |
| --- | --- | --- | --- |
| `tax` | Skatteetaten's tax calculator | Unmarried, born 1990, 650 000 kr salary, nothing else: estimated tax for 2026 | 160 982 kr |
| `price` | SSB's price calculator | 10 000 kr in January 2000, in October 2026, and the price rise | 19 279,11 kr, 92,8 % |

The rebuilds give the live pages' answers, and a test holds them to it
(`src/compare-rules.test.ts`):

- **Tax:** the 2026 rules in `apps/www/src/components/bench/compare/tax-2026.ts`
  were fitted to Skatteetaten's calculator and match it line by line (minstefradrag,
  alminnelig inntekt, fellesskatt, kommune og fylke, trinnskatt, trygdeavgift)
  for every salary in `fixtures/tax-2026.json`, from 100 000 to 2 500 000 kr.
  Only this person is worked out; any other status is refused rather than given
  a wrong number.
- **Price:** the index is SSB's own (tables 14709 and 14711, `kpi.json`), and the
  result is SSB's to the øre.

## Run it

```bash
pnpm install
pnpm --filter @booki-aui/www dev --port 5183        # or let compare start the site
ANTHROPIC_API_KEY=… pnpm --filter agent-benchmark compare --task tax --url http://localhost:5183
ANTHROPIC_API_KEY=… pnpm --filter agent-benchmark compare --task all --model claude-sonnet-5-5 --url http://localhost:5183
pnpm --filter agent-benchmark compare --task all --scripted --url http://localhost:5183   # no model, no key
```

The key is found as `pnpm proof` finds it: `ANTHROPIC_API_KEY` in the shell, or
`ANTHROPIC_API_KEY` / `AI_GATEWAY_API_KEY` in `apps/www/.env.local` here or in the
main checkout (git-ignored). A gateway key runs `anthropic/claude-opus-5.5` through
Vercel AI Gateway, at the gateway's list price. `vercel env pull` in `apps/www`
writes a short-lived `VERCEL_OIDC_TOKEN` there; put it in as `AI_GATEWAY_API_KEY`
if you have no gateway key of your own.

Each run writes `results/compare-<task>-<time>.json` and a self-contained
`.html` next to it (results/ is not committed). Open the HTML in a browser and
press play.

| Flag | Default | |
| --- | --- | --- |
| `--task` | `tax` | `tax`, `price` or `all` |
| `--model` | `claude-opus-5-5` | Any model id; cost needs a price in `src/pricing.ts` |
| `--effort` | `medium` | or `none` for a model that does not take it |
| `--max-steps` | `30` | Model requests per side |
| `--scripted` | | A scripted agent that never errs, through the same tools, instead of a model |
| `--url` | | A site that is already running; otherwise it builds and starts one on 5199 |
| `--headed` | | Show both browsers |

## Reading the numbers

- **A scripted run proves the plumbing, not the model.** The pages and tools
  are real, but there is no model, so its clock is tool time only. The viewer
  compares tool calls on a scripted run and nothing else. Time, tokens and cost
  need a run with a model.
- **The live side is the real page, as it is today.** It has a cookie banner
  (answered "Kun nødvendige", the least data), a survey prompt, and whatever
  changed since the scripts were written. A scripted step that breaks says
  which element it looked for.
- **The live side is not handicapped.** Playwright MCP's snapshot names these
  pages' fields well; the agent gets every tool the benchmark's other browser
  runs get, and only the site's own origin.
- **Screenshots are the harness's.** They are never shown to the model, and
  their time is taken out of both clocks.
- **One run is one run.** For figures to quote, run several and take medians.

## Refreshing the fixtures

When the tax rules or the index change:

```bash
node benchmarks/agent/compare/capture-tax.mjs   # reads Skatteetaten's calculator for eight salaries
node benchmarks/agent/compare/capture-kpi.mjs   # SSB's open API, tables 14709 and 14711
pnpm --filter agent-benchmark test              # the rebuild must still match
```

`capture-tax.mjs` opens the calculator eight times, one after the other with a
pause between; it stores nothing on Skatteetaten's side. Both sites' robots.txt
allow these pages.
