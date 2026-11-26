---
"@booki-aui/primitives": patch
"@booki-aui/react": patch
---

BankReconciliation: a layout of your own built on `BankReconciliationRoot` gets the unmatched bank lines and posts with their payment references again (`unmatchedBankLines`, `unmatchedPosts`), as its types say. The agent's snapshot still reads only the references' tags.
