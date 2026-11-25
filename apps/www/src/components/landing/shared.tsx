import type { createBookiAgent } from "@booki/react";

/**
 * The hero's one-click prompt. It must work pasted into any coding agent:
 * install the skill if it can, read it if it cannot, do the whole setup,
 * and prove it in the running app.
 */
export const AGENT_PROMPT = `Make this app agent-ready with Booki.

1. Load the skill: run \`npx skills add Walgermo/booki --skill booki\`. If you can't install skills, read https://raw.githubusercontent.com/Walgermo/booki/main/skills/booki/SKILL.md and the catalog it links to.
2. Follow its implementation checklist on this codebase: install the packages (Booki is not on npm yet: the skill packs them from a clone), wrap the root in BookiLocaleProvider and BookiAccessProvider (with our signed-in user), add AgentPresence and AgentCursor, and create one agent bridge in src/agent.ts with createBookiAgent, cursor.wrap(allow) and attachAudit, and offer it to browser agents with registerTools(agent, { allow: "bridge", prefix, audit }) so a person is asked once.
3. Move our money, bank, KID, date, account and voucher inputs to Booki controls, lists to DataTable and dashboard figures to the chart controls. For an amount, code or date field we keep, use useBookiField; for other controls we keep, define a primitive (definePrimitive) and create its parts in our framework.
4. Mark what can't be undone (posting, payments, SCA, deleting) with data-agent-confirm. Approving, signing off, finalizing and releasing stay with people. Run the same writes through @booki/core/server guards in our API, with the agent on its own credential.
5. Prove it in the running app: window.agent.snapshot() lists named actions, one agent.act sets an amount while the cursor shows it and an expect step confirms it took, a marked step waits for a person, and the audit log records the agent. Then run the readiness audit from the Booki clone against the screen (pnpm --dir ../booki readiness <url> --timeout 120000, with --storage-state of a signed-in session if the screen needs a sign-in). Tell me what you changed and anything you left.`;

export const REPO_URL = "https://github.com/Walgermo/booki";

export const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export type LandingAgent = ReturnType<typeof createBookiAgent>;
export type ActResult = { ok: boolean; error?: { message: string } };
