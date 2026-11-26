/**
 * Plain decimal digits for a finite number, using its shortest round-trip
 * text (so 1.005 reads as "1.005", not 1.00499999…). Expands exponents.
 */
export function plainDecimal(value: number): { negative: boolean; int: string; frac: string } {
  const text = String(Math.abs(value)).toLowerCase();
  const [mantissa = "0", exponentText] = text.split("e");
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const [intPart = "0", fracPart = ""] = mantissa.split(".");
  let digits = intPart + fracPart;
  let point = intPart.length + exponent;
  if (point < 0) {
    digits = "0".repeat(-point) + digits;
    point = 0;
  }
  if (point > digits.length) {
    digits = digits + "0".repeat(point - digits.length);
  }
  return {
    negative: value < 0,
    int: digits.slice(0, point).replace(/^0+(?=\d)/, "") || "0",
    frac: digits.slice(point),
  };
}
