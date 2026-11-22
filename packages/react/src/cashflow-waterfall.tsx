import { formatMoney, money } from "@booki/core/money";
import { createParts } from "@ui-sdk/react/primitive";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { barPath, linearScale, observeWidth, type WaterfallStep } from "./chart-math.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { type Details, type CashflowStep, derive, cashflowWaterfall } from "@booki/primitives/cashflow-waterfall";

export type { WaterfallStep };
const parts = createParts(cashflowWaterfall, { root: "div", step: "button" });
const CashflowWaterfallRoot = parts.Root;
const CashflowWaterfallStep = parts.Step;

const COPY = {
  EN: {
    cashflow: "Cash flow",
    opening: "Opening balance",
    closing: "Closing balance",
    in: "In",
    out: "Out",
    net: "Net",
    table: "Show as table",
    item: "Item",
    amount: "Amount",
    balance: "Balance",
    reconciles: "Opening plus the movements equals the closing balance.",
    differs: (computed: string, closing: string, difference: string) =>
      `Does not reconcile: opening plus the movements is ${computed}, the closing balance is ${closing}. Difference ${difference}.`,
    noSteps: "No movements in the period.",
  },
  NO: {
    cashflow: "Kontantstrøm",
    opening: "Inngående saldo",
    closing: "Utgående saldo",
    in: "Inn",
    out: "Ut",
    net: "Netto",
    table: "Vis som tabell",
    item: "Post",
    amount: "Beløp",
    balance: "Saldo",
    reconciles: "Inngående saldo pluss bevegelsene er lik utgående saldo.",
    differs: (computed: string, closing: string, difference: string) =>
      `Stemmer ikke: inngående saldo pluss bevegelsene er ${computed}, utgående saldo er ${closing}. Differanse ${difference}.`,
    noSteps: "Ingen bevegelser i perioden.",
  },
} as const;

export type CashflowWaterfallProps = {
  openingMinor: number;
  /** The closing balance as booked; checked against opening plus the steps. */
  closingMinor?: number;
  steps: CashflowStep[];
  /** Defaults to the locale profile's currency. */
  currency?: string;
  drill?: string | null;
  defaultDrill?: string | null;
  /** A step was drilled into, by a person's click or an agent's `drill`. */
  onDrill?: (id: string, details: Details) => void;
  title?: string;
  className?: string;
  "aria-label"?: string;
};

type RootState = { drill: string | null; reconciles: boolean; refusal: string };

const ROW = 44;
const BAR = 14;

/**
 * Composed waterfall: the opening balance, one floating bar per movement
 * (cash in in the success colour, cash out in the danger colour), the
 * closing balance, a line saying whether it reconciles, a tooltip and a table.
 */
