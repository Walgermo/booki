---
"@booki-aui/core": patch
"@booki-aui/primitives": patch
"@booki-aui/react": patch
"@booki-aui/styles": patch
"@booki-aui/web": patch
"@booki-aui/vue": patch
"@booki-aui/svelte": patch
"@booki-aui/solid": patch
---

`ChartOfAccounts` ("Kontoplan"): the whole chart of accounts under its classes, NS 4102 classes 1–8 on the NO profile and the common ranges on US. People search by number or name, filter by class and status, fold class headings, and edit name, VAT code and standard account in the row. It shows what is wrong with each account: a duplicate number, a number outside its class, a type its class does not hold, a missing SAF-T mapping on NO. An agent can `find`, `filterClass`, `setVatCode`, `mapStandard` and `propose` new accounts or edits. A proposal waits on screen, and only a person can commit it (`data-person-only`) or activate and deactivate an account (`data-agent-confirm`). Number and type are fixed once an account is `locked`. The class and range rules are in `@booki-aui/core/chart-of-accounts` (`chartSchemeFor`, `accountIssues`, `checkChange`, `applyChanges`), and the new permission is `chart.maintain`. `attachAudit` now names records that have a `number` but no `id`, such as accounts, the way it names records by `id`. The base stylesheet budget goes up 250 bytes to make room for the new component's scope.
