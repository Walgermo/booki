# Invariants

This file lists the rules Booki's code relies on without stating them or
checking them in one place. Each one comes with an argument for why it holds,
and a test. The tests are seeded property tests, or exhaustive tests where the
domain is small enough. When an invariant did not hold, the counterexample is
listed together with the fix.

The tests are in
[`packages/core/src/invariants.test.ts`](../packages/core/src/invariants.test.ts)
(I1–I16) and
[`packages/primitives/src/invariants.test.ts`](../packages/primitives/src/invariants.test.ts)
(I17–I18). The property tests use a fixed seed, so a failure shows up again on
the next run.

| # | Invariant | Where | Result |
| --- | --- | --- | --- |
| I1 | `money()` holds a safe integer, never `-0` | `core/money.ts` | Proven |
| I2 | `addMoney` / `subMoney` are exact or throw; the currency code is case-blind | `core/money.ts` | Proven; **counterexample fixed** (case) |
| I3 | `sumMinorUnits` is the exact sum | `core/money.ts` | Proven |
| I4 | `minorFromDecimal ∘ decimalFromMinor = id` | `core/money.ts` | Proven |
| I5 | `parseToMinor(formatMoney(m)) = m` in every locale it formats in | `core/money.ts` | **Counterexamples fixed** (en-IN, de-CH, ar-KW) |
| I6 | Space-grouped amounts group every block in threes | `core/money.ts` | **Counterexample fixed** |
| I7 | `parseToMinor` never rounds, never returns an unsafe integer | `core/money.ts` | Proven |
| I8 | KID mod 10 / mod 11: generated is valid, one wrong digit is caught | `core/kid.ts` | Proven |
| I9 | Kontonummer: ≤ 1 check digit, one wrong digit caught, IBAN round-trip | `core/kontonummer.ts` | Proven |
| I10 | An organisation number has exactly its own digit count | `core/organization-number.ts` | **Counterexample fixed** |
| I11 | ABA routing: exactly 1 check digit, one wrong digit caught | `core/routing-number.ts` | Proven |
| I12 | One wrong character in a known country's IBAN is caught | `core/iban.ts` | **Counterexample fixed** |
| I13 | `voucherIssues` never throws; no issues means exactly balanced | `core/voucher.ts` | **Counterexample fixed** |
| I14 | Months and VAT terms each cover every day of the year exactly once | `core/period.ts` | Proven (exhaustive 1900–2100) |
| I15 | Strictest period wins; hard-closed never reopens; unknown status fails closed | `core/period-lock.ts` | Proven; **counterexample fixed** (unknown status) |
| I16 | Every `PERSON_ONLY` permission is refused to any agent | `core/server.ts` | Proven (exhaustive) |
| I17 | A person-only confirm sentence is recognised inside a joined confirm | `primitives/person-only.ts` | **Counterexample fixed** |
| I18 | No agent action approves, signs, finalizes, releases or submits | `primitives/*.ts` | Holds, one documented exception |

## Money and minor units

**I1. `money(minor, c)` returns a safe integer and never `-0`.** `money`
refuses any `minor` that fails `Number.isSafeInteger`, and maps `0` (which
`-0 === 0` also matches) to `+0`. Every other constructor (`fromMajor`,
`parseToMoney`, `moneyFromScaled`, `addMoney`, `subMoney`) ends in `money`.
Test: `I1`.

**I2. `addMoney` and `subMoney` give the exact result, or throw.** Let
`|a|, |b| ≤ 2^53 − 1`. When the exact sum `s` is a safe integer, IEEE-754
addition of two integers whose exact sum is representable has no error, so the
result is `s`. When `|s| ≥ 2^53`, rounding is monotone, so the float result is
also at least `2^53` in magnitude. `money()` then refuses it. Either way, no
wrong total comes out. Test: `I2` checks this against `BigInt` on values biased
toward the edges of the range.

*Counterexample (fixed).* `addMoney({ minor: 1, currency: "nok" }, money(1, "NOK"))`
threw "Currency mismatch: nok vs NOK", although both are NOK. A `Money` written
by hand, or one read from a store, may keep the lower-case code.
`assertSameCurrency` now compares the codes in upper case, and the result keeps
`money()`'s upper-case code.

**I3. `sumMinorUnits` is the exact sum.** It adds in `BigInt` and converts once,
checking the range at the end. Partial sums may leave the safe range and come
back (`[MAX, MAX, −MAX]` sums to `MAX`). Test: `I3`.

