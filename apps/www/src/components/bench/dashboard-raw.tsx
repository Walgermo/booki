import { useState, type CSSProperties } from "react";

import { AGING, AS_OF, MONTH_TICKS, PAYROLL, nok, yearMonths } from "./dashboard-data";

/**
 * A dashboard rebuilt for the head-to-head from a read-only structural map of
 * a large ERP's start page. Neutral look, invented data (the same figures as
 * the Booki overview). Patterns kept:
 *
 * - charts are SVG with `role="application"`, `tabindex="0"`, no accessible
 *   name and an empty `<title>`/`<desc>`; bars carry only a class
 * - the income/cost chart is composed: 24 bars (12 months × 2) and one line,
 *   month ticks "jan … des", numeric y ticks, a year select; the per-month
 *   values are not in the DOM: a tooltip wrapper stays empty until a month is
 *   hovered
 * - the invoice donut's totals sit in an HTML legend outside the SVG
 * - the payroll bar is split into Lønn / Arbeidsgiveravgift / Skatt only
 *   visually; the split's amounts are not in the DOM
 * - text tiles for payments, inbox, deadlines and tasks
 */

const card: CSSProperties = {
  padding: "1rem",
  background: "var(--bk-card)",
  boxShadow: "var(--bk-shadow-sm)",
  display: "grid",
  gap: "0.5rem",
  alignContent: "start",
};
const ink = "var(--bk-ink, currentColor)";
const muted = "var(--bk-muted-fg)";
const brand = "var(--bk-brand)";

function Surface({
  width,
  height,
  children,
  onMouseLeave,
}: {
  width: number;
  height: number;
  children: React.ReactNode;
  onMouseLeave?: () => void;
}) {
  return (
    <svg
      className="recharts-surface"
      role="application"
      tabIndex={0}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      onMouseLeave={onMouseLeave}
    >
      <title />
      <desc />
      {children}
    </svg>
  );
}

