import type { createBookiAgent } from "@booki-aui/react";

/**
 * The hero's one-click prompt. It must work pasted into any coding agent:
 * install the skill if it can, read it if it cannot, do the whole setup,
 * and prove it in the running app.
 */
export const AGENT_PROMPT = `Use Booki to make this app’s existing workflows usable by agents wherever its component library fits. Keep the experience familiar for people and respect the app’s permissions.

1. Read the Booki skill and component catalog. Install the skill with \`npx skills add Walgermo/booki --skill booki\`, or read https://raw.githubusercontent.com/Walgermo/booki/main/skills/booki/SKILL.md and follow its catalog link.
2. Inspect the app’s routes, shared components and main user journeys. For each workflow, identify what an agent should be able to read or do and which steps require a person. Match those interactions to the catalog, including forms, tables, charts and domain-specific controls where relevant.
3. Implement the matches across the app, starting with shared controls. Use the integration for this app’s framework and preserve its styling, keyboard interactions and validation. Where an existing control needs to stay, use a documented Booki field hook or UI SDK primitive to expose its state and named actions. Keep the work grounded in features the app already has.
4. Follow the skill to connect the agent bridge, visible cursor and audit trail. Use the app’s access rules, redact secrets, and enforce write permissions on the server with a separate agent identity. Route confirmations through the bridge once (registerTools with allow: "bridge"). Leave approvals, sign-offs, finalization and release to people.
5. Verify each adapted workflow in the running app with test data. Use snapshot and query to discover controls, exercise a representative permitted task with act, and check the result. Check refusals, confirmations and audit events where applicable. Run \`npx @booki-aui/readiness <url> --timeout 120000\` on the relevant screens, using --storage-state for signed-in routes. Report which workflows you verified and any gaps or limits you found.`;

export const REPO_URL = "https://github.com/Walgermo/booki";

export const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export type LandingAgent = ReturnType<typeof createBookiAgent>;
export type ActResult = { ok: boolean; error?: { message: string } };
