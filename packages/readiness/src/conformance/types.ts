/**
 * The bridge shape the conformance suite drives. It matches what ui-sdk exposes
 * (`snapshot`, `act`, `subscribe`), so an implementer can run the suite against
 * their own bridge without an adapter. Types only: nothing is imported at runtime.
 */

export type BridgeComponent = {
  ref: string;
  component: string;
  label: string;
  actions: string[];
  [state: string]: unknown;
};

export type ActStep = { ref: string; action: string; args?: unknown[] };

export type ActResult = { ok: boolean; error?: { message: string } };

export type BridgeEvent = {
  source: "agent" | "person";
  ref: string;
  action: string;
  actor: string;
  onBehalfOf?: string;
};

export type AgentBridge = {
  snapshot(): BridgeComponent[] | Promise<BridgeComponent[]>;
  act(input: { steps: ActStep[] }): ActResult | Promise<ActResult>;
  subscribe(listener: (event: BridgeEvent) => void): () => void;
};

export type ServerActor = { kind: "agent" | "person"; id: string; roles: string[] };

export type ServerAnswer = { status: number; code?: string; message?: string };
