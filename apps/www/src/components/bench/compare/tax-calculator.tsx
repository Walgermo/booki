import { createChange, definePrimitive, usePart, usePrimitive } from "@booki-aui/react";
import { useId, useMemo, useState } from "react";

import { taxOnSalary, TAX_2026, type TaxLines } from "./tax-2026";

/**
 * The tax calculator on Booki, for the side-by-side comparison with
 * Skatteetaten's (benchmarks/agent/compare). The same questions in the same
 * order: marital status and birth year, then the salary; the same 2026 rules
 * (tax-2026.ts, checked against the live calculator). An agent sets the
 * profile and the salary by name and reads the estimate and every line from
 * the snapshot. Amounts on the bridge are øre, as everywhere in Booki; the
 * calculator shows whole kroner.
 */

export const STATUSES = [
  { value: "gift", label: "Gift / registrert partner / meldepliktig samboer" },
  { value: "ugift", label: "Ugift" },
  { value: "separert", label: "Separert" },
  { value: "skilt", label: "Skilt" },
  { value: "enke", label: "Enke" },
  { value: "enkemann", label: "Enkemann" },
] as const;

const PROFILE_FIELDS = ["status", "birthYear"] as const;
const PROFILE_FORMAT = `{ status: ${STATUSES.map((s) => `"${s.value}"`).join(" | ")}, birthYear: 1900–${TAX_2026.year} }`;
/** The rules hold for this person only; others are refused rather than given a wrong number. */
const SUPPORTED = 'Only an unmarried person ("ugift") with a salary and nothing else is worked out here.';

type Estimate = { [K in keyof TaxLines as `${K}Minor`]: number };

type TaxState = {
  year: number;
  status: string;
  birthYear: number | null;
  salaryMinor: number;
  profileFormat: string;
  /** Null until status and birth year are set, as on the real calculator. */
  estimate: Estimate | null;
};

type TaxOptions = {
  status: string;
  birthYear: number | null;
  salaryMinor: number;
  onStatusChange?: (value: string) => void;
  onBirthYearChange?: (value: number | null) => void;
  onSalaryMinorChange?: (value: number) => void;
};

function estimateFor(status: string, birthYear: number | null, salaryMinor: number): Estimate | null {
  if (status !== "ugift" || birthYear === null) return null;
  const lines = taxOnSalary(Math.round(salaryMinor / 100));
  return Object.fromEntries(Object.entries(lines).map(([key, kroner]) => [`${key}Minor`, kroner * 100])) as Estimate;
}

const stateOf = (options: TaxOptions): TaxState => ({
  year: TAX_2026.year,
  status: options.status,
  birthYear: options.birthYear,
  salaryMinor: options.salaryMinor,
  profileFormat: PROFILE_FORMAT,
  estimate: estimateFor(options.status, options.birthYear, options.salaryMinor),
});

const taxCalculator = definePrimitive({
  name: "tax-calculator",
  options: {
    status: "string",
    birthYear: "value",
    salaryMinor: "number",
    onStatusChange: "callback",
    onBirthYearChange: "callback",
    onSalaryMinorChange: "callback",
  },
  controlled: ["year", "status", "birthYear", "salaryMinor", "profileFormat", "estimate"],
  state: stateOf,
  sync: stateOf,
  api: (context) => {
    const change = createChange(context);
    const refuse = (message: string): never => {
      throw new Error(message);
    };
    // Only a real DOM event marks a change as a person's; an agent's extra argument is ignored.
    const personEvent = (event: unknown) => (event instanceof Event ? event : undefined);
    // The estimate follows the inputs, whoever changed them.
    const recompute = () => {
      const { status, birthYear, salaryMinor } = context.store.get();
      context.store.set({ estimate: estimateFor(status, birthYear, salaryMinor) });
    };
    return {
      /** Marital status and birth year, the calculator's first questions. A person's change passes its event. */
      setProfile: (profile: { status?: string; birthYear?: number }, event?: Event): boolean => {
        if (!profile || typeof profile !== "object") refuse(`setProfile takes ${PROFILE_FORMAT}.`);
        const unknown = Object.keys(profile).filter((key) => !(PROFILE_FIELDS as readonly string[]).includes(key));
        if (unknown.length) refuse(`Unknown field ${unknown.join(", ")}. setProfile takes ${PROFILE_FORMAT}.`);
        const { status, birthYear } = profile;
        if (status !== undefined && !STATUSES.some((s) => s.value === status)) {
          refuse(`No status "${status}". Use one of: ${STATUSES.map((s) => s.value).join(", ")}.`);
        }
        if (status !== undefined && status !== "ugift") refuse(SUPPORTED);
        if (
          birthYear !== undefined &&
          (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > TAX_2026.year)
        ) {
          refuse(`Birth year is a whole year, 1900–${TAX_2026.year}; got ${birthYear}.`);
        }
        let ok = true;
        if (status !== undefined)
          ok = change("status", status, { reason: "set-profile", event: personEvent(event) }) && ok;
        if (birthYear !== undefined)
          ok = change("birthYear", birthYear, { reason: "set-profile", event: personEvent(event) }) && ok;
        recompute();
        return ok;
      },
      /** Yearly salary in øre: 650 000 kr is 65000000. A person's change passes its event. */
      setSalary: (minor: number, event?: Event): boolean => {
        if (!Number.isInteger(minor) || minor < 0) {
          refuse(`The salary is øre, a whole number 0 or more (650 000 kr is 65000000); got ${minor}.`);
        }
        const ok = change("salaryMinor", minor, { reason: "set-salary", event: personEvent(event) });
        recompute();
        return ok;
      },
    };
  },
  slots: (slot) => ({ root: slot({ role: "group", attrs: () => ({ "data-slot": "tax-calculator" }) }) }),
  agent: { actions: ["setProfile", "setSalary"] },
});

