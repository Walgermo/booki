---
"@booki-aui/core": patch
---

Money: store the scale with the amount. An integer of minor units is only exact together with the number of decimals it counts, and ISO 4217 changes a currency's minor unit by amendment. 0.4.0 moved to the ISO list, so amounts saved earlier in currencies whose decimals changed (CLP and 15 others now 0, BHD and 5 others now 3, CLF and UYW 4; before, only JPY and KWD differed from 2) would be read at the wrong scale. Rather than a migration note alone, `@booki-aui/core/money` adds exact helpers, following how established money libraries keep the scale with the amount (a Dinero.js snapshot is `{ amount, currency, scale }`) and how payment APIs keep a legacy representation readable instead of silently reinterpreting it:

- `toScaled(money)` gives `{ amount, currency, scale }` to store; `moneyFromScaled(scaled)` reads it back in the currency's current minor units.
- `rescaleMinor(minor, fromScale, currency)` converts exactly: adding decimals always works, dropping them is refused (`money.rescale-lossy`) unless the dropped digits are zeros, so no rounding happens without you choosing it.
- `legacyMinorDigitsFor(currency)` gives the decimals versions before 0.4.0 used, so an integer saved then without a scale is rescaled once with `rescaleMinor(saved, legacyMinorDigitsFor(currency), currency)`.

See "Store the scale with the amount" in docs/drop-in.md. No floats are involved.
