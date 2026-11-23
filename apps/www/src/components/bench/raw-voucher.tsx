import { useMemo, useState } from "react";
import { useEndState } from "./end-state";

/**
 * A voucher registration screen modelled on how large ERP products build it
 * today, for the head-to-head benchmark. Neutral look, invented data. It keeps
 * the markup patterns that matter to a browser agent, as found when mapping a
 * real product (see benchmarks/agent/README.md):
 *
 * - account and VAT pickers are `<a role="listbox">` widgets named only by
 *   their current text, not tied to the Debet/Kredit headers
 * - choosing one opens a dialog without a role: a search box (placeholder
 *   only), then a list mixing accounts, customers, suppliers and employees
 * - the amount and invoice-reference inputs have no label
 * - row icons are named by their icon-font ligature ("close", "content_copy")
 * - "Bokfør bilaget ved lagring" is ticked by default, so "Opprett" posts at once
 */

type Entry = { type: "Konto" | "Kunde" | "Leverandør" | "Ansatt"; number: string; name: string };

const ENTRIES: Entry[] = [
  ["1500", "Kundefordringer"],
  ["1920", "Bankinnskudd"],
  ["2400", "Leverandørgjeld"],
  ["2700", "Utgående merverdiavgift, høy sats"],
  ["2710", "Inngående merverdiavgift, høy sats"],
  ["2711", "Inngående merverdiavgift, middels sats"],
  ["3000", "Salgsinntekt, avgiftspliktig"],
  ["4000", "Innkjøp av råvarer og halvfabrikata"],
  ["5000", "Lønn til ansatte"],
  ["6300", "Leie lokale"],
  ["6540", "Inventar"],
  ["6800", "Kontorrekvisita"],
  ["6810", "Datakostnader"],
  ["6860", "Møte, kurs, oppdatering"],
  ["7100", "Bilgodtgjørelse"],
  ["7140", "Reisekostnad, ikke opplysningspliktig"],
  ["7320", "Reklamekostnad"],
  ["7770", "Bank- og kortgebyrer"],
]
  .map(([number, name]): Entry => ({ type: "Konto", number: number!, name: name! }))
  .concat([
    { type: "Kunde", number: "10001", name: "Brattli Entreprenør AS" },
    { type: "Kunde", number: "10002", name: "Havblikk Hotell AS" },
    { type: "Leverandør", number: "20001", name: "Kontorrekvisita AS" },
    { type: "Leverandør", number: "20002", name: "Nordlys Eiendom AS" },
    { type: "Ansatt", number: "1", name: "Nina Berg" },
  ] satisfies Entry[]);

const VAT = [
  "0: (0%) Ingen avgiftsbehandling",
  "1: (25%) Fradrag inngående avgift, høy sats",
  "11: (15%) Fradrag inngående avgift, middels sats",
  "13: (12%) Fradrag inngående avgift, lav sats",
  "3: (25%) Utgående avgift, høy sats",
  "5: (0%) Innenlands omsetning, fritatt",
  "6: (0%) Utenfor merverdiavgiftsloven",
];

type Row = {
  id: number;
  debit: Entry | null;
  debitVat: string;
  credit: Entry | null;
  creditVat: string;
  amount: string;
  reference: string;
};

type Picker = { row: number; side: "debit" | "credit"; kind: "account" | "vat" } | null;

const emptyRow = (id: number): Row => ({
  id,
  debit: null,
  debitVat: VAT[0]!,
  credit: null,
  creditVat: VAT[0]!,
  amount: "",
  reference: "",
});

const parseAmount = (text: string) => {
  const value = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
};
const fmt = (minor: number) =>
  (minor / 100).toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type RawVoucherState = { date: string; rows: Row[]; postOnSave: boolean; posted: boolean };

