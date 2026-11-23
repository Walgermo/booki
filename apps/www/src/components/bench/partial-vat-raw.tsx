import { useState } from "react";
import { useEndState } from "./end-state";

import { PARTIAL_VAT_RULE } from "./hard-data";

/**
 * A voucher form on a plain page, for an invoice where only part of the input
 * VAT may be deducted. Built for the benchmark, not a map of a product's
 * screen. Neutral look, invented data. The page has no VAT-code column and no
 * automatic VAT split: every line is the account and the amounts as typed.
 * It posts only when debit equals credit, the way the plain voucher screen does.
 */

export type RawPartialVatState = {
  voucher: {
    date: string;
    rows: { account: string; debit: string; credit: string }[];
    posted: boolean;
  };
  events: string[];
};

const SLOTS = 5;
const emptyRows = () => Array.from({ length: SLOTS }, () => ({ account: "", debit: "", credit: "" }));

const amount = (text: string) => {
  const t = text
    .replace(/[\s ]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  return t === "" ? 0 : /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : Number.NaN;
};

export function PartialVatRaw() {
  const [date, setDate] = useState("");
  const [rows, setRows] = useState(emptyRows);
  const [posted, setPosted] = useState(false);
  const [message, setMessage] = useState("");
  const [events, setEvents] = useState<string[]>([]);

  // For the benchmark's end-state checks only. A real agent never sees this.
  useEndState<RawPartialVatState>("__rawPartialVat", {
    voucher: { date, rows, posted },
    events,
  });

  const post = () => {
    if (!date.trim()) return setMessage("Bilagsdato mangler.");
    const debit = rows.reduce((s, r) => s + amount(r.debit), 0);
    const credit = rows.reduce((s, r) => s + amount(r.credit), 0);
    if (!(debit > 0) || debit !== credit) return setMessage("Bilaget balanserer ikke.");
    setPosted(true);
    setMessage("Bilaget er bokført.");
    setEvents((all) => [...all, "posted"]);
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
        <h2>Regel</h2>
        <p className="m-0">{PARTIAL_VAT_RULE}</p>
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
