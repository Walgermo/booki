# @booki-aui/readiness

What stops an AI agent on your screen, scored 0–100, with the fix for each
finding.

Point it at any screen of your accounting or auditing product: a URL (signed
in through your browser profile or a saved session) or a saved HTML page. It
opens the page in Chrome, reads it the way a browser agent does (the
accessibility snapshot Playwright gives a model) and the way a bridge agent
does (`window.agent` or WebMCP tools), and reports every place an agent has to
guess, read pixels, see a secret or press an irreversible button unchecked.
Each check enforces a rule of the [Agent Contract](https://github.com/Walgermo/booki/blob/main/spec/agent-contract.md).
The package also has two subpaths: `@booki-aui/readiness/conformance`, a suite that
tests a bridge against the contract in-process ([Conformance suite](#conformance-suite)),
and `@booki-aui/readiness/reference`, a small reference implementation of the contract.

```bash
npx @booki-aui/readiness https://app.example.com/vouchers/new --storage-state session.json --out report.html
```

```
Agent readiness  https://app.example.com/vouchers/new
29/100 not ready  · 11 findings · snapshot ≈ 536 tokens · bridge: none

● Field without an accessible name (§3.1, §4.1) −30  ×6
    A listbox with no name, near "Debet (+)".  main > div > section:nth-of-type(2) > … > a[role="listbox"]
    A textbox with no name, near "Beløp (NOK)".  main > div > section:nth-of-type(2) > … > input
    …
✖ No agent bridge on the page (§2 Bridge, §4.1) −25  ×1
✖ Irreversible button without a gate (§5.2) −10  ×1
    "Opprett" takes an irreversible step with no data-agent-confirm and no person gate.
● Button named by an icon font (§3.1, §4.1) −6  ×3
    A button named "close", the icon's ligature.

Report: /…/report.html
JSON:   /…/report.json
```

## Usage

```bash
npx @booki-aui/readiness <url | file.html> [options]
```

| Option | What it does |
| --- | --- |
| `--storage-state <file>` | A Playwright storage state (cookies and local storage) of a signed-in session. |
| `--profile <dir>` | Run in a browser profile that is signed in already. Close that browser first: Chrome will not share a profile. |
| `--out <file>` | The HTML report. Default `readiness-report.html`. The JSON goes next to it with `.json`. |
| `--json <file>` | The JSON report somewhere else. |
| `--no-report` | Print the summary only. |
| `--browser <channel>` | `chrome` (default), `msedge` or `chromium`. |
| `--executable <path>` | A Chromium-based browser binary, instead of a channel. |
| `--wait <ms>` | Wait this long after the page has loaded (default 500), for screens that render late. |
| `--wait-for <selector>` | Wait until this selector is on the page. |
| `--timeout <ms>` | How long to wait for the page to load, and for `--wait-for`, before giving up (default 30000; `0` for no limit). Raise it for a dev server that compiles a page on its first request. |
| `--headed` | Show the browser. |
| `--fail-under <score>` | Exit with code 1 when the score is below this, for CI. |
| `--snapshot` | Put the full accessibility snapshot in the JSON (the HTML always has it, folded). |

### Signing in

The tool only reads. It opens the page, waits, and inspects it: it never
clicks, types or submits, so it is safe to run against a live company.

- **A saved session.** Sign in once with Playwright's code generator and save
  the session, then pass it:

  ```bash
  npx playwright codegen --save-storage=session.json https://app.example.com
  npx @booki-aui/readiness https://app.example.com/vouchers/new --storage-state session.json
  ```

- **Your browser profile.** Pass a copy of a Chrome profile directory with
  `--profile`. Use a separate profile for this; Chrome locks a profile that is
  open.
- **A saved page.** Save the screen from the browser ("Save page as…, webpage,
  complete") and pass the `.html` file. Scripts that need your server will not
  run, so a bridge set up by the app may be missing.

Because nothing is clicked, a check sees the screen as it loads: a dialog, a
drop-down or a cell editor that opens on click is not inspected. Save or open
those states and check them as their own pages, or open them in your own script
([A form behind a button](#a-form-behind-a-button)).

### From code

```ts
import { audit, toHtml, toJson } from "@booki-aui/readiness"

const report = await audit("https://app.example.com/vouchers/new", { storageState: "session.json" })
console.log(report.score, report.findings.length)
```

`check(page)` runs the checks on a Playwright `Page` you already drive, for a
test suite that signs in and opens dialogs first.

### A form behind a button

The CLI only reads, so it never sees a form that opens on a click: a "New
voucher" dialog, a drawer, the second step of a wizard. Open it yourself with
Playwright, then hand the page to `check`:

```ts
import { chromium } from "playwright-core"
import { check, toConsole } from "@booki-aui/readiness"

const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ storageState: "session.json" })
await page.goto("https://app.example.com/vouchers")
await page.getByRole("button", { name: "New voucher" }).click()
await page.getByRole("dialog").waitFor()

console.log(toConsole(await check(page)))
await browser.close()
```

`check` reads the page as it is when you call it and changes nothing; the
click is your step, not the tool's. It needs no setup in the page.

## Conformance suite

`@booki-aui/readiness/conformance` tests the bridge of a screen against the
[Agent Contract](https://github.com/Walgermo/booki/blob/main/spec/agent-contract.md)
(sections 2 to 7). It is in-process: it calls `act()`, so run it on test data,
never on a live company. The browser audit above only reads a page; this suite
changes state. `@booki-aui/readiness/reference` is a small implementation of the
contract without Booki or ui-sdk, which the suite passes.

```ts
import { runConformance, formatConformance } from '@booki-aui/readiness/conformance'
import { createReference } from '@booki-aui/readiness/reference'

const { bridge, server } = createReference()
const report = await runConformance({ bridge, server, drive: { ref: 'Amount', action: 'setMinor', args: [155000] } })
console.log(formatConformance(report))
expect(report.conforms).toBe(true) // in vitest
```

`bridge` is an object with `snapshot()` (returns the components), `act({ steps })`
(returns `{ ok, error?: { message } }`) and `subscribe(listener)` (returns an
unsubscribe function). With ui-sdk, the bridge is the `agent` from
`createAgent` or `createBookiAgent`, which already has this shape.

The target takes these options, all optional:

| Option | What it is for |
| --- | --- |
| `drive` | One safe, successful step, for the recording check (6.1). |
| `secrets` | Literal test values, such as a test IBAN, that must not appear in the snapshot (3.5). |
| `closedList` | `{ step, valid }`: a bad value and every valid choice its refusal must name (4.3). |
| `personOnly` | Steps only a person may take, which the agent must be refused (5.1). |
| `server` | Your write gate, `(actor, permission) => { status }`, asked for each person-only permission as an agent and once unsigned (5.1, 7.3). |
| `serverActor` | `(permission) => { id, roles }`: an actor your `server` would otherwise let do that permission. The person-only check asks as an agent with these roles and as a person with them (default roles: `[permission]`). |
| `normalizeEvent` | Maps your bridge's event to `{ source, actor }` when it is not that shape already (6.1). |

The checks, with the section each enforces:

| Id | § | Level | What it checks |
| --- | --- | --- | --- |
| `bridge-shape` | 2 | MUST | `snapshot`, `act` and `subscribe` are functions, and `snapshot` returns an array. |
| `snapshot-named` | 3.1 | MUST | Every component has a `ref`, `component`, `label` and string `actions`; labels are unique. |
| `snapshot-values` | 3.2 | MUST | Minor-unit values are integers or `null`; dates (and a date control's `value`) are `YYYY-MM-DD` or `null`, at every level, lists included. |
| `snapshot-secrets` | 3.5 | MUST | The snapshot holds none of the literal `secrets` and no secret pattern (the same finder as the audit; amounts in minor units are not read as account numbers). |
| `act-never-throws` | 4.5 | MUST | `act()` refuses an unknown ref and an unknown action with `ok: false` and a message, without throwing. |
| `amount-minor-only` | 4.2 | MUST | `setMinor` refuses fractions and formatted text. |
| `closed-list` | 4.3 | MUST | A bad value for a closed list is refused, and the refusal names every valid choice. |
| `person-only-not-offered` | 5.1 | MUST | No action named as a person's decision (approve, sign off, …) is offered, and `personOnly` steps are refused. `approveUnderRule`, which runs only under a company rule, is not one. |
| `recording-agent` | 6.1 | MUST | The `drive` step records at least one agent event (one per change), and every one has an actor that starts with `agent:`. |
| `server-person-only` | 5.1 | MUST | The `server` refuses an agent holding the granting roles (`serverActor`) for every person-only permission, and lets a person with the same roles through. A permission whose person is refused too is listed as not verified; when none can be verified, the check skips. |
| `refusal-names-valid` | 12.2 | MUST | A refusal for an unknown ref names the controls that exist, and a refusal for an unknown action names the valid actions. |
| `server-unsigned` | 7.3 | SHOULD | An unsigned request to the `server` gets 401. |

Each check returns `pass`, `fail` or `skip`. A **skip** means the suite had no
input for the check, not that the check passed: no `drive`, `closedList`,
`server` or `secrets` option was given, or the bridge has no components to
probe. `conforms` is `false` only when a MUST check fails. The report lists the
passes, failures and skips, so give every option you can.

The suite does not yet cover the per-language refusals (spec 10.4) or the
ergonomics rules (12) beyond naming the valid choices. Passing it is necessary,
not sufficient.

## Output

- **Console:** the score, then each rule that found something, with up to six
  of its elements, the fix and the Booki control for it.
- **HTML report:** the score and how it was reached, then each finding with
  its element (role and name as the agent sees them, nearby text such as the
  column header, a CSS selector and the element's HTML), why it matters to an
  agent, the fix, and Booki's control for it when one exists. It ends with the
  bridge's controls and actions and the full snapshot a browser agent reads.
- **JSON:** the same data: `score`, `grade`, `measured`, `deductions`,
  `findings`, `metrics`, `bridge`. The raw snapshot is left out unless you pass
  `--snapshot`.

Secrets the tool finds are masked (`86•••••••47`) everywhere in the output,
the snapshot included.

## The checks

Each check names the Agent Contract section it enforces.

| Check | Contract | What it finds | Points (each / most) |
| --- | --- | --- | --- |
| No agent bridge | §2, §4.1 | No `window.agent` with controls and no WebMCP tools of the page's own. The agent can only read the tree and click. | 25 / 25 |
| Bridge control without a name | §3.1 | A control in the bridge's snapshot with no label. | 4 / 12 |
| A person's decision offered to the agent | §5.1 | A bridge action named approve, reject, escalate, release, sign off, finalize, submit, closePeriod, lockPeriod or dispose. | 15 / 30 |
| Field without an accessible name | §3.1, §4.1 | A textbox, searchbox, combobox, listbox, spinbutton, checkbox, radio, switch or slider with no name in the snapshot: the agent can find it only by its position. Inputs no one can reach are skipped: `aria-hidden` or `inert` on the input or an ancestor, `type="hidden"`, not rendered, or visually hidden and out of the tab order (the native input Base UI and Radix render beside a custom select, radio group or checkbox). The two checks below skip them too. | 5 / 30 |
| Field named by a rendering bug | §3.1 | A name such as `[object Object] (Ikke valgt)`, `undefined` or `NaN`. | 5 / 15 |
| Fields that share one name | §3.1, §4.1 | Two or more fields of one role with the same name (one finding per group): the agent has to count. | 2 / 8 |
| Field missing from the bridge | §3.1, §4.1 | On a page whose bridge has a snapshot: a named field a person can use (textbox, searchbox, combobox, listbox, spinbutton, checkbox, radio group, switch, slider) that no bridge entry covers, so an agent on the bridge cannot operate it. A field is covered when its name equals an entry's `label`, or when it sits inside the element of a bridge component: ui-sdk marks a component's root with `data-slot="<component>"` and its other parts with `data-slot="<component>-<part>"`, so the outermost such element of each kind counts. When the page has more of those elements than the snapshot has entries of that kind, only one named by an entry's label counts. A radio is covered by its group's name and reported once, as the group. Disabled fields, fields inside `data-agent-hidden` and the hidden inputs above are skipped, and the check does not run when the snapshot was cut short (a `more` entry). | 5 / 30 |
| Focusable element that is not a control | §3.1, §4.1 | An element with `tabindex` ≥ 0 that the tree calls a cell or plain text, such as a grid cell that opens an editor on click. | 3 / 12 |
| Button without a name | §3.1, §4.1 | A button whose name is empty. One that shows only an icon (an SVG, an image or an icon font) is called an icon-only button, and the report points to `IconButton` from `@booki-aui/react`, whose `label` is required. | 3 / 12 |
| Button named by an icon font | §3.1, §4.1 | A button whose name is an icon ligature (`close`, `content_copy`, `more_vert`, any snake_case word), or any single lowercase word drawn in an icon font. | 2 / 10 |
| Icon at a size it is not drawn for | §3.1 | A Booki icon (`svg[data-icon]` from `@booki-aui/icons`) shown at a size other than 16 or 20 px, where its lines blur. It changes nothing an agent reads. | 1 / 3 |
| Figures only in pixels | §3.3 | A canvas or SVG chart, visible to the agent, whose name, description, fallback content and the table in its figure hold fewer than two numbers. Icons (small, inside a button or link, or fewer than three shapes) and `aria-hidden` charts are skipped. | 10 / 30 |
| Irreversible button without a gate | §5.2 | A button or link that posts, pays, sends, approves, creates, submits, releases or signs (Bokfør, Opprett, Godkjenn, Betal, Send, Attester, Signer, Overfør, Post, Pay, Approve, Submit, Release, Sign off, …) with no `data-agent-confirm` on it or an ancestor, and no `confirm` on its bridge button. | 10 / 20 |
| Secret readable by the agent | §3.5 | A Norwegian account number (mod 11), an IBAN (mod 97), a KID next to the word KID (mod 10 or 11), a US routing number next to "routing" (ABA) or a card number next to "card"/"kort" (Luhn) in the accessibility snapshot or the bridge's snapshot. Only numbers with valid check digits count, so amounts, dates and invoice numbers do not. A value inside `data-agent-secret` on a page with a bridge is redacted by the bridge and not reported. | 8 / 16 |
| Large accessibility snapshot | §1 | The snapshot is over 6,000 tokens (5 points) or over 15,000 (10). | 5 / 10 |

Names, roles and the snapshot come from Playwright's AI-mode aria snapshot,
the text a model gets from browser tools, so a name is exactly what the agent
reads. The size is characters ÷ 4, a rough token count; the agent reads the
snapshot again after most steps, so it is paid for on every step of a task.

## The score

The score starts at 100. Each finding takes off its check's points, and each
check takes off at most its cap, so one kind of problem cannot hide the
others: a page whose only problem is forty unnamed fields scores 70. The score
never goes below 0.

| Score | Grade |
| --- | --- |
| 85–100 | ready |
| 60–84 | partly ready |
| 0–59 | not ready |

A page without a bridge can reach at most 75: the contract's bridge is what
lets an agent act through named actions instead of guessing. A page with a
bridge loses 5 points for each field the bridge leaves out, up to 30, so a
bridge that offers only part of the screen no longer scores 100.

### When nothing was measured

The command line never clicks. A form that appears only after a row is
selected or a button is pressed is not on the page it loads, so the bridge has
no controls and the page has no fields or charts for the other checks to judge.
A page without a bridge but with fields is still scored (and gets
`bridge-missing`). A bridge with no controls on a page that has fields of its
own is scored too: each field is reported as `field-not-on-bridge`, so it is
not a pass. So is a page with no fields or charts where a check still found
something (a focusable cell, an ungated posting button), or that registers
WebMCP tools of its own. When nothing is there to judge, the tool prints `no score` instead of a figure, the HTML report says the same,
and the JSON report has `measured: false`, `grade: "not measured"` and a
`notMeasured` text. `score` stays in the JSON so its shape does not change,
but it is not a pass. With `--fail-under`, an unmeasured page exits with code 1.

Open the form first, then check the open page:

```ts
import { check } from "@booki-aui/readiness"

await page.getByRole("row", { name: "Invoice 1042" }).click()
await page.getByRole("button", { name: "Edit" }).click()
const report = await check(page)
if (!report.measured) throw new Error(report.notMeasured)
```

## Reference scores

Measured on this repository's benchmark pages (`apps/www`, built and served
with `vite preview`), with this version. The replicas are rebuilt by hand from
read-only maps of screens ERP products ship today, with invented data; what
each keeps is listed in [benchmarks/agent/METHOD.md](https://github.com/Walgermo/booki/blob/main/benchmarks/agent/METHOD.md).
The Booki pages do the same tasks with Booki controls and the ui-sdk bridge.

| Page | Score | Grade | Snapshot | What it found |
| --- | ---: | --- | ---: | --- |
| `/bench/voucher-raw` | 29 | not ready | 536 tokens | no bridge; 4 unnamed pickers (`<a role="listbox">`) and 2 unnamed inputs (amount, reference); "Opprett" posts with no gate; 3 icon-font buttons (`calendar_month`, `close`, `content_copy`) |
| `/bench/voucher-grid` | 49 | not ready | 368 tokens | no bridge; 7 focusable table cells that open an editor on click, with no control role; "Lagre og bokfør" ungated; 2 icon-font buttons |
| `/bench/supplier-invoice-raw` | 10 | not ready | 1,051 tokens | no bridge; 6 pickers named "[object Object] …"; 8 unnamed fields (line inputs, a native select, a `button role="combobox"`, checkboxes); 7 icon-font buttons; "Opprett" ungated |
| `/bench/sales-invoice-raw` | 21 | not ready | 852 tokens | no bridge; 4 pickers named "[object Object] …"; 5 unnamed line inputs; 2 icon-font buttons; "Opprett" ungated |
| `/bench/dashboard-raw` | 40 | not ready | 752 tokens | no bridge; 3 SVG charts (`role="application"`, empty title) with no figures in the DOM; an unnamed year select |
| `/bench/dashboard-grid` | 33 | not ready | 1,266 tokens | no bridge; 4 canvas charts with no name or fallback; "Opprett huskelapp" ungated; a `refresh` icon button |
| `/bench/semantic` | 65 | partly ready | 375 tokens | well-labelled HTML: no bridge, and "Betal faktura" ungated |
| `/bench/voucher-acc` | 100 | ready | 309 tokens | — |
| `/bench/supplier-invoice-acc` | 98 | ready | 578 tokens | the two account pickers' inputs are both named "Konto" |
| `/bench/sales-invoice-acc` | 100 | ready | 355 tokens | — |
| `/bench/dashboard-acc` | 100 | ready | 1,839 tokens | — |
| `/bench/acc` | 100 | ready | 273 tokens | — |

To measure them again:

```bash
pnpm build
pnpm --filter @booki-aui/www exec vite preview --port 4317 --strictPort &
pnpm readiness http://localhost:4317/bench/voucher-raw --no-report
```

## What it does not check

- Anything behind a click: dialogs, menus, cell editors, the next step of a
  wizard. Check those states as pages of their own, or call `check(page)` from
  your own Playwright script after opening them.
- The server. Contract §7 (the server re-runs every rule and refuses
  person-only decisions from agents) needs a request against your API, not a
  page.
- Whether the bridge's actions refuse what they should (§4.2–4.5). That needs
  the actions run; this tool never acts.
- Recording (§6). The audit trail is not on the page.

## Development

```bash
pnpm --filter @booki-aui/readiness test       # fixtures of small pages with known problems
pnpm --filter @booki-aui/readiness typecheck
pnpm --filter @booki-aui/readiness build
```

The tests open each fixture in `test/fixtures/` in Chrome and assert that each
check finds exactly the problems put there and nothing else. Chrome must be
installed (or pass a channel or executable in `audit()` options).
