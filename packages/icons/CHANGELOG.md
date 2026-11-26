# @booki-aui/icons

## 0.4.4

### Patch Changes

- [#178](https://github.com/Walgermo/booki/pull/178) [`df93b3a`](https://github.com/Walgermo/booki/commit/df93b3a005f81644bc331825ab79938ab8bdcc6c) Thanks [@Walgermo](https://github.com/Walgermo)! - `AgentStatus`: one short line telling a person what an agent is doing, with `state` `"idle" | "working" | "waiting" | "done" | "refused"` and an optional `label` (default words from the en/nb catalogue, such as "agent working" and "waiting for a person"). It is `role="status"` with `aria-live="polite"`, the icon is hidden, and `data-agent-hidden` keeps it out of the agent's snapshot. `@booki-aui/styles` colours it by meaning (signal for working and done, warning while waiting, danger when refused, muted when idle, with ink twins under `data-bk-surface="ink"`) and keeps its width fixed across states. Working turns its badge, waiting breathes, and on a change the icons cross-fade and the check draws in once; nothing plays on first render, and reduced motion holds it still. `Spinner` is the turning ring on its own (`data-slot="spinner"`, aria-hidden), for a busy button.
  
  New icons in an "Agent status" category: `agent-idle`, `agent-working`, `agent-waiting`, `agent-done`, `agent-refused` (the agent cursor with a state badge), `spinner`, `loader-dots` and `stop`. New token `--bk-ink-warning`. Core adds `@booki-aui/core/msg/agent-status` with the five labels in English and Norwegian.

- [#177](https://github.com/Walgermo/booki/pull/177) [`0e56df1`](https://github.com/Walgermo/booki/commit/0e56df1da91a1d8203d0121c23eaaa502f618ddc) Thanks [@Walgermo](https://github.com/Walgermo)! - New `terminal` icon (the old console glyph, with the aliases command, console and shell). `prompt` is now its own drawing: an input bar with AI sparkles above it. The sparkle icons follow the common AI mark: `sparkles` and `prompt` draw one large star with two small ones above, and `chat-sparkle` a large and a small star (the bubble has room for two).

## 0.4.3

### Patch Changes

- [#169](https://github.com/Walgermo/booki/pull/169) [`6a53af6`](https://github.com/Walgermo/booki/commit/6a53af62621d2d2ad1b9dbb176d3d0ad3bfc9fb7) Thanks [@Walgermo](https://github.com/Walgermo)! - New package: `@booki-aui/icons`, 123 duotone icons for accounting, auditing, AI and agent UI. Each icon is a named React component (`BanknoteIcon`), `iconSvg(name)` gives a complete SVG for any framework, and the plain files are at `@booki-aui/icons/svg/<name>.svg`. `COVERAGE.md` lists every icon by theme and what it stands for; browse and search them at booki.dev/docs/icons.