function IncomeChart({ year }: { year: number }) {
  const months = yearMonths(year);
  const [active, setActive] = useState<number | null>(null);
  const width = 720;
  const height = 260;
  const left = 56;
  const bottom = 28;
  const plotH = height - bottom - 12;
  const max = 600_000_00;
  const column = (width - left) / 12;
  const y = (minor: number) => 12 + plotH - (minor / max) * plotH;
  const accumulated: (number | null)[] = [];
  let running = 0;
  for (const m of months) {
    if (m.revenueMinor !== null) running += m.revenueMinor - (m.costsMinor ?? 0);
    accumulated.push(m.revenueMinor === null ? null : running);
  }
  const hovered = active === null ? null : months[active]!;
  return (
    <div style={{ position: "relative" }}>
      <Surface width={width} height={height} onMouseLeave={() => setActive(null)}>
        {[0, 2, 4, 6].map((step) => (
          <text key={step} x={left - 8} y={y(step * 100_000_00) + 4} textAnchor="end" fontSize="10" fill={muted}>
            {step * 100_000}
          </text>
        ))}
        <g className="recharts-layer recharts-bar">
          {months.map((m, index) =>
            m.revenueMinor === null ? null : (
              <rect
                key={`r${index}`}
                className="recharts-rectangle"
                x={left + index * column + 6}
                y={y(m.revenueMinor)}
                width={column / 2 - 6}
                height={12 + plotH - y(m.revenueMinor)}
                fill={brand}
              />
            ),
          )}
        </g>
        <g className="recharts-layer recharts-bar">
          {months.map((m, index) =>
            m.costsMinor === null ? null : (
              <rect
                key={`c${index}`}
                className="recharts-rectangle"
                x={left + index * column + column / 2}
                y={y(m.costsMinor)}
                width={column / 2 - 6}
                height={12 + plotH - y(m.costsMinor)}
                fill={muted}
              />
            ),
          )}
        </g>
        <polyline
          className="recharts-curve recharts-line-curve"
          fill="none"
          stroke={ink}
          points={accumulated
            .map((value, index) =>
              value === null ? null : `${left + index * column + column / 2},${y(Math.max(0, value) / 4)}`,
            )
            .filter(Boolean)
            .join(" ")}
        />
        {MONTH_TICKS.map((tick, index) => (
          <text
            key={tick}
            x={left + index * column + column / 2}
            y={height - 8}
            textAnchor="middle"
            fontSize="10"
            fill={muted}
          >
            {tick}
          </text>
        ))}
        {/* Where the pointer selects a month, as the charting library does. */}
        <g className="recharts-hit-layer">
          {months.map((m, index) => (
            <rect
              key={m.tick}
              className="recharts-hit"
              x={left + index * column}
              y={0}
              width={column}
              height={height - bottom}
              fill="transparent"
              onMouseEnter={() => setActive(index)}
            />
          ))}
        </g>
      </Surface>
      <div
        className="recharts-tooltip-wrapper"
        style={{ position: "absolute", top: 0, right: 0, pointerEvents: "none" }}
      >
        {hovered && hovered.revenueMinor !== null ? (
          <div style={{ ...card, fontSize: "0.75rem" }}>
            <p style={{ margin: 0 }}>
              {hovered.tick} {year}
            </p>
            <p style={{ margin: 0 }}>Inntekter: {nok(hovered.revenueMinor)}</p>
            <p style={{ margin: 0 }}>Kostnader: {nok(hovered.costsMinor ?? 0)}</p>
            <p style={{ margin: 0 }}>Overskudd akkumulert: {nok(accumulated[active!] ?? 0)}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Donut({ parts }: { parts: number[] }) {
  const total = parts.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const shares = parts.map((part) => Math.max(0, part) / total);
  const colours = [ink, brand, muted];
  return (
    <Surface width={140} height={140}>
      {shares.map((share, index) => {
        const start = shares.slice(0, index).reduce((a, b) => a + b, 0);
        const a0 = start * 2 * Math.PI;
        const a1 = (start + share) * 2 * Math.PI;
        const large = share > 0.5 ? 1 : 0;
        const p = (a: number, r: number) => `${70 + r * Math.sin(a)},${70 - r * Math.cos(a)}`;
        return (
          <path
            key={index}
            className="recharts-sector"
            fill={colours[index]}
            d={`M${p(a0, 64)} A64,64 0 ${large} 1 ${p(a1, 64)} L${p(a1, 40)} A40,40 0 ${large} 0 ${p(a0, 40)} Z`}
          />
        );
      })}
    </Surface>
  );
}

export function DashboardRaw() {
  const [year, setYear] = useState(2026);
  const payrollTotal = PAYROLL.salaryMinor + PAYROLL.employerTaxMinor + PAYROLL.withholdingMinor;
  const segments = [PAYROLL.salaryMinor, PAYROLL.employerTaxMinor, PAYROLL.withholdingMinor];
  const [d, m, y] = [AS_OF.slice(8, 10), AS_OF.slice(5, 7), AS_OF.slice(0, 4)];
  return (
    <div style={{ display: "grid", gap: "1rem", fontSize: "0.875rem" }}>
      <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 500 }}>Oversikt</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "1rem" }}>
        <section style={card}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Betalingssammendrag</h2>
          <p style={{ margin: 0 }}>Sum - utestående betalinger NOK 168 400,00</p>
          <p style={{ margin: 0 }}>Sum - forfalte betalinger NOK 12 750,00</p>
        </section>
        <section style={card}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Bilagsmottak</h2>
          <p style={{ margin: 0 }}>3 Ikke bokførte bilag</p>
        </section>
        <section style={card}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Fakturaoversikt</h2>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button">Ny faktura</button>
            <span>Fra 1004</span>
          </div>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <Donut parts={[AGING.over30Minor, AGING.days1to30Minor, AGING.notDueMinor]} />
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.25rem" }}>
              <li>Forfalte fakturaer (Over 30 dager) NOK {nok(AGING.over30Minor)}</li>
              <li>Forfalte fakturaer (1-30 dager) NOK {nok(AGING.days1to30Minor)}</li>
              <li>Ikke-forfalte fakturaer NOK {nok(AGING.notDueMinor)}</li>
            </ul>
          </div>
          <p style={{ margin: 0 }}>Utestående fakturaer {nok(AGING.totalMinor)} NOK</p>
          <p style={{ margin: 0, color: muted }}>
            Sist oppdatert {d}.{m}.{y}
          </p>
        </section>
        <section style={card}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Lønn</h2>
          <button type="button">Ny lønnsutbetaling</button>
          <p style={{ margin: 0 }}>Ansatte i forrige lønnsutbetaling {PAYROLL.employees}</p>
          <p style={{ margin: 0 }}>Utbetalt denne måneden (oktober) NOK {nok(payrollTotal)}</p>
          <Surface width={240} height={20}>
            {segments.map((value, index) => {
              const x = (segments.slice(0, index).reduce((a, b) => a + b, 0) / payrollTotal) * 240;
              return (
                <rect
                  key={index}
                  className="recharts-rectangle"
                  x={x}
                  y={0}
                  width={(value / payrollTotal) * 240}
                  height={20}
                  fill={[brand, ink, muted][index]}
                />
              );
            })}
          </Surface>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", gap: "0.75rem", color: muted }}>
            <li>Lønn</li>
            <li>Arbeidsgiveravgift</li>
            <li>Skatt</li>
          </ul>
        </section>
        <section style={card}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Frister</h2>
          <p style={{ margin: 0 }}>Betaling av aga. (sept-okt) 15. november (Utløpt)</p>
          <a href="#historikk">Se historikk</a>
        </section>
        <section style={card}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Oppgaver</h2>
          <p style={{ margin: 0 }}>Du har ingen oppgaver.</p>
        </section>
      </div>
      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Inntekter og kostnader</h2>
          <a href="#rapport">Se detaljert rapport</a>
          <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", gap: "1rem", color: muted }}>
          <li>Inntekter</li>
          <li>Kostnader</li>
          <li>Overskudd akkumulert</li>
        </ul>
        <IncomeChart key={year} year={year} />
      </section>
    </div>
  );
}
