# @booki-aui/core

Framework-free accounting rules for Booki: integer money, voucher lines with VAT codes and dimensions, bank reconciliation, and validators for Norwegian and US identifiers (kontonummer, KID, organisasjonsnummer, IBAN, ABA routing, EIN).

```ts
import { parseToMinor, voucherIssues, validateMatch } from "@booki-aui/core"
```

Every amount is an integer in minor units. Every rule either passes or throws an error that names what was wrong and what is allowed, so a person or an agent can repair it.

Country profiles: Norway and the United States are supported; Sweden, Denmark, the United Kingdom and Germany are experimental starter profiles.

Docs and source: https://github.com/Walgermo/booki
