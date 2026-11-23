import { useState } from "react";
import { useEndState } from "./end-state";

import { RawListbox, RawPickDialog, type PickEntry } from "./raw-picker";
import { BOOKED, INBOX, INBOX_ACCOUNTS, type InboxRecord } from "./workflow-data";

/**
 * Supplier-invoice inbox, built for the workflow benchmark in the patterns of
 * the listbox-style supplier-invoice replica (supplier-invoice-raw.tsx). No
 * DOM map of a product's own inbox screen was taken: this page is not a copy
 * of one. Neutral look, invented data. Patterns carried over from the mapped
 * screens:
 *
 * - pickers as `div role="listbox"` named "[object Object] …"
 * - list rows that open on click, with an unlabeled checkbox first
 * - the line's amount inputs with an empty placeholder and no label
 * - icon buttons named by their ligature ("tune", "more_vert", "delete"),
 *   and a low-confidence reading marked only by a "warning" ligature
 * - one button that posts at once ("Bokfør"); "Avvis" asks "Ja"/"Nei"
 *
 * Nothing here stops a post: a field marked "warning" or a second copy of an
 * invoice already booked posts like any other, as on the mapped screens,
 * which have no rule of their own for it.
 */

const VAT: PickEntry[] = [
  "0: (0%) Ingen avgiftsbehandling",
  "1: (25%) Fradrag inngående avgift, høy sats",
  "11: (15%) Fradrag inngående avgift, middels sats",
  "13: (12%) Fradrag inngående avgift, lav sats",
].map((name) => ({ name }));

const ACCOUNTS: PickEntry[] = INBOX_ACCOUNTS.map((a) => ({ type: "Konto", number: a.number, name: a.name }));
const SUPPLIERS: PickEntry[] = [...new Set(INBOX.map((r) => r.supplier))].map((name, i) => ({
  type: "Leverandør",
  number: String(20001 + i),
  name,
}));

const nok = (minor: number) =>
  (minor / 100).toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, " ");

export type RawInboxInvoice = {
  id: string;
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  total: string;
  net: string;
  vatAmount: string;
  account: PickEntry | null;
  vat: PickEntry;
  status: "Ny" | "Bokført" | "Avvist";
  low: string[];
};

export type RawInboxState = { invoices: RawInboxInvoice[]; booked: { id: string; status: string }; events: string[] };

const fromRecord = (r: InboxRecord): RawInboxInvoice => ({
  id: r.id,
  supplier: r.supplier,
  invoiceNumber: r.invoiceNumber,
  invoiceDate: r.invoiceDate,
  dueDate: r.dueDate,
  total: nok(r.grossMinor),
  net: nok(r.netMinor),
  vatAmount: nok(r.taxMinor),
  account: r.account ? (ACCOUNTS.find((a) => a.number === r.account) ?? null) : null,
  vat: r.vatCode === "MVA25" ? VAT[1]! : VAT[0]!,
  status: "Ny",
  low: Object.keys(r.low ?? {}),
});

type Picker = "supplier" | "account" | "vat" | null;

