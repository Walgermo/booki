---
"@booki-aui/icons": patch
"@booki-aui/react": patch
"@booki-aui/styles": patch
"@booki-aui/core": patch
---

`AgentStatus`: one short line telling a person what an agent is doing, with `state` `"idle" | "working" | "waiting" | "done" | "refused"` and an optional `label` (default words from the en/nb catalogue, such as "agent working" and "waiting for a person"). It is `role="status"` with `aria-live="polite"`, the icon is hidden, and `data-agent-hidden` keeps it out of the agent's snapshot. `@booki-aui/styles` colours it by meaning (signal for working and done, warning while waiting, danger when refused, muted when idle, with ink twins under `data-bk-surface="ink"`) and keeps its width fixed across states. Working turns its badge, waiting breathes, and on a change the icons cross-fade and the check draws in once; nothing plays on first render, and reduced motion holds it still. `Spinner` is the turning ring on its own (`data-slot="spinner"`, aria-hidden), for a busy button.

New icons in an "Agent status" category: `agent-idle`, `agent-working`, `agent-waiting`, `agent-done`, `agent-refused` (the agent cursor with a state badge), `spinner`, `loader-dots` and `stop`. New token `--bk-ink-warning`. Core adds `@booki-aui/core/msg/agent-status` with the five labels in English and Norwegian.
