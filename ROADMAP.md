# Roadmap

Booki is pre-1.0: the API still changes, and nothing is on npm until v1 has run in a real product ([#32](https://github.com/Walgermo/booki/issues/32)). This file is a plan, not a promise. The work itself is tracked in the [issue list](https://github.com/Walgermo/booki/issues), and the [Support section of the README](README.md#support) says what is supported today and what is experimental.

## What v1 needs

- [#27](https://github.com/Walgermo/booki/issues/27) External security review of the server guard: the guard that refuses agent writes should be checked by someone outside the project before v1 is called safe.
- [#29](https://github.com/Walgermo/booki/issues/29) Rate limit on `/api/agent`: the endpoint stays off on booki.dev until it has a real rate limit.
- [#24](https://github.com/Walgermo/booki/issues/24) Agent Contract: the spec is marked a draft, and a conformance suite and a reference implementation are in `@booki/readiness`. Left: a way to run the suite against a live page, and a second, independent implementation.
- [#25](https://github.com/Walgermo/booki/issues/25) Migration guide for one screen, with times from the product pilot: a team should see what moving one existing screen takes, in real figures.
- [#32](https://github.com/Walgermo/booki/issues/32) Publish to npm after v1 has run in a real product: the packages go to npm once a real product has used them.

## After v1

Benchmarks:

- [#12](https://github.com/Walgermo/booki/issues/12) Remeasure the voucher, sales invoice and inbox benchmarks with Haiku and DeepSeek, and put the withdrawn results back on the site.
- [#13](https://github.com/Walgermo/booki/issues/13) Measure Booki against an agent that works through an API or an MCP server. The API baseline is built and tested; the runs and the figures are left.
- [#14](https://github.com/Walgermo/booki/issues/14) Hard benchmark tasks, written before Booki runs them so they are not tuned to it. The five tasks and their checks are written; the runs, and showing where Booki fails, are left.
- [#15](https://github.com/Walgermo/booki/issues/15) Run 30 times per cell, with spread and confidence intervals.
- [#16](https://github.com/Walgermo/booki/issues/16) Publish the full transcripts of the next measurement and invite an outside run.
- [#17](https://github.com/Walgermo/booki/issues/17) Check the rebuilt screens against the real products.

Product:

- [#28](https://github.com/Walgermo/booki/issues/28) WebMCP: record a control's own refusals, not only the ones the bridge sees.
- [#30](https://github.com/Walgermo/booki/issues/30) Decide whether a US memo reference is secret, the way a Norwegian KID is.
- [#31](https://github.com/Walgermo/booki/issues/31) A smaller base stylesheet. The raw size is down by a third; the scope list is still repeated in about 45 rules.

## Not planned

These are out of scope for now:

- ERP connectors. Apps integrate their own ERP ([AGENTS.md](AGENTS.md)).
- Connections to a bank, a tax authority or a document scanner. The host app makes them.
- Intercompany eliminations, consolidation, budgets, payroll and dunning ([README](README.md#not-covered-yet)).

## How to help

Read [CONTRIBUTING.md](CONTRIBUTING.md), pick an open issue, and say in a comment on it that you are taking it before you start.