function CashflowWaterfall({
  openingMinor,
  closingMinor,
  steps,
  currency,
  drill,
  defaultDrill,
  onDrill,
  title,
  className,
  "aria-label": ariaLabel,
}: CashflowWaterfallProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const code = currency ?? profile.currency;
  const locale = profile.locale;
  const fmt = (minor: number) => formatMoney(money(minor, code), { locale });
  const signed = (minor: number) => (minor > 0 ? `+${fmt(minor)}` : fmt(minor));
  const name = title ?? ariaLabel ?? copy.cashflow;
  const id = useId();
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  useEffect(() => observeWidth(frame.current, setWidth), []);

  return (
    <CashflowWaterfallRoot
      openingMinor={openingMinor}
      closingMinor={closingMinor}
      steps={steps}
      currency={code}
      drill={drill}
      defaultDrill={defaultDrill}
      onDrillChange={(next: string | null, details: Details) => {
        if (next !== null) onDrill?.(next, details);
      }}
      className={className}
      aria-label={name}
    >
      {(state: RootState) => {
        const view = derive({ openingMinor, closingMinor, steps, currency: code }, state.drill);
        const all = [
          view.openingMinor,
          view.closingMinor,
          view.computedClosingMinor,
          ...view.steps.flatMap((step) => [step.startMinor, step.endMinor]),
        ];
        const x = linearScale(
          [Math.min(0, ...all), Math.max(0, ...all) === Math.min(0, ...all) ? 1 : Math.max(0, ...all)],
          [0, width],
        );
        // Rows: opening, each step, closing.
        const count = view.steps.length + 2;
        const height = count * ROW;
        const active = hover ?? focusIndex;
        const drilledIndex = state.drill ? view.steps.findIndex((step) => step.id === state.drill) : -1;
        const tabStop = drilledIndex >= 0 ? drilledIndex : 0;
        const barY = (row: number) => row * ROW + 24;
        const total = (row: number, label: string, value: number) => (
          <g key={label} data-slot="cashflow-waterfall-row" data-kind="balance">
            <text x={0} y={row * ROW + 14} data-slot="cashflow-waterfall-label">
              {label}
            </text>
            <text x={width} y={row * ROW + 14} textAnchor="end" data-slot="cashflow-waterfall-value">
              {fmt(value)}
            </text>
            <path
              data-slot="cashflow-waterfall-bar"
              data-kind="balance"
              d={barPath(x(0), barY(row), x(value) - x(0), BAR)}
            />
          </g>
        );
        const describe =
          `${copy.opening} ${fmt(view.openingMinor)}. ` +
          view.steps.map((step) => `${step.label} ${signed(step.amountMinor)}`).join(", ") +
          `. ${copy.closing} ${fmt(view.closingMinor)}. ` +
          (view.reconciles
            ? copy.reconciles
            : copy.differs(fmt(view.computedClosingMinor), fmt(view.closingMinor), signed(view.differenceMinor)));
        const onKeys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
          const last = view.steps.length - 1;
          const keys: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
          const current = focusIndex ?? tabStop;
          let next: number | null = null;
          if (event.key in keys) next = Math.min(last, Math.max(0, current + keys[event.key]!));
          if (event.key === "Home") next = 0;
          if (event.key === "End") next = last;
          if (next === null) return;
          event.preventDefault();
          event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
        };
        const tipStep = active === null ? null : (view.steps[active] ?? null);

        return (
          <>
            {title ? <h3 data-slot="cashflow-waterfall-title">{title}</h3> : null}
            <p data-slot="cashflow-waterfall-summary">
              <span>{copy.in}</span>{" "}
              <strong data-slot="cashflow-waterfall-figure" data-direction="in">
                {signed(view.inflowMinor)}
              </strong>
              <span> · {copy.out}</span>{" "}
              <strong data-slot="cashflow-waterfall-figure" data-direction="out">
                {fmt(view.outflowMinor)}
              </strong>
              <span> · {copy.net}</span> <strong data-slot="cashflow-waterfall-figure">{signed(view.netMinor)}</strong>
            </p>
            <div data-slot="cashflow-waterfall-frame" ref={frame} onMouseLeave={() => setHover(null)}>
              <svg
                data-slot="cashflow-waterfall-svg"
                role="img"
                aria-labelledby={`${id}-t ${id}-d`}
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
              >
                <title id={`${id}-t`}>{name}</title>
                <desc id={`${id}-d`}>{describe}</desc>
                <line data-slot="cashflow-waterfall-baseline" x1={x(0)} x2={x(0)} y1={0} y2={height} />
                {total(0, copy.opening, view.openingMinor)}
                {view.steps.map((step, index) => {
                  const row = index + 1;
                  const from = x(step.startMinor);
                  const to = x(step.endMinor);
                  return (
                    <g
                      key={step.id}
                      data-slot="cashflow-waterfall-row"
                      data-kind="step"
                      data-active={active === index || drilledIndex === index ? "" : undefined}
                    >
                      <line
                        data-slot="cashflow-waterfall-connector"
                        x1={from}
                        x2={from}
                        y1={barY(row - 1) + BAR}
                        y2={barY(row)}
                      />
                      <text x={0} y={row * ROW + 14} data-slot="cashflow-waterfall-label">
                        {truncate(step.label, Math.floor((width - 120) / 7))}
                      </text>
                      <text x={width} y={row * ROW + 14} textAnchor="end" data-slot="cashflow-waterfall-value">
                        {signed(step.amountMinor)}
                      </text>
                      <path
                        data-slot="cashflow-waterfall-bar"
                        data-direction={step.direction}
                        d={barPath(from, barY(row), to - from, BAR)}
                      />
                    </g>
                  );
                })}
                <line
                  data-slot="cashflow-waterfall-connector"
                  x1={x(view.computedClosingMinor)}
                  x2={x(view.computedClosingMinor)}
                  y1={barY(count - 2) + BAR}
                  y2={barY(count - 1)}
                />
                {total(count - 1, copy.closing, view.closingMinor)}
              </svg>
              {/* Arrow keys bubble up from the bar buttons inside; the container takes no focus itself. */}
              {view.steps.length > 0 ? (
                // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
                <div data-slot="cashflow-waterfall-hits" onKeyDown={onKeys}>
                  {view.steps.map((step, index) => (
                    <CashflowWaterfallStep
                      key={step.id}
                      value={step.id}
                      aria-label={`${step.label}: ${signed(step.amountMinor)}, ${copy.balance} ${fmt(step.endMinor)}`}
                      tabIndex={index === (focusIndex ?? tabStop) ? 0 : -1}
                      onMouseEnter={() => setHover(index)}
                      onFocus={() => setFocusIndex(index)}
                      onBlur={() => setFocusIndex(null)}
                      style={{ top: (index + 1) * ROW, height: ROW }}
                    />
                  ))}
                </div>
              ) : null}
              {tipStep && active !== null ? (
                <div
                  data-slot="cashflow-waterfall-tooltip"
                  aria-hidden="true"
                  style={{
                    top: (active + 2) * ROW,
                    left: Math.min(Math.max(0, x(tipStep.endMinor) - 90), Math.max(0, width - 200)),
                  }}
                >
                  <strong>{tipStep.label}</strong>
                  <span data-slot="cashflow-waterfall-figure" data-direction={tipStep.direction}>
                    {signed(tipStep.amountMinor)}
                  </span>
                  <span>{`${fmt(tipStep.startMinor)} → ${fmt(tipStep.endMinor)}`}</span>
                </div>
              ) : null}
            </div>
            {view.steps.length === 0 ? <p data-slot="cashflow-waterfall-empty">{copy.noSteps}</p> : null}
            <p data-slot="cashflow-waterfall-check" role="status" data-reconciles={String(view.reconciles)}>
              {view.reconciles
                ? copy.reconciles
                : copy.differs(fmt(view.computedClosingMinor), fmt(view.closingMinor), signed(view.differenceMinor))}
            </p>
            <details data-slot="cashflow-waterfall-table">
              <summary>{copy.table}</summary>
              <div data-slot="cashflow-waterfall-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{copy.item}</th>
                      <th scope="col" data-align="end">
                        {copy.amount}
                      </th>
                      <th scope="col" data-align="end">
                        {copy.balance}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">{copy.opening}</th>
                      <td data-align="end" />
                      <td data-align="end">{fmt(view.openingMinor)}</td>
                    </tr>
                    {view.steps.map((step: WaterfallStep) => (
                      <tr key={step.id} data-direction={step.direction}>
                        <th scope="row">{step.label}</th>
                        <td data-align="end">{signed(step.amountMinor)}</td>
                        <td data-align="end">{fmt(step.endMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">{copy.closing}</th>
                      <td data-align="end">{view.reconciles ? "" : signed(view.differenceMinor)}</td>
                      <td data-align="end">{fmt(view.closingMinor)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </details>
            {state.refusal ? (
              <p data-slot="cashflow-waterfall-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </CashflowWaterfallRoot>
  );
}

function truncate(text: string, max: number): string {
  if (max < 2) return "";
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}

export { CashflowWaterfall, CashflowWaterfallRoot, CashflowWaterfallStep, cashflowWaterfall };

export { type CashflowStep } from "@booki/primitives/cashflow-waterfall";
