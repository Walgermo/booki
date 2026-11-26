# @booki-aui/icons

## 0.5.1

### Patch Changes

- [#193](https://github.com/Walgermo/booki/pull/193) [`9dd5417`](https://github.com/Walgermo/booki/commit/9dd5417908ed11c3d44a4bd7c4925c1cb1873781) Thanks [@Walgermo](https://github.com/Walgermo)! - Add eight file icons and reuse the text document and spreadsheet glyphs in a ten-family set. Use FileIcon in React or getFileIconName from the file entry point to choose an attachment icon from its extension or MIME type.

## 0.5.0

### Patch Changes

- [#188](https://github.com/Walgermo/booki/pull/188) [`8285000`](https://github.com/Walgermo/booki/commit/82850007aa473f9c3d3aec92a6ec102574557d28) Thanks [@Walgermo](https://github.com/Walgermo)! - Improve eight icons at 16 and 20 px. Separate the forecast dashes from the trend line, connect the steps in the cash-flow waterfall, distinguish the risk matrix and payment batch from similar icons, and make the credit-note minus and stop square easier to see. Align the banknote marks and extend the bank columns to their base.

- [#190](https://github.com/Walgermo/booki/pull/190) [`5379c90`](https://github.com/Walgermo/booki/commit/5379c907f922d1c47e8902181487b117a209e8a9) Thanks [@Walgermo](https://github.com/Walgermo)! - Add thirteen icons for customer due diligence, sanctions and monitoring, account mapping and structured imports, external confirmations, auditor independence, and period rollover. The icon catalog recognizes spaced and hyphenated English and Norwegian search terms.

- [#189](https://github.com/Walgermo/booki/pull/189) [`b17d729`](https://github.com/Walgermo/booki/commit/b17d72939a92b91d794ad69dcb63aad7d8266011) Thanks [@Walgermo](https://github.com/Walgermo)! - AgentStatus now uses the same Booki pointer as the live React and Web cursors. Each of its five states keeps its own badge and localized label. The corresponding exported SVGs use the same centered stem. The waiting label has stronger contrast on Paper. The cursor presses at its tip when work begins and when a live step runs. Reduced motion keeps the pointer still.
  
  Read-only cursor steps inspect the control without a press. Missing targets, cancellation, overlapping steps and detachment clear stale visuals. Cursor narration omits arguments on secret controls. Both renderers honor custom travel times and keep labels above low targets.

## 0.4.4

### Patch Changes

- [#178](https://github.com/Walgermo/booki/pull/178) [`df93b3a`](https://github.com/Walgermo/booki/commit/df93b3a005f81644bc331825ab79938ab8bdcc6c) Thanks [@Walgermo](https://github.com/Walgermo)! - `AgentStatus`: one short line telling a person what an agent is doing, with `state` `"idle" | "working" | "waiting" | "done" | "refused"` and an optional `label` (default words from the en/nb catalogue, such as "agent working" and "waiting for a person"). It is `role="status"` with `aria-live="polite"`, the icon is hidden, and `data-agent-hidden` keeps it out of the agent's snapshot. `@booki-aui/styles` colours it by meaning (signal for working and done, warning while waiting, danger when refused, muted when idle, with ink twins under `data-bk-surface="ink"`) and keeps its width fixed across states. Working turns its badge, waiting breathes, and on a change the icons cross-fade and the check draws in once; nothing plays on first render, and reduced motion holds it still. `Spinner` is the turning ring on its own (`data-slot="spinner"`, aria-hidden), for a busy button.
  
  New icons in an "Agent status" category: `agent-idle`, `agent-working`, `agent-waiting`, `agent-done`, `agent-refused` (the agent cursor with a state badge), `spinner`, `loader-dots` and `stop`. New token `--bk-ink-warning`. Core adds `@booki-aui/core/msg/agent-status` with the five labels in English and Norwegian.

- [#177](https://github.com/Walgermo/booki/pull/177) [`0e56df1`](https://github.com/Walgermo/booki/commit/0e56df1da91a1d8203d0121c23eaaa502f618ddc) Thanks [@Walgermo](https://github.com/Walgermo)! - New `terminal` icon (the old console glyph, with the aliases command, console and shell). `prompt` is now its own drawing: an input bar with AI sparkles above it. The sparkle icons follow the common AI mark: `sparkles` and `prompt` draw one large star with two small ones above, and `chat-sparkle` a large and a small star (the bubble has room for two).

## 0.4.3

### Patch Changes

- [#169](https://github.com/Walgermo/booki/pull/169) [`6a53af6`](https://github.com/Walgermo/booki/commit/6a53af62621d2d2ad1b9dbb176d3d0ad3bfc9fb7) Thanks [@Walgermo](https://github.com/Walgermo)! - New package: `@booki-aui/icons`, 123 duotone icons for accounting, auditing, AI and agent UI. Each icon is a named React component (`BanknoteIcon`), `iconSvg(name)` gives a complete SVG for any framework, and the plain files are at `@booki-aui/icons/svg/<name>.svg`. `COVERAGE.md` lists every icon by theme and what it stands for; browse and search them at booki.dev/docs/icons.
