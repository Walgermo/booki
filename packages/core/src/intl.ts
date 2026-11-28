/**
 * Shared `Intl` formatters. Making one is far slower than using it (a money
 * column of 100 rows made 100), so each locale and options pair is made once
 * and kept. Formatters are immutable, so sharing one changes no output.
 */

const MAX = 256;

function cached<T>(cache: Map<string, T>, key: string, make: () => T): T {
  let value = cache.get(key);
  if (value === undefined) {
    // A bound, not an LRU: an app uses a handful of locales and currencies.
    if (cache.size >= MAX) cache.clear();
    value = make();
    cache.set(key, value);
  }
  return value;
}

const numbers = new Map<string, Intl.NumberFormat>();
const dates = new Map<string, Intl.DateTimeFormat>();
const collators = new Map<string, Intl.Collator>();

const keyOf = (locale: string | undefined, options: object | undefined) =>
  `${locale ?? ""}|${JSON.stringify(options ?? {})}`;

/** `new Intl.NumberFormat(locale, options)`, made once per locale and options. */
export function numberFormat(locale?: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  return cached(numbers, keyOf(locale, options), () => new Intl.NumberFormat(locale, options));
}

/** `new Intl.DateTimeFormat(locale, options)`, made once per locale and options. */
export function dateTimeFormat(locale?: string, options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return cached(dates, keyOf(locale, options), () => new Intl.DateTimeFormat(locale, options));
}

/** `new Intl.Collator(locale, options)`, made once per locale and options. */
export function collator(locale?: string, options?: Intl.CollatorOptions): Intl.Collator {
  return cached(collators, keyOf(locale, options), () => new Intl.Collator(locale, options));
}
