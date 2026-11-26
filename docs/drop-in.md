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
- Your own control, built with `definePrimitive` ([how](own-controls.md), or for an amount, code, account number or date field you already have, [`useBookiField`](own-controls.md#the-lower-threshold-usebookifield)), takes the same base look with
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

### Store the scale with the amount

An integer of minor units means nothing without the number of decimals it
counts, and that number is not fixed: ISO 4217 changes a currency's minor unit
by amendment (CLF went from 0 to 4 decimals in 2014). Booki follows the current
ISO 4217 list. Before 0.4.0 it counted only JPY (0) and KWD (3) differently from
2, so amounts saved then in BIF, CLP, DJF, GNF, ISK, KMF, KRW, PYG, RWF, UGX,
UYI, VND, VUV, XAF, XOF and XPF (0 decimals now), BHD, IQD, JOD, LYD, OMR and
TND (3) or CLF and UYW (4) count a different number of decimals today.

Keep the scale next to the integer, in the same `{ amount, currency, scale }`
shape a Dinero.js snapshot uses, and read it back exactly:

```ts
import { legacyMinorDigitsFor, money, moneyFromScaled, rescaleMinor, toScaled } from "@booki-aui/core/money"

toScaled(money(15000, "CLP"))                                // { amount: 15000, currency: "CLP", scale: 0 }
moneyFromScaled({ amount: 1500000, currency: "CLP", scale: 2 }) // { minor: 15000, currency: "CLP" }
rescaleMinor(1550, 2, "CLP")                                  // refused: 15.50 has no whole peso

// An integer saved before 0.4.0 without a scale: rescale it once, from the decimals it was saved in.
rescaleMinor(saved, legacyMinorDigitsFor(currency), currency)
```

Adding decimals is always exact. Dropping them is refused unless the dropped
digits are zeros, so a rounding only happens when you choose one. Rescale only
amounts the old version wrote: an integer already in the current ISO minor
units must not be rescaled again, which is why the scale belongs in the record.

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
  own audit columns, or into the audit table you already have (section 5).

`toHttp(verdict)` gives `{ status, body: { ok, code, message } }`; map it to
your own error shape if you have one.

## 5. Recording the agent in the audit trail you already have

Many products write their audit trail with database triggers that take the actor from the
session user. Such a trail has no place for "agent X, acting for person Y": without a change,
an agent's write is saved as the person's own, and the agent shows up only in a server log.
`actorRecord(actor)` gives the things to keep (`actor`, `kind`, `onBehalfOf`, plus `grantId` and
`clientId` when the actor has them). Two ways to keep them:

- **Add columns or a JSON column.** Give the audit table `actor_kind`, `on_behalf_of`, `grant_id`
  and `client_id` columns, or one `actor jsonb` column that holds `actorRecord(actor)` as it is.
  The application writes them itself, in the same write as the change.
- **Set the request's audit context before the write.** Keep the trigger as it is, and let
  the request say who is acting: `set_config` with `is_local = true` sets a value for the current
  transaction only, and the trigger reads it. Nothing in the audit table's shape changes except
  the new columns the trigger fills in. This is the option that keeps the trigger the one writer.

The worked example below is that second option, in Postgres, with generic SQL. Any database with
triggers and session variables works the same way.

```sql
create table audit_event (
  id           bigserial primary key,
  table_name   text        not null,
  row_id       text        not null,
  operation    text        not null,          -- INSERT, UPDATE or DELETE
  actor        text        not null,          -- the person's id, or "agent:bookkeeper"
  actor_kind   text        not null,          -- 'person' or 'agent'
  on_behalf_of text,                          -- the person an agent acted for
  grant_id     text,
  client_id    text,
  old_row      jsonb,
  new_row      jsonb,
  at           timestamptz not null default now()
);

create or replace function record_audit() returns trigger
language plpgsql as $$
begin
  insert into audit_event
    (table_name, row_id, operation, actor, actor_kind, on_behalf_of, grant_id, client_id, old_row, new_row)
  values (
    TG_TABLE_NAME,
    case when TG_OP = 'DELETE' then OLD.id::text else NEW.id::text end,
    TG_OP,
    coalesce(nullif(current_setting('app.actor', true), ''), session_user),
    coalesce(nullif(current_setting('app.actor_kind', true), ''), 'person'),
    nullif(current_setting('app.on_behalf_of', true), ''),
    nullif(current_setting('app.grant_id', true), ''),
    nullif(current_setting('app.client_id', true), ''),
    case when TG_OP <> 'INSERT' then to_jsonb(OLD) end,
    case when TG_OP <> 'DELETE' then to_jsonb(NEW) end
  );
  return null;
end;
$$;

create trigger invoices_audit
  after insert or update or delete on invoices
  for each row execute function record_audit();
```

The write path sets the context in the same transaction as the change. It takes the values from
the actor the request's token resolved to (the `actor` passed to `guard`), never from the request
body. `verdict.actor` is only the label string, so it cannot fill the record:

```ts
// `actor` is the ServerActor your sign-in resolved for this request, the same one passed to guard
const record = actorRecord(actor) // { actor, kind, onBehalfOf?, grantId?, clientId? }

await db.transaction(async (tx) => {
  await tx.query(
    `select set_config('app.actor', $1, true),
            set_config('app.actor_kind', $2, true),
            set_config('app.on_behalf_of', $3, true),
            set_config('app.grant_id', $4, true),
            set_config('app.client_id', $5, true)`,
    [record.actor, record.kind, record.onBehalfOf ?? "", record.grantId ?? "", record.clientId ?? ""],
  )
  await tx.query("update invoices set status = $1 where id = $2", [status, invoiceId])
})
```

Check it with `select actor, actor_kind, on_behalf_of from audit_event where table_name = 'invoices'
order by id desc limit 5`: an agent's write shows `agent:bookkeeper`, `agent`, and the person in
`on_behalf_of`. A write with no context (a migration, a psql session) is recorded as the database
user with `actor_kind = 'person'`, so keep that path away from the agent's token.

The context is only as trustworthy as the code that sets it. Set it only after `guard` has
passed, in the server, and keep the agent's token away from any path that skips the guard.

## 6. Agents you already have

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

## 7. Where to start

Leaf inputs (amount, account, date, organization number, KID) and read-only
views (LedgerTable for a trial balance) drop in first. Workflow controls with
readiness rules (CloseChecklist, AuditWorkpaper sign-off) fit once you decide
which rules warn and which refuse.
