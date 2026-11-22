/**
 * What a control's `on…Change` gets after the new value: why it changed and
 * from where. `source === "agent"` is the agent's change, and anything else a
 * person's: send the write with that credential. Read it from the change, not
 * from whether an agent call is running: a person can click while the agent's
 * step waits for an answer.
 */
export type BookiChangeDetails = { reason: string; source?: string; cancel?: () => void };
