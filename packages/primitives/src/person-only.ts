/**
 * The sentences Booki puts in `data-agent-confirm` on a person's decisions:
 * approving, signing, confirming, sending, agreeing. `data-agent-confirm` on
 * its own asks the app's `allow`, which may say yes under company policy;
 * these must never pass, whatever `allow` says. `createBookiAgent` refuses any
 * step whose confirm sentence is registered here.
 */
const sentences = new Set<string>();

/**
 * Register a person-only sentence and return it, for use as the attribute's value:
 * `data-agent-confirm` on a part the agent's own actions never reach (a keyed
 * row's button), or `data-person-only` on a component's own button, like
 * release or sign off. `data-agent-confirm` on a component's own button would
 * mark every agent action of the component; `data-person-only` only names the
 * decision when an agent presses that button.
 */
export function personOnly(sentence: string): string {
  // The bridge reads a confirm sentence trimmed and cut at 200 characters: register it as it will arrive.
  sentences.add(sentence.trim().slice(0, 200));
  return sentence;
}

/** Whether a step's confirm sentence marks a person's decision. */
export function isPersonOnly(sentence: unknown): boolean {
  if (typeof sentence !== "string") return false;
  // A step that touches parts under several confirm marks gets them joined with "; ".
  return sentences.has(sentence) || sentence.split("; ").some((part) => sentences.has(part));
}
