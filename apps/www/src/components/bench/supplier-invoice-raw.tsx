import { useState } from "react";

import { RawListbox, RawPickDialog, type PickEntry } from "./raw-picker";

/**
 * Supplier invoice, detailed entry, rebuilt for the head-to-head from a
 * read-only DOM map of a large ERP's screen. Neutral look, invented data.
 * Patterns kept:
 *
 * - supplier and currency pickers are `div role="listbox"` named
 *   "[object Object] (Ikke valgt)" / "[object Object] NOK"
 * - labelled text inputs: Fakturanummer, Beskrivelse, Fakturadato,
 *   Forfallsdato, Totalt beløp, Beløp NOK *, KID-nummer/melding (maks 35 tegn)
 * - order line: Kostnadskonto and Mva listbox pickers, four inputs with an
 *   empty placeholder and no label, a native select and a `button
 *   role="combobox"` with no name, two unlabeled checkboxes
 * - Betaling: Innland/Utland radios, debit bank account and IBAN/kontonummer
 *   pickers
 * - icon buttons named by their ligature ("delete", "edit", "tune",
 *   "expand_more", "more_vert", "date_range")
 * - "Bokfør nå" ticked by default, so "Opprett" posts at once
 *
 * Not observed: the content of the Merverdiavgift section and of the pick
 * dialogs on this screen; both follow the voucher screen's patterns.
 */

const SUPPLIERS: PickEntry[] = [
  { type: "Leverandør", number: "20002", name: "Nordlys Eiendom AS" },
  { type: "Leverandør", number: "20003", name: "Fjordkraft Strøm AS" },
  { type: "Leverandør", number: "20001", name: "Kontorrekvisita AS" },
  { type: "Leverandør", number: "20004", name: "Kontorservice Vest AS" },
  { type: "Leverandør", number: "20005", name: "Datahjelp Norge AS" },
];

const ACCOUNTS: PickEntry[] = [
  ["4000", "Innkjøp av råvarer og halvfabrikata"],
  ["6300", "Leie lokale"],
  ["6340", "Lys, varme"],
  ["6540", "Inventar"],
  ["6800", "Kontorrekvisita"],
  ["6810", "Datakostnader"],
  ["6860", "Møte, kurs, oppdatering"],
  ["7140", "Reisekostnad, ikke opplysningspliktig"],
  ["7770", "Bank- og kortgebyrer"],
].map(([number, name]) => ({ type: "Konto", number, name: name! }));

const VAT: PickEntry[] = [
  "0: (0%) Ingen avgiftsbehandling",
  "1: (25%) Fradrag inngående avgift, høy sats",
  "11: (15%) Fradrag inngående avgift, middels sats",
  "13: (12%) Fradrag inngående avgift, lav sats",
  "14: (25%) Fradrag inngående avgift ved innførsel",
].map((name) => ({ name }));

const BANK: PickEntry[] = [{ name: "1920 Bankinnskudd" }, { name: "1950 Bankinnskudd for skattetrekk" }];

type Line = {
  account: PickEntry | null;
  vat: PickEntry;
  quantity: string;
  net: string;
  vatAmount: string;
  gross: string;
};

export type RawSupplierInvoiceState = {
  supplier: PickEntry | null;
  invoiceNumber: string;
  description: string;
  invoiceDate: string;
  dueDate: string;
  total: string;
  totalNok: string;
  kid: string;
  lines: Line[];
  postNow: boolean;
  posted: boolean;
};

type Picker = { kind: "supplier" | "currency" | "bank" | "iban" } | { kind: "account" | "vat"; line: number } | null;

const emptyLine = (): Line => ({ account: null, vat: VAT[0]!, quantity: "", net: "", vatAmount: "", gross: "" });

