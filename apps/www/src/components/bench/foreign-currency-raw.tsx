import { useState } from "react";
import { useEndState } from "./end-state";

import { FOREIGN_INVOICE, FX_RATES_EUR_NOK } from "./hard-data";

/**
 * A voucher form on a plain page for an invoice in a foreign currency. Built
 * for the benchmark, not a map of a product's screen. Neutral look, invented
 * data. The page shows the invoice in EUR and the rates the bank published,
 * and it has a currency field, a foreign amount, a rate and the rows. It does
 * no rate check and no conversion: it posts the rows as typed when debit
 * equals credit, the way the plain voucher screen does.
 */

export type RawForeignState = {
  voucher: {
    date: string;
    currency: string;
    foreignAmount: string;
    rate: string;
    rows: { account: string; debit: string; credit: string }[];
    posted: boolean;
  };
  events: string[];
};

const SLOTS = 5;
const emptyRows = () => Array.from({ length: SLOTS }, () => ({ account: "", debit: "", credit: "" }));

/** NOK per EUR as a person writes it: 11,7250. */
const rateText = (rateScaled: number) => (rateScaled / 1_000_000).toFixed(4).replace(".", ",");

/** An ISO date as the page shows it: 14.10.2026. */
const dateNb = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

const amount = (text: string) => {
  const t = text
    .replace(/[\s ]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  return t === "" ? 0 : /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : Number.NaN;
};

export function ForeignRaw() {
  const [date, setDate] = useState("");
  const [currency, setCurrency] = useState("");
  const [foreignAmount, setForeignAmount] = useState("");
  const [rate, setRate] = useState("");
  const [rows, setRows] = useState(emptyRows);
  const [posted, setPosted] = useState(false);
  const [message, setMessage] = useState("");
  const [events, setEvents] = useState<string[]>([]);

  // For the benchmark's end-state checks only. A real agent never sees this.
  useEndState<RawForeignState>("__rawForeign", {
    voucher: { date, currency, foreignAmount, rate, rows, posted },
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

  const edit = (set: () => void) => {
    if (posted) return;
    set();
    setMessage("");
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
        <h2>Faktura</h2>
        <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
          <dt>Leverandør</dt>
          <dd className="m-0">{FOREIGN_INVOICE.supplier}</dd>
          <dt>Fakturanummer</dt>
          <dd className="m-0">{FOREIGN_INVOICE.invoiceNumber}</dd>
          <dt>Fakturadato</dt>
          <dd className="m-0">{dateNb(FOREIGN_INVOICE.invoiceDate)}</dd>
          <dt>Beløp</dt>
          <dd className="m-0">EUR 1 000,00</dd>
        </dl>
      </section>

      <section>
        <h2>Valutakurser (NOK per EUR)</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Dato</th>
              <th scope="col">Kurs</th>
            </tr>
          </thead>
          <tbody>
            {FX_RATES_EUR_NOK.map((row) => (
              <tr key={row.date}>
                <td>{dateNb(row.date)}</td>
                <td>{rateText(row.rateScaled)}</td>
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
            <input type="text" value={date} readOnly={posted} onChange={(e) => edit(() => setDate(e.target.value))} />
          </label>
          <label>
            Valuta
            <input
              type="text"
              value={currency}
              readOnly={posted}
              onChange={(e) => edit(() => setCurrency(e.target.value))}
            />
          </label>
          <label>
            Beløp i valuta
            <input
              type="text"
              value={foreignAmount}
              readOnly={posted}
              onChange={(e) => edit(() => setForeignAmount(e.target.value))}
            />
          </label>
          <label>
            Kurs
            <input type="text" value={rate} readOnly={posted} onChange={(e) => edit(() => setRate(e.target.value))} />
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
                  edit(() => setRows((all) => all.map((r, i) => (i === index ? { ...r, [key]: e.target.value } : r))))
                }
              />
            ))}
          </div>
        ))}
        <div className="raw-footer">
          <button type="button" className="raw-primary" disabled={posted} onClick={post}>
            Bokfør bilag
          </button>
          <span>{message}</span>
        </div>
      </section>
    </div>
  );
}
