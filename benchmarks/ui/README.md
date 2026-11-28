# UI benchmark

Render and interaction timings for the heavy Booki controls, in Chrome:

```bash
pnpm build:packages
node benchmarks/ui/run.mjs            # --runs 11, --json out.json
```

`run.mjs` bundles [`page.tsx`](page.tsx) with production React, opens it in
Chrome (playwright-core, `channel: "chrome"`) and prints the median of each
measurement. Every step starts on a fresh mount. The time runs from the trigger
until React has flushed and the browser has done style and layout. It does not
wait for the next frame. An agent step that the bridge refuses fails the run,
so a refusal is never timed as if it were the work.

| Case | Data |
| --- | --- |
| DataTable | 5 000 invoices, 6 columns (2 money, 2 dates), 100 per page, selectable |
| LedgerTable | 5 000 entries, opened on the bank account (4 375 of them) |
| VoucherComposer | 200 editable lines |
| BankReconciliation | 1 000 bank lines and 1 000 open posts |
| TrendChart | 3 series × 120 months, range "all" |

## Results

Medians of 11 runs on one machine (Apple silicon, Chrome). "Before" is
`main` with ui-sdk 0.1.0-beta.19, and "after" is this change.

| Control | Step | Before (ms) | After (ms) | Speed-up |
| --- | --- | ---: | ---: | ---: |
| DataTable, 5 000 rows | mount | 12.0 | 5.6 | 2.1× |
| DataTable, 5 000 rows | person types in search | 62.5 | 9.3 | 6.7× |
| DataTable, 5 000 rows | person sorts a column | 60.9 | 8.3 | 7.3× |
| DataTable, 5 000 rows | agent setSearch | 64.3 | 29.3 | 2.2× |
| DataTable, 5 000 rows | parent re-renders, one row changed | 32.2 | 3.0 | 10.7× |
| LedgerTable, 5 000 entries | mount | 27.3 | 25.6 | 1.1× |
| LedgerTable, 5 000 entries | agent setSearch | 45.6 | 22.9 | 2.0× |
| LedgerTable, 5 000 entries | agent setSort | 58.2 | 29.3 | 2.0× |
| LedgerTable, 5 000 entries | parent re-renders, one entry changed | 34.0 | 15.4 | 2.2× |
| VoucherComposer, 200 lines | mount | 31.9 | 30.3 | 1.1× |
| VoucherComposer, 200 lines | agent setDebit | 28.2 | 23.7 | 1.2× |
| BankReconciliation, 1 000 + 1 000 lines | mount | 61.4 | 47.9 | 1.3× |
| BankReconciliation, 1 000 + 1 000 lines | agent suggestMatch | 33.1 | 26.4 | 1.3× |
| TrendChart, 3 series × 120 months | mount | 30.4 | 6.2 | 4.9× |
| TrendChart, 3 series × 120 months | agent setRange | 18.0 | 23.9 | 0.8× |

An agent step goes through the bridge, which waits for the page to settle
after each step: about 20 ms of it is idle time, whatever the control. Steps
near that floor, such as TrendChart's `setRange` and VoucherComposer's
`setDebit`, vary by about ±5 ms from run to run, so a difference that size
means nothing.

## Where the time went, and what changed

- **`Intl` formatters made per cell.** `formatMoney`, the table's number and
  date cells, and the charts' axis and period labels made a new
  `Intl.NumberFormat` or `Intl.DateTimeFormat` on every call. They now come
  from `@booki-aui/core/intl`, one per locale and options.
- **Search folded every cell.** `toLocaleLowerCase` + `normalize("NFKD")` on
  30 000 cells per keystroke took 83% of a search. Plain ASCII now takes the
  same result from `toLowerCase`, and other text is folded once and kept.
- **Sort made a collator per comparison.** `localeCompare(b, "nb-NO", options)`
  builds one each time, which was 83% of a sort. The sort now uses one
  `Intl.Collator` with the same options and reads each row's value once.
- **VoucherComposer looked lines up by scanning.** Every cell of every row
  scanned all the lines, so one update cost O(n²). Lines are now indexed by id
  per lines array.

`packages/core/src/table-speed.test.ts` checks that search, sort and the
formatters give exactly what they gave before.

## Where 20× is not reachable

- **Agent steps:** most of each one is the bridge's settle wait, which sits in
  ui-sdk, not in Booki.
- **BankReconciliation mount, VoucherComposer mount:** most of the time is
  React and the DOM creating 2 000 rows, or 200 rows of inputs. Only
  virtualising the lists would change that by an order of magnitude. That also
  changes what an agent and the browser's find-in-page can reach, so it needs
  its own design and is not in this change.
