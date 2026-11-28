import { createMessages } from "./message-render.js";

/** Sentences for an agent's argument that has the wrong shape, on their own, for the same reason. */
export const AGENT_INPUT_EN = {
  "agent.not-text": '{action} takes text, like "12345678903"; got {got}.',
  "agent.unknown-field": '{action}: no field "{field}". Fields: {fields}.',
  "agent.not-an-object": "{action} takes one object, such as {example}.",
} as const;

export const agentInputMessages = /* @__PURE__ */ createMessages(AGENT_INPUT_EN);
