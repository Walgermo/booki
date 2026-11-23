---
"@booki/readiness": patch
"@booki/react": patch
---

The Agent Contract is now marked a draft with one implementation.

- **`@booki/readiness/conformance`**: `runConformance` runs 12 checks of the contract (sections 2 to 7) against any bridge with `snapshot`, `act` and `subscribe`, and `formatConformance` prints them.
- **`@booki/readiness/reference`**: `createReference`, a small implementation of the contract without Booki or ui-sdk.
