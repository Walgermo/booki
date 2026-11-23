import { useState } from "react";
import { useEndState } from "./end-state";

import { RawListbox, RawPickDialog, type PickEntry } from "./raw-picker";

/**
 * New order/invoice, rebuilt for the head-to-head from a read-only DOM map of
 * a large ERP's screen. Neutral look, invented data. Patterns kept:
 *
 * - customer, contact, project and product pickers are `div role="listbox"`
 *   named "[object Object] (Velg kunde)", "[object Object] (Ikke valgt)",
 *   "[object Object] (Velg produkt)"
 * - line table headers Beskrivelse, Antall, Enhetspris, Påslag (%), Rabatt
 *   (%), Beløp, as plain header text; the line inputs have no name (empty
 *   placeholder); the description textarea has placeholder "Beskriv uten å
 *   velge produkt"
 * - row icons named by their ligature ("close", "content_copy"); "Ny rad",
 *   "Ny gruppering"; an "Enkel fakturering" toggle; "Opprett"
 *
 * Not observed: how VAT is set per line. Modelled as the 25 % default shown
 * in the totals, with no per-line control.
 */

const CUSTOMERS: PickEntry[] = [
  { type: "Kunde", number: "10002", name: "Havblikk Hotell AS" },
  { type: "Kunde", number: "10003", name: "Brattvoll Bygg AS" },
  { type: "Kunde", number: "10001", name: "Brattli AS" },
  { type: "Kunde", number: "10004", name: "Brattli Eiendom AS" },
  { type: "Kunde", number: "10005", name: "Sjøkanten Kafé AS" },
];
const CONTACTS: PickEntry[] = [{ name: "Ola Brattli" }, { name: "Kari Havblikk" }];
const PROJECTS: PickEntry[] = [{ number: "P-100", name: "Rammeavtale 2026" }];
const PRODUCTS: PickEntry[] = [
  { number: "100", name: "Rådgivning, time" },
  { number: "200", name: "Kurs, dag" },
];

const VAT_RATE = 25;

type Line = {
  product: PickEntry | null;
  description: string;
  quantity: string;
  unitPrice: string;
  markup: string;
  discount: string;
};

export type RawSalesInvoiceState = {
  customer: PickEntry | null;
  lines: Line[];
  simple: boolean;
  created: boolean;
  totals: { netMinor: number; vatMinor: number; grossMinor: number };
};

const emptyLine = (): Line => ({
  product: null,
  description: "",
  quantity: "",
  unitPrice: "",
  markup: "",
  discount: "",
});

