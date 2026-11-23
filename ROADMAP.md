# Roadmap

Booki is pre-1.0: the API still changes, and nothing is on npm until v1 has run in a real product ([#32](https://github.com/Walgermo/booki/issues/32)). This file is a plan, not a promise. The work itself is tracked in the [issue list](https://github.com/Walgermo/booki/issues), and the [Support section of the README](README.md#support) says what is supported today and what is experimental.

## What v1 needs

- [#27](https://github.com/Walgermo/booki/issues/27) External security review of the server guard: the guard that refuses agent writes should be checked by someone outside the project before v1 is called safe.
- [#29](https://github.com/Walgermo/booki/issues/29) Rate limit on `/api/agent`: the endpoint stays off on booki.dev until it has a real rate limit.
- [#24](https://github.com/Walgermo/booki/issues/24) Agent Contract: call it a draft and add a conformance suite, so an implementation can show it follows the contract.
- [#26](https://github.com/Walgermo/booki/issues/26) Test coverage in CI and the README: a measured number, so the coverage claim can be checked.
- [#25](https://github.com/Walgermo/booki/issues/25) Migration guide for one screen, with times from the product pilot: a team should see what moving one existing screen takes, in real figures.
- [#32](https://github.com/Walgermo/booki/issues/32) Publish to npm after v1 has run in a real product: the packages go to npm once a real product has used them.

## After v1

Benchmarks:

- [#12](https://github.com/Walgermo/booki/issues/12) Remeasure the voucher, sales invoice and inbox benchmarks with Haiku and DeepSeek, and put the withdrawn results back on the site.
- [#13](https://github.com/Walgermo/booki/issues/13) Measure Booki against an agent that works through an API or an MCP server.
- [#14](https://github.com/Walgermo/booki/issues/14) Write the hard benchmark tasks before Booki runs them, so they are not tuned to it.
- [#15](https://github.com/Walgermo/booki/issues/15) Run 30 times per cell, with spread and confidence intervals.
- [#16](https://github.com/Walgermo/booki/issues/16) Publish the full transcripts of the next measurement and invite an outside run.
- [#17](https://github.com/Walgermo/booki/issues/17) Check the rebuilt screens against the real products.

Product:

- [#22](https://github.com/Walgermo/booki/issues/22) DocumentSignoff: let a company block sign-off while points are still open.
- [#23](https://github.com/Walgermo/booki/issues/23) `useBookiField`: give an existing field agent actions without replacing it.
- [#28](https://github.com/Walgermo/booki/issues/28) WebMCP: record a control's own refusals, not only the ones the bridge sees.
- [#30](https://github.com/Walgermo/booki/issues/30) Decide whether a US memo reference is secret, the way a Norwegian KID is.
- [#31](https://github.com/Walgermo/booki/issues/31) A smaller base stylesheet.

Site:

- [#18](https://github.com/Walgermo/booki/issues/18) One Norwegian word for each thing, so the site uses the same term everywhere.
- [#19](https://github.com/Walgermo/booki/issues/19) Docs menu links that only redirect: each link should go straight to the page it names.

## Not planned

These are out of scope for now:

- ERP connectors. Apps integrate their own ERP ([AGENTS.md](AGENTS.md)).
- Connections to a bank, a tax authority or a document scanner. The host app makes them.
- Intercompany eliminations, consolidation, budgets, payroll and dunning ([README](README.md#not-covered-yet)).

## How to help

Read [CONTRIBUTING.md](CONTRIBUTING.md), pick an open issue, and say in a comment on it that you are taking it before you start.
