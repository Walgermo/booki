/**
 * The DOM event behind a person's edit, when a setter was called from a slot
 * handler. An agent's call passes plain values, never an Event, so its change
 * still reports `source: "agent"`.
 */
export function asEvent(value: unknown): Event | undefined {
  return typeof Event !== "undefined" && value instanceof Event ? value : undefined;
}
