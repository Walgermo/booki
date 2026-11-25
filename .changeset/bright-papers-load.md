---
"@booki-aui/core": patch
"@booki-aui/primitives": patch
"@booki-aui/react": patch
---

Keep the full English message catalogue out of the standalone AmountField bundle by loading only amount, money, and locale messages at startup. The complete English and Norwegian catalogues remain available through the translation API.
