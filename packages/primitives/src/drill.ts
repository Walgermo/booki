import { BookiError, type MessageCode } from "@booki-aui/core/msg";
import { createChange } from "@ui-sdk/core";

type DrillContext = {
  store: { get: () => Record<string, unknown>; set: (patch: Record<string, unknown>) => void };
  options: () => Record<string, unknown>;
};

/**
 * The drill every report chart shares: one item by id, or null to clear it.
 * An unknown id is refused with the ids that exist, from the catalogue.
 */
export function createDrill(context: DrillContext, ids: () => string[], code: MessageCode, refresh: () => void) {
  const change = createChange(context as never) as unknown as (
    key: string,
    value: unknown,
    details: { reason: string; event?: Event },
  ) => boolean;
  return (value: unknown, event?: Event) => {
    if (value === null || value === undefined || value === "") {
      const ok = change("drill", null, { reason: "clear-drill", event });
      if (ok) refresh();
      return ok;
    }
    const id = String(value);
    const listed = ids();
    if (!listed.includes(id)) {
      throw new BookiError(code, {
        id,
        ids: `${listed.slice(0, 20).join(", ") || "none"}${listed.length > 20 ? `, … (${listed.length})` : ""}`,
      });
    }
    const ok = change("drill", id, { reason: "drill", event });
    if (ok) refresh();
    return ok;
  };
}

/** Runs a person's action and shows its refusal in the control. */
export function shownIn<T>(context: DrillContext, run: () => T): T {
  try {
    return run();
  } catch (error) {
    context.store.set({ refusal: (error as Error).message });
    throw error;
  }
}