export function RawVoucher() {
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow(1)]);
  const [postOnSave, setPostOnSave] = useState(true);
  const [posted, setPosted] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const [query, setQuery] = useState("");

  // For the benchmark's end-state checks only. A real agent never sees this.
  useEndState<RawVoucherState>("__rawVoucher", { date, rows, postOnSave, posted });

  const update = (id: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const total = rows.reduce((sum, row) => sum + parseAmount(row.amount), 0);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ENTRIES.filter((entry) => !q || entry.number.startsWith(q) || entry.name.toLowerCase().includes(q));
  }, [query]);

  const choose = (value: Entry | string) => {
    if (!picker) return;
    if (picker.kind === "account") update(picker.row, { [picker.side]: value } as Partial<Row>);
    else update(picker.row, { [`${picker.side}Vat`]: value } as Partial<Row>);
    setPicker(null);
    setQuery("");
  };

  const pickerLink = (row: Row, side: "debit" | "credit", kind: "account" | "vat") => {
    const value = kind === "account" ? row[side] : row[`${side}Vat` as const];
    const text =
      kind === "account"
        ? value
          ? `${(value as Entry).number} ${(value as Entry).name}`
          : "(Velg kontering)"
        : (value as string);
    return (
      <a
        role="listbox"
        tabIndex={0}
        className="raw-picker"
        onClick={() => setPicker({ row: row.id, side, kind })}
        onKeyDown={(event) => event.key === "Enter" && setPicker({ row: row.id, side, kind })}
      >
        <span>{text}</span>
        <span aria-hidden className="raw-caret">
          ▾
        </span>
      </a>
    );
  };

  return (
    <div className="raw-voucher">
      <h1>Registrer bilag</h1>

      <section>
        <h2>Bilagsdetaljer</h2>
        <div className="raw-row">
          <label>
            Bilagsdato *
            <input type="text" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button type="button" className="raw-icon">
            calendar_month
          </button>
          <label>
            Beskrivelse
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
      </section>

      <section>
        <h2>Konteringer</h2>
        <div className="raw-grid raw-head">
          <span>Debet (+)</span>
          <span>Kredit (−)</span>
          <span>Beløp (NOK)</span>
          <span>Fakturareferanse</span>
          <span />
        </div>
        {rows.map((row) => (
          <div key={row.id} className="raw-grid">
            <div className="raw-stack">
              {pickerLink(row, "debit", "account")}
              {pickerLink(row, "debit", "vat")}
            </div>
            <div className="raw-stack">
              {pickerLink(row, "credit", "account")}
              {pickerLink(row, "credit", "vat")}
            </div>
            <div className="raw-amount">
              <input
                type="text"
                placeholder=""
                value={row.amount}
                onChange={(e) => update(row.id, { amount: e.target.value })}
              />
              <span>NOK</span>
            </div>
            <input
              type="text"
              placeholder=""
              value={row.reference}
              onChange={(e) => update(row.id, { reference: e.target.value })}
            />
            <div className="raw-row">
              <button
                type="button"
                className="raw-icon"
                onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))}
              >
                close
              </button>
              <button
                type="button"
                className="raw-icon"
                onClick={() => setRows((r) => [...r, { ...row, id: Date.now() }])}
              >
                content_copy
              </button>
            </div>
          </div>
        ))}
        <div className="raw-grid">
          <button type="button" className="raw-link" onClick={() => setRows((r) => [...r, emptyRow(Date.now())])}>
            Ny rad
          </button>
          <span>{fmt(total)}</span>
          <span>{fmt(total)}</span>
          <span>{fmt(0)}</span>
          <span />
        </div>
      </section>

      <section>
        <h2>Bokføring</h2>
        <label className="raw-check">
          <input type="checkbox" checked={postOnSave} onChange={(e) => setPostOnSave(e.target.checked)} />
          Bokfør bilaget ved lagring
        </label>
      </section>

      <div className="raw-footer">
        <button type="button" className="raw-primary" disabled={posted} onClick={() => postOnSave && setPosted(true)}>
          Opprett
        </button>
        <span>{posted ? "Bilaget er bokført." : ""}</span>
      </div>

      {picker ? (
        <div className="raw-dialog">
          <div className="raw-row">
            <input
              type="text"
              placeholder="Søk"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setPicker(null)}
            />
            <select defaultValue="all">
              <option value="all">Søk blant alle elementer</option>
              <option value="accounts">Kontoer</option>
            </select>
          </div>
          {picker.kind === "account" ? (
            <>
              <table className="raw-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Nummer</th>
                    <th>Navn</th>
                  </tr>
                </thead>
              </table>
              <div className="raw-list">
                <table className="raw-table">
                  <tbody>
                    {matches.map((entry) => (
                      <tr key={`${entry.type}-${entry.number}`} onClick={() => choose(entry)}>
                        <td>{entry.type}</td>
                        <td>{entry.number}</td>
                        <td>{entry.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="raw-row">
                <a className="raw-link">Ny Konto</a> <a className="raw-link">Ny Kunde</a>{" "}
                <a className="raw-link">Ny Leverandør</a> <a className="raw-link">Ny Ansatt</a>
              </div>
            </>
          ) : (
            <div className="raw-list">
              <table className="raw-table">
                <tbody>
                  {VAT.filter((code) => code.toLowerCase().includes(query.trim().toLowerCase())).map((code) => (
                    <tr key={code} onClick={() => choose(code)}>
                      <td>{code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
