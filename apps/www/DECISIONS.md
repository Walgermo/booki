# Docs site design decisions

## The pitch is agent first — 21 Nov 2026

The site shows what Booki does for an agent: fewer tokens, fewer calls, no
fields found by guessing, and changes recorded as the agent's. Rules are not
the headline. "Stopped for a person" read as a brake to buyers who expect
agents to run the books, so no outcome is framed that way. One moment in the
head-to-head chart shows the company's own rule posting the voucher on its
own, as a detail that shows what becomes possible.

The landing page and the ERP teams page name Tripletex and DNB Regnskap for
the head-to-head, always as DOM snapshots of their voucher screens, rebuilt
with invented data: we measured the snapshots, not the products.

## Visual base — Paper and Ink, decided 21 Nov 2026 (later the same day)

Paper for people, ink for what the machine reads, and one lime signal colour
that only ever means "an agent did this". Rules are in `/DESIGN.md`.

- Replaces the Nordic base below: tidy, but anonymous. Nothing in it said that
  two readers use every screen, which is the product's whole point.
- Signal is lime (hue 118), not green: green has to mean "balanced", and
  success stays a deep green at hue 162.
- Rejected: an all-dark site (machine everywhere, nowhere for people) and
  gradients or glows for "future" (they date fast and say nothing).

## Earlier visual base — decided 21 Nov 2026

Nordic base, modelled on a Scandinavian room: chalk walls, birch, wool grey,
charcoal fittings, fjord blue as the one colour. Rules are in `/DESIGN.md`.

- Replaces the black-and-white, pill-shaped look, which read as a copy of
  another product and had no identity of its own.
- Rejected: warm cream with a serif and a terracotta accent (the common
  "AI-designed" look); a green brand colour (green has to mean "balanced").
- The site has one agent bridge (`src/agent.ts`), created before render and
  published over WebMCP, as ui-sdk's guide shows. Pages no longer create
  their own.

## Landing page, third pass — decided 20 Nov 2026

Started over. The page has three jobs: show a token reduction, show
flexibility, show extensibility. Everything is live; text is kept to a line
per section.

- **Token measurement, run on the page.** One booking task (amount, tax code,
  three voucher lines, balance check, pay) runs against a plain semantic HTML
  form with browser-tool moves and against Booki over the ui-sdk bridge. The
  page counts every character the agent reads and writes; tokens are shown as
  characters ÷ 4. Result on this form: 10 calls and 8,020 characters against 2
  calls and 3,157 characters, 61% fewer. (It was 63% before the voucher
  snapshot gained a `postable` flag. Putting the full list of posting issues
  in the snapshot took it down to 50%, so that list is only returned by
  `assertPostable`.)
- **How it is kept honest.** Both sides are scoped to the form only. The
  accessibility tree is printed as compactly as the browser tool used during
  development prints it (rows and cells flattened); a more verbose,
  Playwright-style tree gave 73%. Browser tools are assumed to return the page
  after each action. The code shown for each form is the file that runs
  (imported with `?raw`).
- **Flexible:** one form with live Country and Look switches.
- **Extensible:** a cost-centre control defined on the page with
  `definePrimitive`, shown with its source, its agent snapshot, and two agent
  calls (one accepted, one refused).

Rejected:

- The second pass (semantic vs Booki on safety outcomes, a ui-sdk feature
  table, adoption steps, the Handoff flow): too much text, and no number.
- Quoting ui-sdk's benchmark as the headline: it measures the bridge on a
  settings screen, not Booki on accounting work.

## Landing page, second pass — decided 20 Nov 2026

The first version explained the rules but not why anyone would want the
library. The audience is teams that ship accounting software (ERP vendors), and
the page has to make the gap obvious in one look.

- **Lead with the comparison.** One invoice form built twice: plain semantic
  HTML, and Booki on ui-sdk. Five agent requests run against both at once.
  The left side uses only what a browser-tool agent can do (read, type,
  click); the right side uses the ui-sdk bridge. Both outcomes are real.
- **The five requests** are the ones where the difference is structural, not a
  matter of extra validation code: read the page, set an amount, use a tax code
  that does not exist, read the bank account, pay.
- **Headline:** "Agents are already using your ERP. Through the DOM."
- **Then** the ui-sdk bridge mapped call by call to what Booki does with it,
  three adoption steps for an ERP team, and the Handoff flow as the closing
  section.
- **No size or speed claim of our own.** For this small form the typed
  snapshot is longer than the accessibility tree (about 1,100 vs 280
  characters). ui-sdk's published benchmark is cited as theirs, with a link.

Rejected:

- Handoff as the hero: it shows the happy path but never shows what is wrong
  with the status quo, so it does not answer "why do I need this".
- The break-it console as its own section: the comparison covers the same
  refusals and shows the alternative next to them.
- A code-only before/after: without running both forms it reads as a claim.

## Landing page — decided 20 Nov 2026 from `/proto/landing`

- **Hero: Handoff.** Headline "The agent drafts. A person posts." Two columns
  (Agent, Person) over the live voucher. "Run the agent" sends real actions; the
  agent's attempt to press "Post voucher" is refused, and the visitor posts it.
- **Second section: the break-it console** (from the Proof variant). Six agent
  actions, five hostile, sent to live controls. The log shows the request and
  the library's own answer.
- **Rest of the site follows Proof:** show what the library actually answers,
  from live controls, instead of describing it.
- Both sections share one `createBookiAgent` with no `allow`, so every
  confirm-marked step is refused. The two vouchers have different labels
  ("Draft journal", "Voucher lines") so agent refs stay unambiguous.
- Content is deliberately the awkward case: $12,345,678.90 amounts and a long
  payee name.

Rejected:

- **Current** (metrics-led hero): never says what the library guarantees, and
  the 4.2× / 2.4× / 1.7× / 3.2× figures rest on one internal run.
- **Proof as the hero**: the console is the busiest thing on the site; as the
  first screen it asks the visitor to work before they know what they are
  looking at. Kept as the second section.
- **Spec** (text-first spec sheet): accurate but has no moment of surprise. Its
  six-rule contract table is the right content for the docs introduction.

Removed with the old hero: the WebGPU backdrop (`vgpu`, `@vgpu/wgsl`, the WGSL
shader), the token-comparison strip, the hero playground and the staggered
intro animation.
