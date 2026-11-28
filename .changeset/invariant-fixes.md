---
"@booki-aui/core": patch
"@booki-aui/primitives": patch
---

Fix rules that broke in edge cases, found by checking each invariant in `docs/invariants.md`:

- Amount text: `"1 234 5"` is no longer read as 12345 (every space-separated group must be three digits). Lakh grouping (`12,34,567`, in locales that write it), the Swiss apostrophe (`1'234`) and Arabic-Indic digits now parse, so a formatted amount always parses back.
- `isValidOrgnr`, `isValidEin`, `isValidSeOrgnr` and `isValidDkCvr` refuse an extra digit instead of cutting it off.
- `isValidIban` checks each known country's BBAN shape, so a letter in a Norwegian account number is refused.
- `voucherIssues` lists an amount past the safe range as an issue instead of throwing, and sums digit-only text amounts as numbers.
- A period with a status Booki does not know (`"closed"`) now refuses postings instead of counting as open, and `setPeriodStatus` refuses `"toString"` and the like.
- `addMoney` and `subMoney` treat `"nok"` and `"NOK"` as one currency.
- A person-only confirm sentence that contains `"; "` is still recognised when a step joins it with others.
