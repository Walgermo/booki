---
"@booki/primitives": patch
"@booki/react": patch
"@booki/web": patch
"@booki/vue": patch
"@booki/svelte": patch
"@booki/solid": patch
---

One rule for payment references in `PaymentReferenceInput` and `PaymentBatch`: a KID always reads `[redacted]` to an agent; a memo or invoice reference does not, unless the app sets the new `secretReference` option. `PaymentBatch` used to hide every reference; in React it now follows the country profile, so a US batch shows its memos to an agent. The primitive's new `referenceKind` option defaults to `"kid"`, so a batch that does not say still hides its references.
