import { formatMoney } from "@booki-aui/core/money";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import { formatPercent } from "./chart-math.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import {
  derive,
  funnelChart,
  type Details,
  type FunnelStep,
  type FunnelStepInput,
} from "@booki-aui/primitives/funnel-chart";

const TAGS = { root: "div", step: "button" } as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof funnelChart, typeof TAGS> = createParts(funnelChart, TAGS);
const FunnelChartRoot: (typeof parts)["Root"] = parts.Root;
const FunnelChartStep: (typeof parts)["Step"] = parts.Step;

const COPY = {
  EN: {
    funnel: "Conversion",
    fromStart: "of the start",
    fromBefore: "from the step before",
    lost: "lost",
    biggest: "Biggest drop",
    table: "Show as table",
    step: "Step",
    count: "Reached",
    conversion: "Step conversion",
    overall: "Overall",
    value: "Value",
    none: "No steps to show yet.",
  },
  NO: {
    funnel: "Konvertering",
    fromStart: "av starten",
    fromBefore: "fra steget før",
    lost: "tapt",
    biggest: "Største frafall",
    table: "Vis som tabell",
    step: "Steg",
    count: "Nådde",
    conversion: "Konvertering fra steget før",
    overall: "Samlet",
    value: "Verdi",
    none: "Ingen steg å vise ennå.",
  },
} as const;

export type FunnelChartProps = {
  steps: FunnelStepInput[];
  /** The currency of `valueMinor`. Defaults to the locale profile's. */
  currency?: string;
  drill?: string | null;
  defaultDrill?: string | null;
  onDrill?: (id: string, details: Details) => void;
  title?: string;
  className?: string;
  "aria-label"?: string;
};

type RootState = { drill: string | null; refusal: string };

/** Composed funnel: a bar per step, narrowing with the records that reached it, its conversion and what was lost. */
function FunnelChart({
  steps,
  currency,
  drill,
  defaultDrill,
  onDrill,
  title,
  className,
  "aria-label": ariaLabel,
}: FunnelChartProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const code = currency ?? profile.currency;
  const locale = profile.locale;
  const count = (n: number) => new Intl.NumberFormat(locale).format(n);
  const pct = (value: number | null) => formatPercent(value, locale);
  const fmt = (minor: number) => formatMoney({ minor, currency: code }, { locale, trimZeroFraction: true });
  return (
    <FunnelChartRoot
      steps={steps}
      currency={code}
      drill={drill}
      defaultDrill={defaultDrill}
      onDrillChange={(next: string | null, details: Details) => {
        if (next !== null) onDrill?.(next, details);
      }}
      className={className}
      aria-label={ariaLabel ?? title ?? copy.funnel}
    >
      {(state: RootState) => {
        const view = derive({ steps, currency: code }, state.drill);
        const top = Math.max(1, view.steps[0]?.count ?? 1);
        const biggest = view.steps.find((step) => step.id === view.biggestDropId);
        return (
          <>
            {title ? <h3 data-slot="funnel-chart-title">{title}</h3> : null}
            {view.steps.length === 0 ? (
              <p data-slot="funnel-chart-empty">{copy.none}</p>
            ) : (
              <ol data-slot="funnel-chart-steps">
                {view.steps.map((step: FunnelStep) => (
                  <li
                    key={step.id}
                    data-slot="funnel-chart-row"
                    data-biggest={step.id === view.biggestDropId ? "" : undefined}
                  >
                    <FunnelChartStep
                      value={step.id}
                      aria-label={`${step.label}: ${count(step.count)}, ${pct(step.overallConversionPct)} ${copy.fromStart}`}
                    >
                      <span data-slot="funnel-chart-label">{step.label}</span>
                      <span data-slot="funnel-chart-track">
                        <span
                          data-slot="funnel-chart-bar"
                          style={{ width: `${Math.max(2, (step.count / top) * 100)}%` }}
                        />
                      </span>
                      <span data-slot="funnel-chart-count">{count(step.count)}</span>
                      <span data-slot="funnel-chart-rate">{pct(step.overallConversionPct)}</span>
                    </FunnelChartStep>
                    {step.stepConversionPct !== null ? (
                      <p data-slot="funnel-chart-between">
                        {pct(step.stepConversionPct)} {copy.fromBefore} · {count(step.dropOff)} {copy.lost}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
            {biggest ? (
              <p data-slot="funnel-chart-summary" role="status">
                {copy.biggest}: {biggest.label} ({count(biggest.dropOff)} {copy.lost})
              </p>
            ) : null}
            {view.issues.length ? (
              <ul data-slot="funnel-chart-issues">
                {view.issues.map((issue) => (
                  <li key={issue}>{say(issue)}</li>
                ))}
              </ul>
            ) : null}
            {view.steps.length ? (
              <details data-slot="funnel-chart-table">
                <summary>{copy.table}</summary>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{copy.step}</th>
                      <th scope="col" data-align="end">
                        {copy.count}
                      </th>
                      <th scope="col" data-align="end">
                        {copy.conversion}
                      </th>
                      <th scope="col" data-align="end">
                        {copy.overall}
                      </th>
                      {view.steps.some((step) => step.valueMinor !== undefined) ? (
                        <th scope="col" data-align="end">
                          {copy.value}
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {view.steps.map((step) => (
                      <tr key={step.id}>
                        <th scope="row">{step.label}</th>
                        <td data-align="end">{count(step.count)}</td>
                        <td data-align="end">{step.stepConversionPct === null ? "" : pct(step.stepConversionPct)}</td>
                        <td data-align="end">{pct(step.overallConversionPct)}</td>
                        {view.steps.some((s) => s.valueMinor !== undefined) ? (
                          <td data-align="end">{step.valueMinor === undefined ? "" : fmt(step.valueMinor)}</td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ) : null}
            {state.refusal ? (
              <p data-slot="funnel-chart-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </FunnelChartRoot>
  );
}

export { FunnelChart, FunnelChartRoot, FunnelChartStep, funnelChart };
export type { FunnelStep, FunnelStepInput };