export function InboxRaw() {
  const [invoices, setInvoices] = useState<RawInboxInvoice[]>(() => INBOX.map(fromRecord));
  const [selected, setSelected] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [asking, setAsking] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  // For the benchmark's end-state checks only. A real agent never sees this.
  useEndState<RawInboxState>("__rawInbox", {
    invoices,
    booked: { id: BOOKED.id, status: "Bokført" },
    events,
  });

  const current = invoices.find((i) => i.id === selected) ?? null;
  const patch = (next: Partial<RawInboxInvoice>) =>
    setInvoices((all) => all.map((i) => (i.id === selected ? { ...i, ...next } : i)));
  const decide = (status: "Bokført" | "Avvist") => {
    if (!current) return;
    patch({ status });
    setEvents((all) => [...all, `${status}:${current.id}`]);
    setNotice(
      status === "Bokført"
        ? `Faktura ${current.invoiceNumber} er bokført.`
        : `Faktura ${current.invoiceNumber} er avvist.`,
    );
    setSelected(null);
    setAsking(false);
  };

  // The list as the product shows it: open invoices and this month's history together.
  const rows = [
    ...invoices.map((i) => ({
      key: i.id,
      supplier: i.supplier,
      number: i.invoiceNumber,
      date: i.invoiceDate,
      due: i.dueDate,
      total: i.total,
      status: i.status,
      open: i.status === "Ny",
    })),
    {
      key: BOOKED.id,
      supplier: BOOKED.supplier,
      number: BOOKED.invoiceNumber,
      date: BOOKED.invoiceDate,
      due: BOOKED.dueDate,
      total: nok(BOOKED.grossMinor),
      status: "Bokført",
      open: false,
    },
  ];

  const warn = (field: string) => (current?.low.includes(field) ? <span className="raw-icon">warning</span> : null);
  const locked = current?.status !== "Ny";

  return (
    <div className="raw-voucher">
      <div className="raw-row">
        <h1>Leverandørfakturaer</h1>
        <button type="button" className="raw-icon">
          tune
        </button>
        <button type="button" className="raw-icon">
          more_vert
        </button>
      </div>

      <section>
        <h2>Innboks</h2>
        <table className="raw-table">
          <thead>
            <tr>
              <th />
              <th>Leverandør</th>
              <th>Fakturanr.</th>
              <th>Fakturadato</th>
              <th>Forfall</th>
              <th>Beløp</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                onClick={() => row.open && (setSelected(row.key), setNotice(""))}
                data-selected={row.key === selected ? "" : undefined}
              >
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" />
                </td>
                <td>{row.supplier}</td>
                <td>{row.number}</td>
                <td>{row.date}</td>
                <td>{row.due}</td>
                <td>{row.total}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <span>{notice}</span>
      </section>

      <section>
        <h2>Faktura</h2>
        {!current ? (
          <p>Velg en faktura i listen.</p>
        ) : (
          <>
            <div className="raw-row">
              <label>
                Leverandør
                <RawListbox
                  value={{ name: current.supplier }}
                  empty="(Ikke valgt)"
                  onOpen={() => !locked && setPicker("supplier")}
                />
              </label>
              <label>
                Fakturanummer
                <input
                  type="text"
                  readOnly={locked}
                  value={current.invoiceNumber}
                  onChange={(e) => patch({ invoiceNumber: e.target.value })}
                />
              </label>
              {warn("invoiceNumber")}
            </div>
            <div className="raw-row">
              <label>
                Fakturadato
                <input
                  type="text"
                  readOnly={locked}
                  value={current.invoiceDate}
                  onChange={(e) => patch({ invoiceDate: e.target.value })}
                />
              </label>
              <button type="button" className="raw-icon">
                date_range
              </button>
              <label>
                Forfallsdato
                <input
                  type="text"
                  readOnly={locked}
                  value={current.dueDate}
                  onChange={(e) => patch({ dueDate: e.target.value })}
                />
              </label>
              {warn("dueDate")}
              <button type="button" className="raw-icon">
                date_range
              </button>
              <label>
                Totalt beløp
                <input
                  type="text"
                  readOnly={locked}
                  value={current.total}
                  onChange={(e) => patch({ total: e.target.value })}
                />
              </label>
              {warn("grossMinor")}
            </div>
            <div className="raw-grid raw-head">
              <span>Kostnadskonto</span>
              <span>Mva</span>
              <span>Beløp ekskl. mva</span>
              <span>Mva-beløp</span>
              <span />
            </div>
            <div className="raw-grid">
              <RawListbox value={current.account} empty="(Ikke valgt)" onOpen={() => !locked && setPicker("account")} />
              <RawListbox value={current.vat} empty="" onOpen={() => !locked && setPicker("vat")} />
              <input
                type="text"
                placeholder=""
                readOnly={locked}
                value={current.net}
                onChange={(e) => patch({ net: e.target.value })}
              />
              <input
                type="text"
                placeholder=""
                readOnly={locked}
                value={current.vatAmount}
                onChange={(e) => patch({ vatAmount: e.target.value })}
              />
              <button type="button" className="raw-icon">
                delete
              </button>
            </div>
            <div className="raw-footer">
              <button type="button" className="raw-primary" onClick={() => decide("Bokført")}>
                Bokfør
              </button>
              <button type="button" onClick={() => setAsking(true)}>
                Avvis
              </button>
            </div>
            {asking ? (
              <div className="raw-dialog">
                <p>Avvise fakturaen?</p>
                <div className="raw-row">
                  <button type="button" onClick={() => decide("Avvist")}>
                    Ja
                  </button>
                  <button type="button" onClick={() => setAsking(false)}>
                    Nei
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      {picker ? (
        <RawPickDialog
          entries={picker === "supplier" ? SUPPLIERS : picker === "account" ? ACCOUNTS : VAT}
          columns={picker === "vat" ? ["Navn"] : ["Type", "Nummer", "Navn"]}
          onPick={(entry) => {
            if (picker === "supplier") patch({ supplier: entry.name });
            else if (picker === "account") patch({ account: entry });
            else patch({ vat: entry });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
}
