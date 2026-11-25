# Security

Booki handles money, bank details and who may approve what, so a flaw can matter
to the people who rely on it.

## Reporting

Report a vulnerability privately through GitHub: **Security → Report a
vulnerability** on this repository. Please do not open a public issue.

Include what an attacker (or an agent) can do, the steps, and the affected
package.

## In scope

- An agent making a decision that is a person's (approve, sign off, release, confirm).
- Secrets reaching an agent: bank accounts, IBANs, KIDs and anything marked `data-agent-secret`.
- The server guard (`@booki-aui/core/server`) letting a write through that it should refuse.
- Money arithmetic that loses or invents minor units.

Booki is pre-1.0: only the latest release on npm (`@booki-aui/*`) and the `main` branch are supported.
