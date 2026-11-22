/**
 * A calendar date as `YYYY-MM-DD` that exists. `Date.parse` rolls an
 * impossible date over ("2026-02-30" becomes 2 March), so a regex and a parse
 * are not enough: the date must read back the same.
 */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}
