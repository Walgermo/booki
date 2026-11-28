import { decimalFromMinor, minorDigitsFor } from "@booki-aui/core/money";
import { agentInputMessages } from "@booki-aui/core/msg/agent-input";
import { dispatch } from "@ui-sdk/core";

/**
 * Checks an object argument of an agent action against the fields it takes.
 * An unknown field is refused with the list of the ones that exist, so the
 * agent's next try is right; a missing object is refused with an example.
 */
export function checkFields(
  action: string,
  input: unknown,
  fields: readonly string[],
  example: string,
): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw agentInputMessages.error("agent.not-an-object", { action, example });
  }
  for (const key of Object.keys(input)) {
    if (!fields.includes(key)) {
      throw agentInputMessages.error("agent.unknown-field", { action, field: key, fields: fields.join(", ") });
    }
  }
  return input as Record<string, unknown>;
}

/**
 * The format hint every list control with a query carries in its snapshot:
 * what setSort and setFilter take, and that pages count from 1.
 */
export const QUERY_FORMAT = 'setSort(column, "asc"|"desc"); setFilter(column, text); setPage(1) is the first page';

export { asEvent } from "./as-event.js";

/**
 * The key of a person-only button on one record, such as "F-1#confirm". ui-sdk
 * asks a person for an agent step on a key whose part carries
 * `data-agent-confirm`, so the button gets a key of its own: the mark guards
 * the button without stopping an agent's actions on the record itself.
 */
/** A text argument from the agent: a string or a number, never an object read as "[object Object]". */
export function textOf(raw: unknown, action: string): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw agentInputMessages.error("agent.not-text", { action, got: Array.isArray(raw) ? "a list" : typeof raw });
  }
  return String(raw);
}

export const buttonKey = (id: string, verb: string) => `${id}#${verb}`;

/** The record id in a button key; a bare id is taken as it is. */
export function recordOf(key: unknown): string {
  const text = String(key);
  const at = text.lastIndexOf("#");
  return at < 0 ? text : text.slice(0, at);
}

type SecretContext = {
  options: () => Record<string, unknown>;
  store: { get: () => Record<string, unknown>; set: (patch: Record<string, unknown>) => void };
};

/**
 * Commit a value that carries secrets (account numbers, KID) without handing
 * them to the agent bridge. ui-sdk reports every change to `agent.subscribe`
 * with its full value unless the whole component is secret, so the change is
 * reported on `<key>Shown`, a copy with the secrets taken out. The owner still
 * hears the full value on `on<Key>Change`, with details, and may cancel it.
 * Returns false when nothing changed or the owner canceled.
 */
export function commitSecret<T>(
  context: SecretContext,
  change: (key: string, value: unknown, details: { reason: string; event?: Event }) => boolean,
  key: string,
  next: T,
  shown: unknown,
  details: { reason: string; event?: Event },
): boolean {
  if (Object.is(context.store.get()[key], next)) return false;
  const callback = `on${key[0]!.toUpperCase()}${key.slice(1)}Change` as const;
  if (dispatch(context as never, callback, next, details)) return false;
  change(`${key}Shown`, shown, details);
  // A controlled value waits for the owner to pass it back.
  if (context.options()[key] === undefined) context.store.set({ [key]: next });
  return true;
}

/**
 * Minor units as the text a person edits, at the currency's own number of
 * decimals (none for JPY or CLP, three for BHD), so typing it back stores the
 * same amount. Exact: no float on the way. A code with no ISO minor unit shows
 * two decimals, as before.
 */
export function minorInputText(
  minor: number,
  currency: string | undefined,
  locale: string,
  grouping: boolean = true,
): string {
  let digits = 2;
  let exact: string = String(minor / 100);
  try {
    digits = minorDigitsFor(currency ?? "USD");
    exact = decimalFromMinor(minor, currency ?? "USD");
  } catch {
    // An unknown code: keep the two-decimal reading.
  }
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: grouping,
  }).format(exact as unknown as number);
}

/** Keep the native form gate in sync for both typed input and agent changes. */
export function bindInputValidity<S extends { disabled: boolean; readOnly: boolean }>(message: (state: S) => string) {
  return (el: Element, { store }: { store: { get(): S; subscribe(listener: () => void): () => void } }) => {
    const input = el as HTMLInputElement;
    const sync = () => {
      const state = store.get();
      input.setCustomValidity(state.disabled || state.readOnly ? "" : message(state));
    };
    sync();
    const unsubscribe = store.subscribe(sync);
    return () => {
      unsubscribe();
      input.setCustomValidity("");
    };
  };
}