**I4. `minorFromDecimal(decimalFromMinor(m, c), c) = m`** for 0, 2 and 3
fraction digits. `decimalFromMinor` writes `|m|` padded to `d + 1` digits, with
the point `d` digits from the right and a sign. `minorFromDecimal` reads the
same digits back in `BigInt` without dropping any. Test: `I4`.

**I5. Formatting and then parsing gives back the same minor units.**
`parseToMinor(formatMoney(m, { locale, accounting }), c, { locale }) = m.minor`.

*Counterexamples (fixed).*
- `en-IN` writes `₹12,34,567.89`, and the parser accepted only groups of three:
  `null`. It now accepts lakh grouping (`12,34,567`) when the locale itself
  groups that way.
- `de-CH` writes `CHF 1'234'567.89`. The apostrophe was not a separator:
  `null`. It is now read as a thousands group, under the same three-digit rule
  as spaces.
- `ar-KW` writes Arabic-Indic digits, the Arabic decimal and group marks, and
  right-to-left marks: `null`. These are now normalised to ASCII first.

Test: `I5` covers the locales of the six profiles plus `fr-FR`, `en-IN`,
`de-CH`, `ja-JP` (0 decimals) and `ar-KW` (3 decimals), with and without
accounting parentheses.

**I6. Spaces group every block in threes.** The rule was meant to be "spaces
only as thousands groups". But the check used a regular expression that
consumed the digits after each space, so the next block was never looked at.

*Counterexample (fixed).* `parseToMinor("1 234 5", "NOK")` returned `1234500`
(12 345,00 kr). The digits are now matched in a lookahead, so every block is
checked, and the result is `null`. Test: `I6`.

**I7. `parseToMinor` never rounds and never returns an unsafe integer.** Text
with more fraction digits than the currency allows returns `null` before
`digitsToMinor` runs, so the half-up branch only runs for `fromMajor`. The
result is checked with `Number.isSafeInteger`. If the exact value is `≥ 2^53`,
`Number()` rounds it to `≥ 2^53`, which fails that check. Test: `I7` compares
the result with the exact `minorFromDecimal`.

## Check digits

**I8. KID.** *mod 10* (Luhn): the weights alternate 2 and 1 from the right, and
doubling followed by a digit sum is a bijection on 0–9. So a single changed
digit changes the sum mod 10, and for any body exactly one check digit fits.
*mod 11*: the weights 2–7 are non-zero mod 11, and 11 is prime, so a single
changed digit changes the sum mod 11. Remainder 10 is written `-`, and
`generateKid` returns `null` for it. Tests: `I8`, with every single-digit
substitution of 300 random KIDs, and every 3-digit body exhaustively for the
"exactly one" claim.

**I9. Kontonummer.** Same mod-11 argument with weights 5,4,3,2,7,6,5,4,3,2. A
body whose check digit would be 10 has none. `kontonummerToIban` computes the
ISO 7064 MOD 97-10 check digits, so `isValidIban` holds by construction, and
`extractNorwegianKontonummer` gives back the input. Test: `I9`.

**I10. An organisation number has exactly its own number of digits.**

*Counterexample (fixed).* `isValidOrgnr("9747606731")` (ten digits) was `true`,
and so was `isValidEin("1234567890")`. Normalisation cut the input to the first
9 digits before checking it, so a typo with an extra digit passed. `isValidOrgnr`,
`isValidEin`, `isValidSeOrgnr` and `isValidDkCvr` now require the exact digit
count. `"NO 974 760 673 MVA"` is still valid, because it has nine digits. The
input field was not affected, since it already passes only the digits it keeps.
Test: `I10`.

**I11. ABA routing number.** The weights are 3, 7, 1, and all are coprime to
10, so one changed digit changes the sum mod 10. The last weight is 1, so
exactly one check digit fits each 8-digit body. An all-zero number is refused.
Test: `I11`.

**I12. IBAN.** MOD 97-10 catches every single-character change *within a kind*.
A letter is first expanded to two digits, though, so replacing a digit with a
letter changes the length of the number being checked, and the check can pass.

*Counterexample (fixed).* `isValidIban("NO6009357U57927")` was `true`. A
Norwegian BBAN is 11 digits, so this cannot be a real account. The country
table now holds each BBAN's shape from the ISO 13616 registry (for example
`NO: \d{11}`, `GB: [A-Z]{4}\d{14}`), not just its length. Test: `I12` tries
every character at every position of 200 valid Norwegian IBANs.

## Vouchers

**I13. `voucherIssues` lists problems and never throws, and no issues means the
voucher balances exactly.** The doc comment says "Empty means postable". Callers
rely on it to return sentences.

