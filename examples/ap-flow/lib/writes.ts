"use client";

/**
 * Writes on their way to the server. The controls are controlled: a change
 * shows once the server has answered, so whoever reads the page next (the
 * agent's next snapshot) waits for these first.
 */
const inFlight = new Set<Promise<unknown>>();

let refusals: string[] = [];

export function track<T extends { ok: boolean; message?: string }>(write: Promise<T>): Promise<T> {
  inFlight.add(write);
  void write
    .then((answer) => {
      if (!answer.ok) refusals.push(answer.message ?? "Avvist.");
    })
    .finally(() => inFlight.delete(write));
  return write;
}

/** The server's refusals since the last call, oldest first. */
export function takeRefusals(): string[] {
  const taken = refusals;
  refusals = [];
  return taken;
}

/** Resolves when every write has its answer and React has drawn it. */
export async function settled(): Promise<void> {
  while (inFlight.size > 0) await Promise.allSettled(inFlight);
  await new Promise((resolve) => setTimeout(resolve, 0));
}
