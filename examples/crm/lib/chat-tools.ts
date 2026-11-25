/** The tools the page registers for its assistant: Booki's `registerTools` with the prefix `crm`. */
export const TOOL_NAMES = ["crm_act", "crm_query", "crm_snapshot"] as const;

/**
 * The page's own tools out of what the browser listed. The browser can list
 * tools from other pages and frames; only these three are the CRM's, so the
 * model never gets a tool this app did not register.
 */
export function pageTools(definitions: unknown): { name: (typeof TOOL_NAMES)[number] }[] {
  if (!Array.isArray(definitions)) return [];
  const seen = new Set<string>();
  return definitions.filter((tool): tool is { name: (typeof TOOL_NAMES)[number] } => {
    const name = (tool as { name?: unknown } | null)?.name;
    if (typeof name !== "string" || !(TOOL_NAMES as readonly string[]).includes(name) || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}