*Counterexample (fixed).* A line with `debitMinor: 2 ** 53`, `NaN`, or two lines
of `2 ** 52`, made `voucherIssues` *throw* `money.not-safe-integer` instead of
listing it. `"100"` (which `parseLineAmount` accepts) went through string
concatenation (`0 + "100"` is `"0100"`) and threw as well. The balance is now
checked only once every line is valid on its own (a line that is not is already
listed). It is summed exactly with `sumMinorUnits`, reading digit-only text as
its number, and a total past the safe range becomes an issue. Proof of the
second half: once every line validates, the amounts are non-negative safe
integers, `sumMinorUnits` is exact (I3), and `balanced` is `debit === credit`.
Test: `I13` tries every pair from a set of awkward values, then random vouchers
against a `BigInt` sum.

## Periods and locks

**I14. The 12 months, and the 6 VAT terms, each cover every day of a year
exactly once.** The bounds are built from `Date.UTC(year, month, 0)`, the last
day of the month before. Test: `I14` checks, exhaustively for 1900–2100, that
the first period starts on 1 January, each period starts the day after the
previous one ends, and the last ends on 31 December. Leap years are included.

**I15. The strictest period wins. A hard-closed period never reopens. A status
Booki does not know fails closed.** `periodStatusOn` takes the maximum `RANK`
over the periods that hold the date. `setPeriodStatus` refuses to move away
from `hard-closed`. So once a date is under a hard-closed code, it stays
hard-closed.

*Counterexamples (fixed).*
- `periodStatusOn([{ code: "2025", status: "closed" }], "2025-03-01")` was
  `open`. An unknown status, from a store or a typo, read `RANK[...]` as
  `undefined`, and `undefined > 0` is false. So a posting into a period someone
  meant to close was allowed. It now throws `period.not-a-status`.
- `setPeriodStatus([], "2025", "toString")` was accepted, because `"toString" in
  RANK` is true for any object. It now checks own keys only.

Test: `I15` covers every sequence of four status changes over a year, a month
and a VAT term that share a day (exhaustive). It also tests every pair of
statuses for the "strictest wins" rule, plus the counterexamples.

## Person-only decisions

**I16. Every `PERSON_ONLY` permission is refused to an agent.** In `admit`, the
person-only test comes before roles, `agentOwn` and delegation. It throws
`server.person-only` for `kind: "agent"`, whatever else is true. An actor
whose `kind` is neither `person` nor `agent` is refused before that. Test:
`I16` covers every `PERSON_ONLY` permission × three role sets (one of them
holds every permission) × with and without `onBehalfOf`, with the permission
in `agentOwn`. A person holding the role passes. Every `PERSON_ONLY` entry is
also in `PERMISSIONS`.

**I17. A person-only confirm sentence is recognised inside a joined confirm.**
The bridge trims each `data-agent-confirm`, cuts it at 200 characters, and
joins several with `"; "`. `isPersonOnly` split the joined text on `"; "`.

*Counterexample (fixed).* A registered sentence that holds `"; "` itself, such as
`"Signing off locks the paper; a person signs"`, joined with `"Post the
voucher"`, split into three pieces. None of them was registered, so the step
went to the app's `allow` instead of being refused. Booki's own sentences have
no `"; "`, but `personOnly` is public. Now each registered sentence is looked
for whole, between the join marks. Test: `I17`.

**I18. No agent action approves, signs, finalizes, releases, submits or
decides.** A scan of every `agent: { actions: [...] }` in the primitives
finds no action starting with those verbs (`assert…` and `propose…` only
check or prepare). It has one exception, by design: `SupplierInvoiceInbox`'s
`approveUnderRule`. There the company's own rule (code the app owns, passed as
an option) approves, the record names `rule:<name>` as the approver, and the
action is refused without the rule. It matches the separate
`supplier-invoice.approve-under-rule` permission on the server, which is not in
`PERSON_ONLY`. The test allows exactly that one, by name. Test: `I18`.

## Covered elsewhere

These were checked and already have tests of their own:

- Secrets stay out of the agent log, snapshots and undo:
  `react/src/agent-log.test.tsx`, `agent-snapshot.test.tsx` and
  `history-undo.test.tsx`.
- A person-only step is refused and written to the audit trail with
  `actor: agent:…`: `primitives/src/agent-policy.test.ts` and
  `react/src/agent-bridge-rules.test.tsx`.
- The public contract only grows: `react/src/contract.test.tsx`.
