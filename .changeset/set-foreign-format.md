---
"@booki/core": patch
"@booki/primitives": patch
"@booki/react": patch
---

`VoucherComposer`'s `setForeign` is easier for an agent to call right the first time. The snapshot has a new `foreignFormat` hint that says the argument order and the units (the amount in minor units, the rate in millionths). The three values may also come as one object, `setForeign(lineId, { currency, amountMinor, rateScaled })`. A wrong value is refused with which one it is, its unit and the whole call written out, in English and Norwegian, where it used to say only "got NaN".
