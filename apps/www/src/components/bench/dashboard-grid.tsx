import { useEffect, useRef, useState, type CSSProperties } from "react";

import { AGING, nok, yearMonths } from "./dashboard-data";

/**
 * A second dashboard for the head-to-head, rebuilt from a read-only structural
 * map of another ERP's start page ("Hjem"). Neutral look, invented data (the
 * same figures as the Booki overview). Patterns kept:
 *
 * - widgets in a grid of `div.widget-grid-cell`; charts are `<canvas>` with no
 *   role, no accessible name and no fallback content
 * - the monthly result chart has two dropdown buttons ("Månedlig resultat ▾",
 *   "2026 ▾") and a summary of the year's totals as text; hovering a bar adds
 *   an HTML tooltip "Inntekter # Kostnader # Resultat #" with no month name,
 *   and moving off the bars changes nothing, so the month is known only from
 *   where the pointer is
 * - a liquidity table in the DOM; a top-customers table
 *
 * Changed on purpose: the receivables widget is an empty state in the mapped
 * account. Here it holds the overdue breakdown (not due / 1-30 / over 30) as a
 * canvas donut with HTML totals, so the task's overdue question can be
 * answered on this page too.
 */

const cell: CSSProperties = {
  padding: "1rem",
  background: "var(--bk-card)",
  boxShadow: "var(--bk-shadow-sm)",
  display: "grid",
  gap: "0.5rem",
  alignContent: "start",
};

/** Layout of the result chart, in CSS pixels. The scripted agent knows it (best case). */
export const RESULT_CHART = { width: 360, height: 200, left: 8, top: 8, bottom: 8, months: 12 };

function ResultCanvas({ year, onBar }: { year: number; onBar: (index: number) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const months = yearMonths(year);
  const { width, height, left, top, bottom } = RESULT_CHART;
  const column = (width - left) / 12;
  const max = 600_000_00;
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const style = getComputedStyle(ref.current!);
    ctx.clearRect(0, 0, width, height);
    months.forEach((m, index) => {
      const plot = height - top - bottom;
      if (m.revenueMinor !== null) {
        const h = (m.revenueMinor / max) * plot;
        ctx.fillStyle = style.getPropertyValue("--bk-brand") || "#4a6";
        ctx.fillRect(left + index * column + 2, height - bottom - h, column / 2 - 2, h);
      }
      if (m.costsMinor !== null) {
        const h = (m.costsMinor / max) * plot;
        ctx.fillStyle = style.getPropertyValue("--bk-muted-fg") || "#888";
        ctx.fillRect(left + index * column + column / 2, height - bottom - h, column / 2 - 2, h);
      }
    });
  }, [months, width, height, left, top, bottom, column]);
  return (
    <canvas
      ref={ref}
      className="result-canvas"
      width={width}
      height={height}
      style={{ width, height }}
      onMouseMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        const index = Math.floor((event.clientX - box.left - left) / column);
        // Only over a bar with a value; elsewhere the tooltip keeps what it had.
        if (index >= 0 && index < 12 && months[index]!.revenueMinor !== null) onBar(index);
      }}
    />
  );
}