const kr = (minor: number) => `${new Intl.NumberFormat("nb-NO").format(Math.round(minor / 100))} kr`;

export function BookiTaxCalculator() {
  const [status, setStatus] = useState("");
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [salaryMinor, setSalaryMinor] = useState(0);
  const [salaryText, setSalaryText] = useState("");
  const [birthText, setBirthText] = useState("");
  const ids = { status: useId(), birth: useId(), salary: useId() };

  const options: TaxOptions = {
    status,
    birthYear,
    salaryMinor,
    onStatusChange: setStatus,
    onBirthYearChange: (year) => {
      setBirthYear(year);
      setBirthText(year === null ? "" : String(year));
    },
    onSalaryMinorChange: (minor) => {
      setSalaryMinor(minor);
      setSalaryText(String(Math.round(minor / 100)));
    },
  };
  const handle = usePrimitive(taxCalculator, options);
  const estimate = useMemo(() => estimateFor(status, birthYear, salaryMinor), [status, birthYear, salaryMinor]);

  const lines: [string, keyof Estimate][] = [
    ["Minstefradrag", "minstefradragMinor"],
    ["Alminnelig inntekt", "alminneligInntektMinor"],
    ["Staten, fellesskatt", "fellesskattMinor"],
    ["Kommune og fylke", "kommuneOgFylkeMinor"],
    ["Trinnskatt", "trinnskattMinor"],
    ["Trygdeavgift", "trygdeavgiftMinor"],
  ];

  return usePart(
    handle,
    "root",
    {},
    {
      "aria-label": `Skattekalkulator ${TAX_2026.year}`,
      className: "grid gap-6",
      children: (
        <>
          <header className="grid gap-1">
            <h1 className="text-2xl font-semibold">Beregn skatten din for {TAX_2026.year}</h1>
            <p className="m-0 text-muted-foreground">Ugift, bosatt i Norge hele året, med lønn og ingenting annet.</p>
          </header>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <label htmlFor={ids.status}>Sivilstatus</label>
              <select
                id={ids.status}
                value={status}
                onChange={(event) => handle.api.setProfile({ status: event.target.value }, event.nativeEvent)}
              >
                <option value="" disabled>
                  Velg sivilstatus
                </option>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value} disabled={s.value !== "ugift"}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <label htmlFor={ids.birth}>Fødselsår (åååå)</label>
              <input
                id={ids.birth}
                inputMode="numeric"
                value={birthText}
                onChange={(event) => {
                  setBirthText(event.target.value);
                  if (/^\d{4}$/.test(event.target.value)) {
                    handle.api.setProfile({ birthYear: Number(event.target.value) }, event.nativeEvent);
                  }
                }}
              />
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <label htmlFor={ids.salary}>Lønn i året (kr)</label>
              <input
                id={ids.salary}
                inputMode="numeric"
                className="tabular-nums"
                value={salaryText}
                onChange={(event) => setSalaryText(event.target.value)}
                onBlur={(event) => {
                  const kroner = Number(salaryText.replace(/[\s.]/g, "").replace(",", "."));
                  if (Number.isFinite(kroner) && kroner >= 0)
                    handle.api.setSalary(Math.round(kroner * 100), event.nativeEvent);
                }}
              />
            </div>
          </div>
          <section aria-label="Estimert skatt" className="site-sheet grid gap-3 p-5">
            <p className="m-0 text-sm text-muted-foreground">Estimert skatt for {TAX_2026.year}</p>
            <p className="m-0 text-3xl font-semibold tabular-nums">{estimate ? kr(estimate.estimateMinor) : "–"}</p>
            {estimate ? (
              <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
                {lines.map(([label, key]) => (
                  <div key={key} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="m-0 text-right tabular-nums">{kr(estimate[key])}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="m-0 text-sm text-muted-foreground">Velg sivilstatus og fødselsår for å se estimatet.</p>
            )}
          </section>
        </>
      ),
    },
    "div",
  );
}
