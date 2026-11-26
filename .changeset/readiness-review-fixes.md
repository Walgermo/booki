---
"@booki-aui/readiness": patch
---

The audit and the conformance suite judge fewer things wrong:

- A WebMCP snapshot tool that answers in plain text, not a list of controls, is no longer read as an empty list, so the page's fields are not each counted missing from it.
- A read-only field (native `readOnly` on a text input or textarea, or inside `aria-readonly="true"`) is not counted as missing from the bridge: no one can change it.
- A page with no fields or charts is measured when something else was found (a focusable cell, an ungated posting button) or when it registers WebMCP tools of its own, so `--fail-under` judges its score instead of "no score".
- A WebMCP tool registered again with the same object and a new signal stays when the older signal aborts.
- `approveUnderRule`, a canonical agent action, is not reported as a person-only action.
- `server-person-only` asks as an agent that holds the roles granting the permission, and checks that a person with the same roles is let through; a new `serverActor` option gives those roles (default `[permission]`). A permission it cannot verify is reported as such, not passed.
- `snapshot-secrets` no longer reads an amount in minor units as a bank account number; `snapshot-values` checks nested lists (a voucher's lines) and a date control's `value`; `recording-agent` accepts one attributed event per change.
