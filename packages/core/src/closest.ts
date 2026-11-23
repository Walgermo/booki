/** A list this long or shorter is given whole: a model reads part of a list as all of it. */
export const LISTED_WHOLE = 30;

const fold = (text: string) => text.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");
const wordsIn = (text: string) => fold(text).match(/[\p{L}\p{N}]+/gu) ?? [];

function sharedStart(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

/**
 * The options nearest to what was asked for, best first: by the start of the
 * code ("6801" finds 6800) and by words that begin alike ("office" finds
 * "Office supplies"). The first ones when nothing is near.
 */
export function closest<T>(options: readonly T[], asked: unknown, textOf: (option: T) => string, count: number): T[] {
  const wanted = wordsIn(String(asked ?? "").slice(0, 100));
  if (!wanted.length) return options.slice(0, count);
  const scored = options.map((option, index) => {
    const words = wordsIn(textOf(option));
    let score = 0;
    for (const want of wanted) {
      let best = 0;
      for (const word of words) {
        const start = sharedStart(want, word);
        // Half of the shorter word, or it is a coincidence of letters.
        if (start * 2 >= Math.min(want.length, word.length)) best = Math.max(best, start);
        else if (want.length > 3 && word.includes(want)) best = Math.max(best, want.length - 1);
      }
      score += best;
    }
    return { option, index, score };
  });
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, count)
    .map(({ option }) => option);
}