/** "1 450,00" or "1450.00" -> 145000; "12,5" -> 12.5 when `decimals` is false. */
const num = (text: string) => {
  const value = Number(text.replace(/[\s ]/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
};
const lineMinor = (line: Line) =>
  Math.round(
    num(line.quantity) * num(line.unitPrice) * 100 * (1 + num(line.markup) / 100) * (1 - num(line.discount) / 100),
  );
const fmt = (minor: number) =>
  (minor / 100).toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Picker = { kind: "customer" | "contact" | "project" } | { kind: "product"; line: number } | null;

export function SalesInvoiceRaw() {
  const [customer, setCustomer] = useState<PickEntry | null>(null);
  const [contact, setContact] = useState<PickEntry | null>(null);
  const [project, setProject] = useState<PickEntry | null>(null);
  const [orderDate, setOrderDate] = useState("");
  const [reference, setReference] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [simple, setSimple] = useState(false);
  const [created, setCreated] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);

  const netMinor = lines.reduce((sum, line) => sum + lineMinor(line), 0);
  const vatMinor = Math.round((netMinor * VAT_RATE) / 100);
  const totals = { netMinor, vatMinor, grossMinor: netMinor + vatMinor };

  // For the benchmark's end-state checks only. A real agent never sees this.
  useEndState<RawSalesInvoiceState>("__rawSalesInvoice", {
    customer,
    lines,
    simple,
    created,
    totals,
  });

  const setLine = (index: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  const pick = (entry: PickEntry) => {
    if (!picker) return;
    if (picker.kind === "customer") setCustomer(entry);
    else if (picker.kind === "contact") setContact(entry);
    else if (picker.kind === "project") setProject(entry);
    else if (picker.kind === "product") setLine(picker.line, { product: entry, description: entry.name });
    setPicker(null);
  };
  const entries = !picker
    ? []
    : picker.kind === "customer"
      ? CUSTOMERS
      : picker.kind === "contact"
        ? CONTACTS
        : picker.kind === "project"
          ? PROJECTS
          : PRODUCTS;

  return (
    <div className="raw-voucher">
      <div className="raw-row">
        <h1>Ny ordre</h1>
        <label className="raw-check">
          <input type="checkbox" role="switch" checked={simple} onChange={(e) => setSimple(e.target.checked)} />
          Enkel fakturering
        </label>
      </div>

      <section>
        <h2>Kundeinformasjon</h2>
        <div className="raw-row">
          <label>
            Kunde
            <RawListbox value={customer} empty="(Velg kunde)" onOpen={() => setPicker({ kind: "customer" })} />
          </label>
          <label>
            Kontaktperson
            <RawListbox value={contact} empty="(Ikke valgt)" onOpen={() => setPicker({ kind: "contact" })} />
          </label>
          <label>
            Prosjekt
            <RawListbox value={project} empty="(Ikke valgt)" onOpen={() => setPicker({ kind: "project" })} />
          </label>
        </div>
      </section>

      <section>
        <h2>Ordre-/fakturadetaljer</h2>
        <div className="raw-row">
          <label>
            Ordredato
            <input type="text" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </label>
          <label>
            Referanse
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        </div>
      </section>

      <section>
        <h2>Leveringsinformasjon</h2>
        <label>
          Leveringsdato
          <input type="text" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
        </label>
      </section>

      <section>
        <h2>Ordrelinjer - presentasjon</h2>
        <label className="raw-check">
          <input type="checkbox" defaultChecked />
          Vis produktnummer
        </label>
      </section>

      <section>
        <h2>Ordrelinjer</h2>
        <table className="raw-table">
          <thead>
            <tr>
              <th>Beskrivelse</th>
              <th>Antall</th>
              <th>Enhetspris</th>
              <th>Påslag (%)</th>
              <th>Rabatt (%)</th>
              <th>Beløp</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td>
                  <RawListbox
                    value={line.product}
                    empty="(Velg produkt)"
                    onOpen={() => setPicker({ kind: "product", line: index })}
                  />
                  <textarea
                    placeholder="Beskriv uten å velge produkt"
                    value={line.description}
                    onChange={(e) => setLine(index, { description: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    placeholder=""
                    value={line.quantity}
                    onChange={(e) => setLine(index, { quantity: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    placeholder=""
                    value={line.unitPrice}
                    onChange={(e) => setLine(index, { unitPrice: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    placeholder=""
                    value={line.markup}
                    onChange={(e) => setLine(index, { markup: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    placeholder=""
                    value={line.discount}
                    onChange={(e) => setLine(index, { discount: e.target.value })}
                  />
                </td>
                <td>
                  <input type="text" placeholder="" readOnly value={lineMinor(line) ? fmt(lineMinor(line)) : ""} />
                </td>
                <td>
                  <button
                    type="button"
                    className="raw-icon"
                    onClick={() => setLines((all) => all.filter((_, i) => i !== index))}
                  >
                    close
                  </button>
                  <button type="button" className="raw-icon" onClick={() => setLines((all) => [...all, { ...line }])}>
                    content_copy
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="raw-row">
          <button type="button" className="raw-link" onClick={() => setLines((all) => [...all, emptyLine()])}>
            Ny rad
          </button>
          <button type="button" className="raw-link">
            Ny gruppering
          </button>
        </div>
      </section>

      <section>
        <h2>Totalt</h2>
        <div className="raw-row">
          <span>Sum ekskl. mva {fmt(totals.netMinor)}</span>
          <span>
            Mva {VAT_RATE} % {fmt(totals.vatMinor)}
          </span>
          <span>Totalt {fmt(totals.grossMinor)}</span>
        </div>
      </section>

      <div className="raw-footer">
        <button type="button" className="raw-primary" disabled={created} onClick={() => setCreated(true)}>
          Opprett
        </button>
        <span>{created ? "Ordren er opprettet." : ""}</span>
      </div>

      {picker ? (
        <RawPickDialog
          entries={entries}
          columns={picker.kind === "customer" ? ["Type", "Nummer", "Navn"] : ["Navn"]}
          onPick={pick}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
}
