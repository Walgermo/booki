import type { createBookiAgent } from "@booki-aui/react";

export const REPO_URL = "https://github.com/Walgermo/booki";

const REPORT_FEEDBACK = `Report Booki bugs, documentation gaps and product feedback at ${REPO_URL}/issues. Search for an existing issue first. For a new bug, include the Booki version, steps to reproduce with sample data, and the expected and actual result. Share the issue link with me. Use private GitHub security reporting for vulnerabilities.`;

/**
 * The hero's one-click prompt. It must work pasted into any coding agent:
 * install the skill if it can, read it if it cannot, do the whole setup,
 * and prove it in the running app.
 */
/**
 * The setup prompt the homepage copies (and /prompt.md): a trial on one screen
 * that explains Booki first and asks before it changes anything, so the first
 * run takes about half an hour and the person knows what is happening.
 */
export const AGENT_PROMPT = `Try Booki on one screen of this app, and keep me in the loop. Booki is a set of UI components (fields, tables, buttons) that people and AI agents can both use: an agent reads the screen as data and acts on its controls by name, and decisions such as approvals stay with a person.

0. Before you change anything, tell me in three sentences what Booki is and what you are about to do. Look through the app briefly, suggest one screen to start with (a form with amounts, dates or an approval fits best), say what will change there and what stays as it is, and wait for my OK.
1. Read the Booki skill. Install it with \`npx skills add Walgermo/booki --skill booki\`, or read https://raw.githubusercontent.com/Walgermo/booki/main/skills/booki/SKILL.md and follow its catalog link.
2. On that one screen, replace the controls that fit with Booki's, using the integration for this app's framework and keeping its look, keyboard behaviour and validation. Connect the agent bridge, the visible cursor and the audit trail as the skill shows. Leave approvals and other decisions to people.
3. Show it working in the running app with test data: have an agent fill in the screen by name, and check that it stops where a person has to decide. Run \`npx @booki-aui/readiness <url>\` on the screen.
4. After each step, tell me in a line what you did and what comes next. Aim to finish in about 30 minutes; if it will take longer, stop and ask. At the end, tell me what changed, what you checked, and which screens would fit next.

${REPORT_FEEDBACK}`;

/** The whole-app prompt, offered beside the trial: it adapts every workflow and takes hours. */
export const AGENT_PROMPT_FULL = `Use Booki to make this app’s existing workflows usable by agents wherever its component library fits. Keep the experience familiar for people and respect the app’s permissions.

1. Read the Booki skill and component catalog. Install the skill with \`npx skills add Walgermo/booki --skill booki\`, or read https://raw.githubusercontent.com/Walgermo/booki/main/skills/booki/SKILL.md and follow its catalog link.
2. Inspect the app’s routes, shared components and main user journeys. For each workflow, identify what an agent should be able to read or do and which steps require a person. Match those interactions to the catalog, including forms, tables, charts and domain-specific controls where relevant.
3. Implement the matches across the app, starting with shared controls. Use the integration for this app’s framework and preserve its styling, keyboard interactions and validation. Where an existing control needs to stay, use a documented Booki field hook or primitive to expose its state and named actions. Keep the work grounded in features the app already has.
4. Follow the skill to connect the agent bridge, visible cursor and audit trail. Use the app’s access rules, redact secrets, and enforce write permissions on the server with a separate agent identity. Route confirmations through the bridge once (registerTools with allow: "bridge"). Leave approvals, sign-offs, finalization and release to people.
5. Verify each adapted workflow in the running app with test data. Use snapshot and query to discover controls, exercise a representative permitted task with act, and check the result. Check refusals, confirmations and audit events where applicable. Run \`npx @booki-aui/readiness <url> --timeout 120000\` on the relevant screens, using --storage-state for signed-in routes. Report which workflows you verified and any gaps or limits you found.

This takes hours. Tell me in a line what you did and what is next after each step, and ask before starting on the next workflow.

${REPORT_FEEDBACK}`;

export const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export type LandingAgent = ReturnType<typeof createBookiAgent>;
export type ActResult = { ok: boolean; error?: { message: string } };
