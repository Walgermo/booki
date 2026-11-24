import { formatMoney } from "@booki/core/money";
import { createParts } from "@ui-sdk/react/primitive";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import {
  derive,
  recurringRevenue,
  type Details,
  type RecurringAgreement,
  type RecurringMovement,
  type RecurringView,
} from "@booki/primitives/recurring-revenue";

const parts = createParts(recurringRevenue, { root: "div", view: "button", movement: "button" });
const RecurringRevenueRoot = parts.Root;
const RecurringRevenueView = parts.View;
const RecurringRevenueMovement = parts.Movement;

const COPY = {
  EN: {
    label: "Recurring revenue",
    mrr: "MRR",
    arr: "ARR",
    perMonth: "per month",
    perYear: "per year",
    opening: "Opening",
    closing: "Closing",
    net: "Net",
    customers: (n: number) => (n === 1 ? "1 customer" : `${n} customers`),
    movement: { new: "New", expansion: "Expansion", contraction: "Contraction", churn: "Churn" } satisfies Record<
      RecurringMovement,
      string
    >,
    reconciles: "Opening plus the movements equals closing.",
    rounding: (amount: string) => `Rounding to whole øre/cents per month: ${amount}.`,
    view: "Show",
  },
  NO: {
    label: "Løpende inntekter",
    mrr: "MRR",
    arr: "ARR",
    perMonth: "per måned",
    perYear: "per år",
    opening: "Inngående",
    closing: "Utgående",
    net: "Netto",
    customers: (n: number) => (n === 1 ? "1 kunde" : `${n} kunder`),
    movement: { new: "Nye", expansion: "Økning", contraction: "Reduksjon", churn: "Tapt" } satisfies Record<
      RecurringMovement,
      string
    >,
    reconciles: "Inngående pluss bevegelsene er lik utgående.",
    rounding: (amount: string) => `Avrunding til hele øre per måned: ${amount}.`,
    view: "Vis",
  },
} as const;

export type RecurringRevenueProps = {
  agreements: RecurringAgreement[];
  /** The bridge's start and end, YYYY-MM-DD. */
  from: string;
  to: string;
  /** Defaults to the first currency the agreements are in. */
  currency?: string;
  view?: RecurringView;
  defaultView?: RecurringView;
  onViewChange?: (view: RecurringView, details: Details) => void;
  drill?: RecurringMovement | null;
  defaultDrill?: RecurringMovement | null;
  onDrill?: (movement: RecurringMovement, details: Details) => void;
  /** A customer's name for an id. */
  nameOf?: (customerId: string) => string;
  title?: string;
  className?: string;
  "aria-label"?: string;
};

type RootState = { view: RecurringView; drill: RecurringMovement | null; refusal: string };

