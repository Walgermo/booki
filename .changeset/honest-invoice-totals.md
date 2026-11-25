---
"@booki-aui/core": minor
---

Require credit notes to use the original invoice's currency. If an issued credit note uses a different currency, correct that ledger record before calculating the remaining credit or finalizing another credit note. Invoice calculations now refuse amounts outside the safe integer range.

Money conversions use the published ISO 4217 minor unit, including zero decimals for CLP and three for BHD. For codes without a defined minor unit in the current list, conversion and formatting throw `money.no-minor-unit` and typed amount parsing returns `null`.
