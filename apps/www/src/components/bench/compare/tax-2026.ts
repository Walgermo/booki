/**
 * Tax on a salary for 2026, for an unmarried person living in Norway all
 * year with no other income, deductions or wealth: what Skatteetaten's tax
 * calculator shows for that person. Every figure here was fitted to the live
 * calculator and is checked against it (benchmarks/agent/compare, the
 * fixture tax-2026.json from capture-tax.mjs): the same estimate to the krone
 * for every captured salary.
 *
 * Each line is rounded to the krone, as the calculator shows it, and the
 * estimate is the sum of the rounded lines.
 */

export const TAX_2026 = {
  year: 2026,
  /** Minstefradrag: 46 % of the salary, at most 95 700. */
  minstefradragRate: 0.46,
  minstefradragMax: 95_700,
  /** Personfradrag, from alminnelig inntekt, before the 22 % tax. */
  personfradrag: 114_540,
  /** The 22 % on alminnelig inntekt, split as the calculator shows it. */
  fellesskattRate: 0.0825,
  kommuneOgFylkeRate: 0.1375,
  /** Trinnskatt on the salary: each step's rate from its lower limit. */
  trinnskatt: [
    { from: 226_100, rate: 0.017 },
    { from: 318_300, rate: 0.04 },
    { from: 725_050, rate: 0.137 },
    { from: 980_100, rate: 0.168 },
    { from: 1_467_200, rate: 0.178 },
  ],
  /** Trygdeavgift: 7.6 % of the salary, none up to 99 650, then 25 % of what is above until 7.6 % is less. */
  trygdeavgiftRate: 0.076,
  trygdeavgiftFloor: 99_650,
  trygdeavgiftPhaseIn: 0.25,
} as const;

export type TaxLines = {
  salary: number;
  minstefradrag: number;
  alminneligInntekt: number;
  fellesskatt: number;
  kommuneOgFylke: number;
  trinnskatt: number;
  trygdeavgift: number;
  estimate: number;
};

const krone = (value: number) => Math.floor(value + 0.5);

/** Every line in whole kroner, from a salary in whole kroner. */
export function taxOnSalary(salary: number): TaxLines {
  if (!Number.isInteger(salary) || salary < 0) {
    throw new RangeError(`Salary is whole kroner, 0 or more; got ${salary}.`);
  }
  const p = TAX_2026;
  const minstefradrag = Math.min(krone(salary * p.minstefradragRate), p.minstefradragMax);
  const alminneligInntekt = salary - minstefradrag;
  const taxable = Math.max(0, alminneligInntekt - p.personfradrag);
  const fellesskatt = krone(taxable * p.fellesskattRate);
  const kommuneOgFylke = krone(taxable * p.kommuneOgFylkeRate);
  let trinn = 0;
  p.trinnskatt.forEach((step, index) => {
    const next = p.trinnskatt[index + 1]?.from ?? Number.POSITIVE_INFINITY;
    if (salary > step.from) trinn += (Math.min(salary, next) - step.from) * step.rate;
  });
  const trinnskatt = krone(trinn);
  const trygdeavgift =
    salary <= p.trygdeavgiftFloor
      ? 0
      : krone(Math.min(salary * p.trygdeavgiftRate, (salary - p.trygdeavgiftFloor) * p.trygdeavgiftPhaseIn));
  return {
    salary,
    minstefradrag,
    alminneligInntekt,
    fellesskatt,
    kommuneOgFylke,
    trinnskatt,
    trygdeavgift,
    estimate: fellesskatt + kommuneOgFylke + trinnskatt + trygdeavgift,
  };
}