function DonutCanvas({ parts }: { parts: number[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const total = parts.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    let start = -Math.PI / 2;
    ["#222", "#4a6", "#999"].forEach((colour, index) => {
      const angle = (Math.max(0, parts[index]!) / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.strokeStyle = colour;
      ctx.lineWidth = 18;
      ctx.arc(60, 60, 44, start, start + angle);
      ctx.stroke();
      start += angle;
    });
  }, [parts]);
  return <canvas ref={ref} width={120} height={120} />;
}

export function DashboardGrid() {
  const [year, setYear] = useState(2026);
  const [yearMenu, setYearMenu] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const months = yearMonths(year);
  const sum = (key: "revenueMinor" | "costsMinor") => months.reduce((total, m) => total + (m[key] ?? 0), 0);
  const tip = hover === null ? null : months[hover]!;
  return (
    <div style={{ display: "grid", gap: "1rem", fontSize: "0.875rem" }}>
      <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 500 }}>Hjem</h1>
      <div
        className="widget-grid"
        style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "1rem" }}
      >
        <div className="widget-grid-cell" style={cell}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Banksaldo</h2>
          <table>
            <thead>
              <tr>
                <th>Konto</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1920 Driftskonto</td>
                <td>1 199 000,00</td>
              </tr>
            </tbody>
          </table>
          <button type="button">refresh</button>
          <canvas width={120} height={30} />
          <p style={{ margin: 0 }}>Utbetalinger</p>
          <p style={{ margin: 0 }}>4 poster å avstemme</p>
          <button type="button">Avstem bank</button>
        </div>
        <div className="widget-grid-cell" style={cell}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Huskeliste</h2>
          <button type="button">Opprett huskelapp</button>
          <p style={{ margin: 0 }}>Frist for innsending og betaling av Mva-melding 5. termin</p>
        </div>
        <div className="widget-grid-cell" style={cell}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Fakturert siste 12 måneder</h2>
          <canvas width={300} height={80} />
          <p style={{ margin: 0 }}>Betalt: 4 912 400,00 Fakturert: 5 042 900,00</p>
          <p style={{ margin: 0 }}>Restsum forfalte fakturaer</p>
          <button type="button">Se forfalte fakturaer</button>
        </div>
        <div className="widget-grid-cell" style={{ ...cell, gridColumn: "span 2" }}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Driftsresultat</h2>
          <div style={{ display: "flex", gap: "0.5rem", position: "relative" }}>
            <button type="button">Månedlig resultat ▾</button>
            <button type="button" onClick={() => setYearMenu((open) => !open)}>
              {year} ▾
            </button>
            {yearMenu ? (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: "8rem",
                  background: "var(--bk-card)",
                  boxShadow: "var(--bk-shadow-md)",
                  display: "grid",
                  zIndex: 2,
                }}
              >
                {[2026, 2025].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setYear(option);
                      setYearMenu(false);
                      setHover(null);
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <ResultCanvas key={year} year={year} onBar={setHover} />
          {tip && tip.revenueMinor !== null ? (
            <div className="chart-tooltip">
              Inntekter {nok(tip.revenueMinor)} Kostnader {nok(tip.costsMinor ?? 0)} Resultat{" "}
              {nok(tip.revenueMinor - (tip.costsMinor ?? 0))}
            </div>
          ) : null}
          <p style={{ margin: 0 }}>
            Inntekter {nok(sum("revenueMinor"))} Kostnader {nok(sum("costsMinor"))} Resultat{" "}
            {nok(sum("revenueMinor") - sum("costsMinor"))}
          </p>
        </div>
        <div className="widget-grid-cell" style={cell}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Ubetalte regninger</h2>
          <p style={{ margin: 0 }}>Det ser ikke ut som du har noen ubetalte regninger.</p>
        </div>
        <div className="widget-grid-cell" style={cell}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Kundefordringer</h2>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <DonutCanvas parts={[AGING.over30Minor, AGING.days1to30Minor, AGING.notDueMinor]} />
            <div style={{ display: "grid", gap: "0.25rem" }}>
              <span>Ikke forfalt {nok(AGING.notDueMinor)}</span>
              <span>1–30 dager {nok(AGING.days1to30Minor)}</span>
              <span>Over 30 dager {nok(AGING.over30Minor)}</span>
            </div>
          </div>
        </div>
        <div className="widget-grid-cell" style={cell}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Likviditetsprognose</h2>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            <button type="button" aria-pressed="true">
              Tabell
            </button>
            <button type="button" aria-pressed="false">
              Graf
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th />
                <th>I dag</th>
                <th>30 dager</th>
                <th>60 dager</th>
                <th>90 dager</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Kunde</td>
                <td>0,00</td>
                <td>357 350,00</td>
                <td>0,00</td>
                <td>0,00</td>
              </tr>
              <tr>
                <td>Leverandør</td>
                <td>0,00</td>
                <td>-168 400,00</td>
                <td>0,00</td>
                <td>0,00</td>
              </tr>
              <tr>
                <td>Mva</td>
                <td>0,00</td>
                <td>-54 800,00</td>
                <td>0,00</td>
                <td>0,00</td>
              </tr>
              <tr>
                <td>Annet</td>
                <td>0,00</td>
                <td>0,00</td>
                <td>0,00</td>
                <td>0,00</td>
              </tr>
              <tr>
                <td>Totalt</td>
                <td>0,00</td>
                <td>134 150,00</td>
                <td>0,00</td>
                <td>0,00</td>
              </tr>
              <tr>
                <td>Likviditet</td>
                <td>1 199 000,00</td>
                <td>1 333 150,00</td>
                <td>1 333 150,00</td>
                <td>1 333 150,00</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="widget-grid-cell" style={cell}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>5 største kunder</h2>
          <table>
            <thead>
              <tr>
                <th>Kunde</th>
                <th>Fakturert 2025</th>
                <th>Fakturert 2026</th>
                <th>Utestående</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Vestlandsbygg AS</td>
                <td>412 000,00</td>
                <td>1 120 500,00</td>
                <td>30 000,00</td>
              </tr>
              <tr>
                <td>Havblikk Hotell</td>
                <td>288 400,00</td>
                <td>640 000,00</td>
                <td>16 250,00</td>
              </tr>
              <tr>
                <td>Brattli AS</td>
                <td>96 500,00</td>
                <td>402 125,00</td>
                <td>8 525,00</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
