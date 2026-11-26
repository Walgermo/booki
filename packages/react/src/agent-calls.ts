/**
 * What an agent made with `createBookiAgent` is doing, call by call, for
 * `AgentLog`. Internal: not a package entry. `createBookiAgent` reports each
 * `act` call when it starts, when a step waits for a person's answer, and
 * when it ends with the bridge's result.
 */

export type AgentCallStep = { ref: string; action: string; args?: unknown[] };

export type AgentCallResult = {
  ok: boolean;
  steps?: unknown[];
  error?: { step: number; message: string };
};

export type AgentCallEvent =
  | { type: "start"; id: number; steps: AgentCallStep[] }
  /** A step marked `data-agent-confirm` is waiting for the app's `allow` (a person). `ref` is the control's ref. */
  | { type: "waiting"; id: number; ref: string; confirm: string }
  | { type: "end"; id: number; result: AgentCallResult };

type Listener = (event: AgentCallEvent) => void;

const listeners = new WeakMap<object, Set<Listener>>();

/** Agents that report their calls: every agent `createBookiAgent` made. */
const reporting = new WeakSet<object>();

let sequence = 0;

export function nextCallId(): number {
  sequence += 1;
  return sequence;
}

export function reportsCalls(agent: object): boolean {
  return reporting.has(agent);
}

export function markReporting(agent: object): void {
  reporting.add(agent);
}

export function emitCall(agent: object, event: AgentCallEvent): void {
  const set = listeners.get(agent);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch {
      /* A log that throws never stops the agent's call. */
    }
  }
}

export function watchCalls(agent: object, listener: Listener): () => void {
  let set = listeners.get(agent);
  if (!set) {
    set = new Set();
    listeners.set(agent, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}