/** Composed bridge: opening MRR or ARR, a bar per movement, closing, and who is behind the movement drilled into. */
function RecurringRevenue({
  agreements,
  from,
  to,
  currency,
  view,
  defaultView,
  onViewChange,
  drill,
  defaultDrill,
  onDrill,
  nameOf = (id) => id,
  title,
  className,
  "aria-label": ariaLabel,
}: RecurringRevenueProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const locale = profile.locale;
  return (
    <RecurringRevenueRoot
      agreements={agreements}
      from={from}
      to={to}
      currency={currency}
      view={view}
      defaultView={defaultView}
      onViewChange={onViewChange}
      drill={drill}
      defaultDrill={defaultDrill}
      onDrillChange={(next: RecurringMovement | null, details: Details) => {
        if (next !== null) onDrill?.(next, details);
      }}
      className={className}
      aria-label={ariaLabel ?? title ?? copy.label}
    >
      {(state: RootState) => {
        const data = derive({ agreements, from, to, currency }, state.view, state.drill);
        const fmt = (minor: number) =>
          formatMoney({ minor, currency: data.currency }, { locale, trimZeroFraction: true });
        const signed = (minor: number) => (minor > 0 ? `+${fmt(minor)}` : fmt(minor));
        const largest = Math.max(
          1,
          data.openingMinor,
          data.closingMinor,
          ...data.movements.map((m) => Math.abs(m.amountMinor)),
        );
        const unit = state.view === "arr" ? copy.perYear : copy.perMonth;
        return (
          <>
            {title ? <h3 data-slot="recurring-revenue-title">{title}</h3> : null}
            <div data-slot="recurring-revenue-toolbar">
              <p data-slot="recurring-revenue-headline">
                <span data-slot="recurring-revenue-figure">{fmt(data.closingMinor)}</span>{" "}
                <span data-slot="recurring-revenue-unit">
                  {copy[state.view]} {unit}
                </span>
              </p>
              <span role="group" aria-label={copy.view} data-slot="recurring-revenue-views">
                <RecurringRevenueView value="mrr">{copy.mrr}</RecurringRevenueView>
                <RecurringRevenueView value="arr">{copy.arr}</RecurringRevenueView>
              </span>
            </div>
            <ol data-slot="recurring-revenue-rows">
              <li data-slot="recurring-revenue-row" data-kind="balance">
                <span data-slot="recurring-revenue-label">{copy.opening}</span>
                <span data-slot="recurring-revenue-track">
                  <span
                    data-slot="recurring-revenue-bar"
                    data-kind="balance"
                    style={{ width: `${(data.openingMinor / largest) * 100}%` }}
                  />
                </span>
                <span data-slot="recurring-revenue-amount">{fmt(data.openingMinor)}</span>
              </li>
              {data.movements.map((movement) => (
                <li key={movement.id} data-slot="recurring-revenue-row" data-kind={movement.id}>
                  <RecurringRevenueMovement
                    value={movement.id}
                    aria-label={`${copy.movement[movement.id]}: ${signed(movement.amountMinor)}, ${copy.customers(movement.customers.length)}`}
                  >
                    <span data-slot="recurring-revenue-label">{copy.movement[movement.id]}</span>
                    <span data-slot="recurring-revenue-track">
                      <span
                        data-slot="recurring-revenue-bar"
                        data-direction={movement.amountMinor < 0 ? "down" : "up"}
                        style={{ width: `${(Math.abs(movement.amountMinor) / largest) * 100}%` }}
                      />
                    </span>
                    <span data-slot="recurring-revenue-amount">{signed(movement.amountMinor)}</span>
                  </RecurringRevenueMovement>
                </li>
              ))}
              <li data-slot="recurring-revenue-row" data-kind="balance">
                <span data-slot="recurring-revenue-label">{copy.closing}</span>
                <span data-slot="recurring-revenue-track">
                  <span
                    data-slot="recurring-revenue-bar"
                    data-kind="balance"
                    style={{ width: `${(data.closingMinor / largest) * 100}%` }}
                  />
                </span>
                <span data-slot="recurring-revenue-amount">{fmt(data.closingMinor)}</span>
              </li>
            </ol>
            <p data-slot="recurring-revenue-check" role="status" data-reconciles={String(data.reconciles)}>
              {copy.net} {signed(data.netMinor)} · {copy.reconciles}
              {data.roundingMinor ? ` ${copy.rounding(signed(data.roundingMinor))}` : ""}
            </p>
            {data.drilled ? (
              <p data-slot="recurring-revenue-customers">
                {copy.movement[data.drilled.id as RecurringMovement]}:{" "}
                {data.drilled.customers.map(nameOf).join(", ") || "–"}
              </p>
            ) : null}
            {data.issues.length ? (
              <ul data-slot="recurring-revenue-issues">
                {data.issues.map((issue) => (
                  <li key={issue}>{say(issue)}</li>
                ))}
              </ul>
            ) : null}
            {state.refusal ? (
              <p data-slot="recurring-revenue-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </RecurringRevenueRoot>
  );
}

export { RecurringRevenue, RecurringRevenueMovement, RecurringRevenueRoot, RecurringRevenueView, recurringRevenue };
export type { RecurringAgreement, RecurringMovement, RecurringView };
