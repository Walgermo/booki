# @booki/readiness

## 0.1.0

The first release. It is not on npm: run it from a clone with
`pnpm --dir <booki clone> readiness <url>`.

- Scores how ready a page is for an agent, from 0 to 100, and names what stops one:
  unnamed or shared field names, fields missing from the agent bridge, irreversible
  buttons without `data-agent-confirm`, secrets in the snapshot. It only reads.
- `--storage-state` or `--profile` for a screen behind a sign-in; the report says when
  the page sent the browser on to another page. `--timeout` for a dev server that
  compiles on first load. `check(page)` for a page you open with your own Playwright
  steps.
- The Agent Contract conformance suite and a reference implementation.
