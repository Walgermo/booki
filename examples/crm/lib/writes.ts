"use client";

/**
 * Writes on their way to the server. The controls are controlled: a change
 * shows once the server has answered, so whoever reads the page next (the
 * agent's next snapshot) waits for these first.
 */
const inFlight = new Set<Promise<unknown>>();

/** Who sent a write: the agent's steps and a person's clicks, so neither reads the other's refusal as its own. */
export type WriteSource = "agent" | "person";

let refusals: { message: string; source: WriteSource }[] = [];

export function track<T extends { ok: boolean; message?: string }>(
  write: Promise<T>,
  source: WriteSource = "person",
): Promise<T> {
  inFlight.add(write);
  void write
    .then((answer) => {
      if (!answer.ok) refusals.push({ message: answer.message ?? "Avvist.", source });
    })
    .finally(() => inFlight.delete(write));
  return write;
}

/** The server's refusals since the last call, oldest first: all of them, or one source's. */
export function takeRefusals(source?: WriteSource): string[] {
  const taken = refusals.filter((refusal) => !source || refusal.source === source);
  refusals = source ? refusals.filter((refusal) => refusal.source !== source) : [];
  return taken.map((refusal) => refusal.message);
}

/** Resolves when every write has its answer and React has drawn it. */
export async function settled(): Promise<void> {
  while (inFlight.size > 0) await Promise.allSettled(inFlight);
  await new Promise((resolve) => setTimeout(resolve, 0));
}