export function SupplierInvoiceRaw() {
  const [supplier, setSupplier] = useState<PickEntry | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [description, setDescription] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [total, setTotal] = useState("");
  const [totalNok, setTotalNok] = useState("");
  const [kid, setKid] = useState("");
  const [bank, setBank] = useState<PickEntry | null>(BANK[0]!);
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [postNow, setPostNow] = useState(true);
  const [posted, setPosted] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);

  // For the benchmark's end-state checks only. A real agent never sees this.
  (window as unknown as { __rawSupplierInvoice?: RawSupplierInvoiceState }).__rawSupplierInvoice = {
    supplier,
    invoiceNumber,
    description,
    invoiceDate,
    dueDate,
    total,
    totalNok,
    kid,
    lines,
    postNow,
    posted,
  };

  const setLine = (index: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const pick = (entry: PickEntry) => {
    if (!picker) return;
    if (picker.kind === "supplier") setSupplier(entry);
    else if (picker.kind === "bank") setBank(entry);
    else if (picker.kind === "account") setLine(picker.line, { account: entry });
    else if (picker.kind === "vat") setLine(picker.line, { vat: entry });
    setPicker(null);
  };

  const entries = !picker
    ? []
    : picker.kind === "supplier"
      ? SUPPLIERS
      : picker.kind === "account"
        ? ACCOUNTS
        : picker.kind === "vat"
          ? VAT
          : picker.kind === "currency"
            ? [{ name: "NOK" }, { name: "EUR" }, { name: "SEK" }]
            : BANK;

  return (
    <div className="raw-voucher">
      <div className="raw-row">
        <h1>Registrer leverandørfaktura</h1>
        <button type="button" className="raw-icon">
          tune
        </button>
        <button type="button" className="raw-icon">
          more_vert
        </button>
      </div>

      <section>
        <h2>Fakturadetaljer</h2>
        <div className="raw-row">
          <label>
            Leverandør
            <RawListbox value={supplier} empty="(Ikke valgt)" onOpen={() => setPicker({ kind: "supplier" })} />
          </label>
          <button type="button" className="raw-icon">
            edit
          </button>
          <label>
            Fakturanummer
            <input type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </label>
          <label>
            Beskrivelse
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <div className="raw-row">
          <label>
            Fakturadato
            <input type="text" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </label>
          <button type="button" className="raw-icon">
            date_range
          </button>
          <label>
            Forfallsdato
            <input type="text" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <button type="button" className="raw-icon">
            date_range
          </button>
        </div>
        <div className="raw-row">
          <label>
            Valuta
            <RawListbox value={{ name: "NOK" }} empty="" onOpen={() => setPicker({ kind: "currency" })} />
          </label>
          <label>
            Totalt beløp
            <input
              type="text"
              value={total}
              onChange={(e) => {
                setTotal(e.target.value);
                setTotalNok(e.target.value);
              }}
            />
          </label>
          <label>
            Beløp NOK *
            <input type="text" value={totalNok} onChange={(e) => setTotalNok(e.target.value)} />
          </label>
        </div>
      </section>

      <section>
        <h2>Merverdiavgift</h2>
        <div className="raw-row">
          <span>Mva beregnes fra ordrelinjene.</span>
          <button type="button" className="raw-icon">
            expand_more
          </button>
        </div>
      </section>

      <section>
        <h2>Ordrelinjer</h2>
        <div className="raw-grid raw-head">
          <span>Kostnadskonto</span>
          <span>Mva</span>
          <span>Antall</span>
          <span>Beløp ekskl. mva</span>
          <span />
        </div>
        {lines.map((line, index) => (
          <div key={index} className="raw-stack">
            <div className="raw-grid">
              <RawListbox
                value={line.account}
                empty="(Ikke valgt)"
                onOpen={() => setPicker({ kind: "account", line: index })}
              />
              <RawListbox value={line.vat} empty="" onOpen={() => setPicker({ kind: "vat", line: index })} />
              <input
                type="text"
                placeholder=""
                value={line.quantity}
                onChange={(e) => setLine(index, { quantity: e.target.value })}
              />
              <input
                type="text"
                placeholder=""
                value={line.net}
                onChange={(e) => setLine(index, { net: e.target.value })}
              />
              <button
                type="button"
                className="raw-icon"
                onClick={() => setLines((all) => all.filter((_, i) => i !== index))}
              >
                delete
              </button>
            </div>
            <div className="raw-row">
              <input
                type="text"
                placeholder=""
                value={line.vatAmount}
                onChange={(e) => setLine(index, { vatAmount: e.target.value })}
              />
              <input
                type="text"
                placeholder=""
                value={line.gross}
                onChange={(e) => setLine(index, { gross: e.target.value })}
              />
              <select defaultValue="">
                <option value="">Ingen</option>
                <option value="1">Avdeling 1</option>
              </select>
              <button type="button" role="combobox" aria-expanded={false} className="raw-icon">
                ▾
              </button>
              <input type="checkbox" />
              <input type="checkbox" />
            </div>
          </div>
        ))}
        <button type="button" className="raw-link" onClick={() => setLines((all) => [...all, emptyLine()])}>
          Ny linje
        </button>
      </section>

      <section>
        <h2>Betaling</h2>
        <div className="raw-row">
          <label className="raw-check">
            <input type="radio" name="payment-kind" defaultChecked /> Innland
          </label>
          <label className="raw-check">
            <input type="radio" name="payment-kind" /> Utland
          </label>
        </div>
        <div className="raw-row">
          <label>
            Belast konto
            <RawListbox value={bank} empty="(Ikke valgt)" onOpen={() => setPicker({ kind: "bank" })} />
          </label>
          <label>
            IBAN/kontonummer
            <RawListbox value={null} empty="(Ikke valgt)" onOpen={() => setPicker({ kind: "iban" })} />
          </label>
          <label>
            KID-nummer/melding (maks 35 tegn)
            <input type="text" maxLength={35} value={kid} onChange={(e) => setKid(e.target.value)} />
          </label>
        </div>
      </section>

      <section>
        <h2>Bokføring</h2>
        <label className="raw-check">
          <input type="checkbox" checked={postNow} onChange={(e) => setPostNow(e.target.checked)} />
          Bokfør nå
        </label>
      </section>

      <div className="raw-footer">
        <button type="button" className="raw-primary" disabled={posted} onClick={() => postNow && setPosted(true)}>
          Opprett
        </button>
        <span>{posted ? "Fakturaen er bokført." : ""}</span>
      </div>

      {picker ? (
        <RawPickDialog
          entries={entries}
          columns={picker.kind === "supplier" || picker.kind === "account" ? ["Type", "Nummer", "Navn"] : ["Navn"]}
          onPick={pick}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  );
}
