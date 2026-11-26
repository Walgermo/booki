import { plainDecimal } from "./decimal-digits.js";
import { BookiError } from "./msg.js";

export function validateTaxBasisPoints(rate: number): void {
  if (!Number.isFinite(rate) || rate < 0 || rate > Number.MAX_SAFE_INTEGER) {
    throw new BookiError("invoice.invalid-tax-rate", { value: String(rate) });
  }
}

/** Convert the decimal percentage to basis points without rounding it to a whole basis point. */
export function taxBasisPoints(percent: number): number {
  const [coefficient, exponent = "0"] = String(percent).split("e");
  return Number(`${coefficient}e${Number(exponent) + 2}`);
}

/** Tax on non-negative minor units, rounded once using the rate's decimal representation. */
export function taxMinorAtBasisPoints(netMinor: bigint, basisPoints: number): bigint {
  const { int, frac } = plainDecimal(basisPoints);
  const coefficient = BigInt(int + frac);
  const divisor = 10_000n * 10n ** BigInt(frac.length);
  return (netMinor * coefficient + divisor / 2n) / divisor;
}
