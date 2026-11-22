/**
 * The sentences Booki puts in `data-agent-confirm` on a person's decisions:
 * approving, signing, confirming, sending, agreeing. `data-agent-confirm` on
 * its own asks the app's `allow`, which may say yes under company policy;
 * these must never pass, whatever `allow` says. `createBookiAgent` refuses any
 * step whose confirm sentence is registered here.
 */
const sentences = new Set<string>();

/** Register a person-only sentence and return it, for use as the attribute's value. */
export function personOnly(sentence: string): string {
  sentences.add(sentence);
  return sentence;
}

/** Whether a step's confirm sentence marks a person's decision. */
export function isPersonOnly(sentence: unknown): boolean {
  return typeof sentence === "string" && sentences.has(sentence);
}
