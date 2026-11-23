# Every real-model run

All 25 result files from the real-model runs of 21 November 2026, counted or
not. Each cell is right/runs per page (`raw` and `grid`: the rebuilt screens;
`acc`: Booki). "Code calls" counts `browser_run_code_unsafe`, a tool that ran
Node code on the benchmark machine.

The transcripts are not published. In four runs a model used
`browser_run_code_unsafe` to list folders, read files and scan ports on the
machine the benchmark ran on, so they hold its owner's file names. That tool
and `browser_file_upload` are withheld from the model from now on, and the
browser may only request the benchmark site (`src/mcp.ts`). The transcripts of
the next measurement, made that way, will be published whole.

What is withdrawn, and why:

- **voucher** and **sales-invoice**: the Booki control's format hint held the
  task's answer. VoucherComposer's read
  `addLine({ account: "6800", debitMinor: 1550000, vatCode: "1" })`, the
  voucher's account, amount and VAT code; InvoiceEditor's read
  `addLine({ description: "Rådgivning", quantity: 12.5, unitPriceMinor: 145000, taxRate: 25 })`,
  the sales invoice's first line. The hints are changed, and
  `packages/primitives/src/no-task-answers.test.ts` now fails when any hint,
  example or refusal holds an account, amount, quantity or name from a task.
  The Booki voucher control was also improved between rounds after models
  failed on it; the rounds before are listed here as not counted.
- **Workflow tasks (inbox, reconcile, close)**: the inbox's coding hint named
  VAT code "1", the code the task asks for. Their figures in README.md stand
  until they are run again, with that noted.

| File | Task | Model | Right per page | Code calls | Status |
| --- | --- | --- | --- | --- | --- |
| `bench-dashboard-2026-11-21T12-54-42-516Z.json` | dashboard | claude-opus-5.5 | raw 5/5, grid 5/5, acc 5/5 | 62 | Counted |
| `bench-dashboard-2026-11-21T13-41-32-509Z.json` | dashboard | deepseek-v4.1-flash-1017 | raw 4/5, grid 4/5, acc 5/5 | 128 | Counted |
| `bench-dashboard-2026-11-21T15-16-52-902Z.json` | dashboard | claude-sonnet-5.5 | raw 5/5, grid 5/5, acc 5/5 | 52 | Counted |
| `bench-dashboard-2026-11-21T15-43-32-141Z.json` | dashboard | claude-haiku-5.5 | raw 5/5, grid 4/5, acc 5/5 | 90 | Counted |
| `bench-reconcile-2026-11-21T18-25-51-991Z.json` | reconcile | claude-haiku-5.5 | raw 5/5, acc 5/5 | 8 | Counted |
| `bench-reconcile-2026-11-21T18-37-40-788Z.json` | reconcile | deepseek-v4.1-flash-1017 | raw 5/5, acc 5/5 | 108 | Counted |
| `bench-reconcile-2026-11-21T18-40-12-314Z.json` | reconcile | claude-sonnet-5.5 | raw 5/5, acc 5/5 | 8 | Counted |
| `bench-sales-invoice-2026-11-21T12-48-01-621Z.json` | sales-invoice | claude-opus-5.5 | raw 5/5, acc 5/5 | 0 | Not counted: superseded by a later run of the same model |
| `bench-sales-invoice-2026-11-21T13-26-34-254Z.json` | sales-invoice | deepseek-v4.1-flash-1017 | raw 4/5, acc 5/5 | 0 | Not counted: superseded by a later run of the same model |
| `bench-sales-invoice-2026-11-21T14-53-25-292Z.json` | sales-invoice | claude-opus-5.5 | raw 4/5, acc 5/5 | 0 | Withdrawn: a format hint held the answer |
| `bench-sales-invoice-2026-11-21T14-58-27-203Z.json` | sales-invoice | deepseek-v4.1-flash-1017 | raw 3/5, acc 5/5 | 0 | Withdrawn: a format hint held the answer |
| `bench-sales-invoice-2026-11-21T15-09-56-971Z.json` | sales-invoice | claude-sonnet-5.5 | raw 5/5, acc 5/5 | 0 | Withdrawn: a format hint held the answer |
| `bench-sales-invoice-2026-11-21T15-32-30-926Z.json` | sales-invoice | claude-haiku-5.5 | raw 5/5, acc 5/5 | 0 | Withdrawn: a format hint held the answer |
| `bench-supplier-invoice-2026-11-21T12-43-33-013Z.json` | supplier-invoice | claude-opus-5.5 | raw 5/5, acc 5/5 | 0 | Counted |
| `bench-supplier-invoice-2026-11-21T13-20-40-668Z.json` | supplier-invoice | deepseek-v4.1-flash-1017 | raw 4/5, acc 5/5 | 14 | Counted |
| `bench-supplier-invoice-2026-11-21T15-07-39-940Z.json` | supplier-invoice | claude-sonnet-5.5 | raw 5/5, acc 5/5 | 0 | Counted |
| `bench-supplier-invoice-2026-11-21T15-29-51-018Z.json` | supplier-invoice | claude-haiku-5.5 | raw 4/5, acc 5/5 | 16 | Counted |
| `bench-voucher-2026-11-21T12-18-46-090Z.json` | voucher | claude-opus-5.5 | raw 1/1, grid 1/1, acc 0/1 | 0 | Not counted: superseded by a later run of the same model |
| `bench-voucher-2026-11-21T12-24-33-296Z.json` | voucher | deepseek-v4.1-flash-1017 | raw 0/1, grid 0/1, acc 0/1 | 20 | Not counted: superseded by a later run of the same model |
| `bench-voucher-2026-11-21T12-39-17-150Z.json` | voucher | claude-opus-5.5 | raw 5/5, grid 5/5, acc 5/5 | 0 | Withdrawn: a format hint held the answer |
| `bench-voucher-2026-11-21T13-12-29-359Z.json` | voucher | deepseek-v4.1-flash-1017 | raw 2/5, grid 1/5, acc 4/5 | 44 | Not counted: superseded by a later run of the same model |
| `bench-voucher-2026-11-21T15-04-53-441Z.json` | voucher | claude-sonnet-5.5 | raw 5/5, grid 5/5, acc 5/5 | 0 | Withdrawn: a format hint held the answer |
| `bench-voucher-2026-11-21T15-25-55-426Z.json` | voucher | claude-haiku-5.5 | raw 3/5, grid 2/5, acc 4/5 | 28 | Not counted: superseded by a later run of the same model |
| `bench-voucher-2026-11-21T19-16-46-529Z.json` | voucher | claude-haiku-5.5 | raw 4/5, grid 1/5, acc 5/5 | 0 | Withdrawn: a format hint held the answer |
| `bench-voucher-2026-11-21T19-34-19-809Z.json` | voucher | deepseek-v4.1-flash-1017 | raw 2/5, grid 1/5, acc 5/5 | 8 | Withdrawn: a format hint held the answer |

The rebuilt screens' results above were made with `browser_run_code_unsafe`
available, and most models used it (Opus too, on the dashboards). The next
measurement is without it, so those screens may come out slower or less often
right.

The scripted head-to-head (no model) on the site is from `h2h-2026-11-21T13-45-56-090Z.json`.
