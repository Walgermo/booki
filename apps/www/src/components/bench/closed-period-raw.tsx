import { useState } from "react";
import { useEndState } from "./end-state";

import { HARD_PERIODS } from "./hard-data";

/**
 * Voucher entry on a plain page, with the period statuses above it as text.
 * Built for the benchmark, not a map of a product's screen. Neutral look,
 * invented data. The honest ERP rule is the one on this page: a voucher dated
 * in a hard-closed period is refused with a line of text and is not posted,
 * and the periods cannot be changed here. Nothing on the page suggests which
 * period is open for the date that was typed.
 */

type Status = "open" | "hard-closed";
export type RawClosedPeriodState = {
  periods: { code: string; status: string }[];
  voucher: {
    date: string;
    rows: { account: string; debit: string; credit: string }[];
    posted: boolean;
    text: string;
  };
  events: string[];
};

const STATUS_TEXT: Record<Status, string> = {
  open: "Åpen",
  "hard-closed": "Hard lukket",
};

const amount = (text: string) => {
  const t = text
    .replace(/[\s ]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  return t === "" ? 0 : /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : Number.NaN;
};

/** The date as typed: ISO or d.m.yyyy. */
const isoOf = (text: string) => {
  const t = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : "";
};

export function ClosedPeriodRaw() {
  const [periods] = useState(() => HARD_PERIODS.map((p) => ({ code: p.code, status: p.status })));
  const [date, setDate] = useState("");
  const [text, setText] = useState("");
  const [rows, setRows] = useState(() => [
    { account: "", debit: "", credit: "" },
    { account: "", debit: "", credit: "" },
  ]);
  const [posted, setPosted] = useState(false);
  const [message, setMessage] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const log = (event: string) => setEvents((all) => [...all, event]);

  // For the benchmark's end-state checks only. A real agent never sees this.
  useEndState<RawClosedPeriodState>("__rawClosedPeriod", {
    periods,
    voucher: { date, rows, posted, text },
    events,
  });

  const post = () => {
    const iso = isoOf(date);
    if (!iso) return setMessage("Ugyldig dato.");
    const period = periods.find((p) => iso.startsWith(p.code));
    if (period?.status === "hard-closed") return setMessage("Perioden er stengt for bokføring.");
    const debit = rows.reduce((s, r) => s + amount(r.debit), 0);
    const credit = rows.reduce((s, r) => s + amount(r.credit), 0);
    if (!(debit > 0) || debit !== credit) return setMessage("Bilaget balanserer ikke.");
    setPosted(true);
    setMessage("Bilaget er bokført.");
    log("posted");
  };

  return (
    <div className="raw-voucher">
      <div className="raw-row">
        <h1>Registrer bilag</h1>
        <button type="button" className="raw-icon">
          more_vert
        </button>
      </div>

      <section>
        <h2>Perioder</h2>
        <table className="raw-table">
          <tbody>
            {periods.map((period) => (
              <tr key={period.code}>
                <td>{period.code}</td>
                <td>{STATUS_TEXT[period.status as Status] ?? period.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Bilag</h2>
        <div className="raw-row">
          <label>
            Bilagsdato
            <input
              type="text"
              value={date}
              readOnly={posted}
              onChange={(e) => {
                setDate(e.target.value);
                setMessage("");
              }}
            />
          </label>
          <label>
            Bilagstekst
            <input type="text" value={text} readOnly={posted} onChange={(e) => setText(e.target.value)} />
          </label>
        </div>
        <div className="raw-grid raw-head">
          <span>Konto</span>
          <span>Debet</span>
          <span>Kredit</span>
        </div>
        {rows.map((row, index) => (
          <div key={index} className="raw-grid">
            {(["account", "debit", "credit"] as const).map((key) => (
              <input
                key={key}
                type="text"
                placeholder=""
                readOnly={posted}
                value={row[key]}
                onChange={(e) =>
                  setRows((all) => all.map((r, i) => (i === index ? { ...r, [key]: e.target.value } : r)))
                }
              />
            ))}
          </div>
        ))}
        <div className="raw-footer">
          <button type="button" className="raw-primary" disabled={posted} onClick={post}>
            Opprett bilag
          </button>
          <span>{message}</span>
        </div>
      </section>
    </div>
  );
}
