# Booki in an existing Next.js and shadcn/ui app

What it takes to add Booki to a product that already has its own design
system, tables, money format, roles and agents. Start with one screen; the
rest of the app stays as it is.

## 1. Server Components

Every file `@booki-aui/react` ships starts with `"use client"`, so a Server
Component can import and render a Booki control. Pass only serializable props
across the boundary: a function prop (`onOpenVoucher`, `nameOf`, a DataTable
`cell`) needs a small client wrapper of your own.

## 2. Styles that stay inside Booki

`@booki-aui/styles` gives fields, buttons and labels a base look, but only inside
Booki's own components. shadcn/ui and other libraries also set `data-slot` on
their parts, so a plain `[data-slot]` scope would restyle every button in your
app; the build scopes those rules to Booki's component names instead.

```css
/* app/globals.css: Booki over Tailwind's reset and under your utilities, in your colours */
@layer theme, base, booki, components, utilities;
@import "@booki-aui/styles" layer(booki);
@import "@booki-aui/styles/shadcn.css" layer(booki);
@import "tailwindcss";
```

- The first line sets the order. Leave it out and Booki's layer comes before
  Tailwind's `base`, whose reset then strips the padding and borders off every
  field and button.
- `layer(booki)` (or `@booki-aui/styles/layered.css`) puts Booki in a cascade
  layer, so your Tailwind utilities win wherever both apply.
- `shadcn.css` sets each `--bk-*` token from the shadcn variable that does the
  same job (`--background`, `--card`, `--primary`, `--border`, `--radius`,
  `--font-sans`, `--chart-1..5`, ...). Map the rest to your own tokens the same
  way. `--bk-signal` (lime, "an agent did this") has no shadcn counterpart; if
  your product already has a colour for AI, point it there.
- Skip `@booki-aui/styles` entirely and the controls are unstyled: style the
  `data-slot` parts yourself.
- Your own control, built with `definePrimitive` ([how](own-controls.md), or for an amount, code or date field you already have, [`useBookiField`](own-controls.md#the-lower-threshold-usebookifield)), takes the same base look with
  `data-booki` on its root.

## 3. Money arrives as decimal text

Booki counts money in integer minor units. If your database gives `numeric`
as text and you calculate with decimal.js, convert at the edge, exactly:

```ts
import { decimalFromMinor, minorFromDecimal } from "@booki-aui/core/money"

minorFromDecimal("1234.5", "NOK")  // 123450
decimalFromMinor(123450, "NOK")    // "1234.50"
minorFromDecimal("1234.505", "NOK") // refused: a rounding nobody chose
```

Never go through a float (`Math.round(kroner * 100)`). supabase-js and
PostgREST hand a `numeric` column over as a JS number (`125000.5`), not as
text. Then use the number's own digits, which `fromMajor` does:

```ts
import { decimalFromMinor, fromMajor } from "@booki-aui/core/money"

fromMajor(125000.5, "NOK").minor   // 12500050
decimalFromMinor(12500050, "NOK")  // "125000.50", send this back as the column's value
```

A deal or quote in any currency: give `CurrencySelect` the list your product
takes (`currencies={["NOK", "EUR", "USD", "SEK"]}`); the agent's refusal names
them. `AmountField` follows the `currency` you pass it.

`@booki-aui/styles/shadcn.css` makes Booki's fields shadcn's height (`h-9`). If
your inputs are another height, set `--bk-control-h` to it after the import.

For display,
`formatMoney(value, { locale: "nb-NO", zero: "–", accounting: true })` shows
zero as a dash and negatives in parentheses.

## 4. Who may do what, on the server

Run every write through `@booki-aui/core/server` with the actor your sign-in
established. For an audit or consulting product:

- **Roles per engagement.** `actor.scopes` holds roles by engagement id
  (partner on one, quality reviewer on another); pass `scope` in the guard
  context and those count. Fallback rules of your own (no team row means the
  partner decides) stay in your code: compute the roles, then call the guard.
- **People's decisions.** `audit.sign-off`, `audit.review`, `audit.conclude`,
  `audit.eqcr` and `audit.freeze` are refused for `kind: "agent"`, whatever its
  roles. Give agents their own credential so the server can tell: an agent
  that writes as the person it works for cannot be refused.
- **Independence.** The standard duty rules refuse the preparer as reviewer,
  and anyone who prepared, reviewed or concluded as quality reviewer. Pass the
  item's `deeds`.
- **Delegation.** Pass `personOf` and an agent may only do what the person it
  acts for may do, as their roles are now. What the company's rule gives the
  agent itself goes in `agentOwn`.
- **Your own rules.** Refuse with `throw new RuleRefusal(sentence)`. Any other
  error from a rule is rethrown, so a database error never reaches the caller.
- **Reasons.** `minReason: 20` with `reason` refuses a withdrawal without a
  real explanation (422, in the caller's language).
- **Judgment, not gates.** Where the books are a matter of professional
  judgment, use `advise` instead of `guard`: who may act still refuses, and
  what the rule finds (open actions, missing evidence) comes back as
  `warnings` for the person to weigh.
- **The audit line.** `actorRecord(actor)` gives the label, the kind, and for
  an agent whose session, which client and which grant. Write it next to your
  own audit columns.

`toHttp(verdict)` gives `{ status, body: { ok, code, message } }`; map it to
your own error shape if you have one.

## 5. Agents you already have

If your agent drives the DOM today, Booki's bridge replaces guessing: controls
by name, typed actions, `data-agent-confirm` on what needs a person (on the
section or dialog, so typing a confirmation word is covered too), and
`source: "agent"` on every change instead of `event.isTrusted`. Change events
to `agent.subscribe` never carry bank account numbers or payment references.
The bridge is not a security boundary: keep the server guard on every route.

Whose write it is comes from the change (`on…Change(value, { source })`), never from
whether an agent call is running. `window.agent` stays out of production, and WebMCP
(`registerTools`) is off until the server can tell the browser's agent from the person.
`createBookiAgent({ audit })` records refused steps and who confirmed the rest. The
[accounts-payable example](../examples/ap-flow) has the whole recipe.

## 6. Where to start

Leaf inputs (amount, account, date, organization number, KID) and read-only
views (LedgerTable for a trial balance) drop in first. Workflow controls with
readiness rules (CloseChecklist, AuditWorkpaper sign-off) fit once you decide
which rules warn and which refuse.
