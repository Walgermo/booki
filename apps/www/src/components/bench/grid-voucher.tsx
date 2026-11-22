import { useState } from "react";

/**
 * A second voucher screen for the head-to-head, modelled on the other common
 * way ERP products build voucher entry: an editable spreadsheet grid. Neutral
 * look, invented data. Patterns kept from mapping one, read-only:
 *
 * - a plain `<table>` (no `role="grid"`); cells hold text, not inputs
 * - clicking a cell puts one floating editor over it: an `<input
 *   role="combobox">` with no label, so which column it edits is visual only
 * - VAT comes from the account; its columns are hidden by default
 * - one primary action, "Lagre og bokfør", saves and posts in one step
 *
 * Not observed (it needs typing): the account lookup list. It is modelled
 * here as a plain list under the editor.
 */

type Column = "date" | "debit" | "credit" | "amount" | "description";
type Row = Record<Column, string>;

const ACCOUNTS: [string, string, number][] = [
  ["1500", "Kundefordringer", 0],
  ["1920", "Bankinnskudd", 0],
  ["2400", "Leverandørgjeld", 0],
  ["2710", "Inngående mva, høy sats", 0],
  ["3000", "Salgsinntekt, avgiftspliktig", 25],
  ["6300", "Leie lokale", 25],
  ["6540", "Inventar", 25],
  ["6800", "Kontorrekvisita", 25],
  ["6810", "Datakostnader", 25],
  ["7770", "Bank- og kortgebyrer", 0],
];

const COLUMNS: { key: Column | "number" | "net"; label: string; editable: boolean }[] = [
  { key: "number", label: "Bilagsnr.", editable: false },
  { key: "date", label: "Dato", editable: true },
  { key: "debit", label: "Debet", editable: true },
  { key: "credit", label: "Kredit", editable: true },
  { key: "amount", label: "Beløp", editable: true },
  { key: "net", label: "Netto", editable: false },
  { key: "description", label: "Beskrivelse", editable: true },
];

const empty = (): Row => ({ date: "", debit: "", credit: "", amount: "", description: "" });
const minor = (text: string) => {
  const value = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
};
const fmt = (value: number) =>
  (value / 100).toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rate = (account: string) => ACCOUNTS.find(([number]) => account.startsWith(number))?.[2] ?? 0;

export type GridVoucherState = { rows: Row[]; posted: boolean };

export function GridVoucher() {
  const [rows, setRows] = useState<Row[]>([empty()]);
  const [editing, setEditing] = useState<{ row: number; column: Column } | null>(null);
  const [draft, setDraft] = useState("");
  const [posted, setPosted] = useState(false);

  // For the benchmark's end-state checks only.
  (window as unknown as { __gridVoucher?: GridVoucherState }).__gridVoucher = { rows, posted };

  const commit = (value = draft) => {
    if (!editing) return;
    setRows((current) => {
      const next = current.map((row, index) => (index === editing.row ? { ...row, [editing.column]: value } : row));
      // A filled last row gets a new empty one under it, as spreadsheet grids do.
      const last = next[next.length - 1]!;
      return last.debit || last.credit || last.amount ? [...next, empty()] : next;
    });
    setEditing(null);
    setDraft("");
  };
  const open = (row: number, column: Column) => {
    if (editing) commit();
    setEditing({ row, column });
    setDraft(rows[row]?.[column] ?? "");
  };

  const lookup =
    editing && (editing.column === "debit" || editing.column === "credit")
      ? ACCOUNTS.filter(
          ([number, name]) => draft && (number.startsWith(draft) || name.toLowerCase().includes(draft.toLowerCase())),
        )
      : [];

  const debit = rows.reduce((sum, row) => sum + (row.debit ? minor(row.amount) : 0), 0);
  const credit = rows.reduce((sum, row) => sum + (row.credit ? minor(row.amount) : 0), 0);
  const inputVat = rows.reduce((sum, row) => {
    const r = rate(row.debit);
    return sum + (r ? Math.round((minor(row.amount) * r) / (100 + r)) : 0);
  }, 0);

  return (
    <div className="grid-voucher">
      <div className="grid-voucher__head">
        <div>
          <span className="grid-voucher__crumb">Regnskap</span>
          <h1>Bilagsføring</h1>
        </div>
        <div className="raw-row">
          <button type="button" className="raw-icon">
            more_horiz
          </button>
          <button
            type="button"
            className="raw-primary"
            disabled={posted}
            onClick={() => {
              commit();
              setPosted(true);
            }}
          >
            Lagre og bokfør
          </button>
          <button type="button" className="raw-icon">
            expand_more
          </button>
        </div>
      </div>

      <table className="grid-voucher__table">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {COLUMNS.map((column) => {
                const key = column.key;
                const isEditing = editing?.row === index && editing.column === key;
                let text = "";
                if (key === "number") text = row.debit || row.credit ? "1" : "";
                else if (key === "net") {
                  const r = rate(row.debit);
                  text = row.amount ? fmt(Math.round((minor(row.amount) * 100) / (100 + r))) : "";
                } else {
                  const value = row[key];
                  const account =
                    (key === "debit" || key === "credit") && value
                      ? ACCOUNTS.find(([number]) => number === value)
                      : undefined;
                  text = account ? `${account[0]} - ${account[1]}` : value;
                }
                return (
                  <td
                    key={key}
                    tabIndex={1}
                    onMouseDown={(event) => {
                      if (!column.editable || isEditing) return;
                      // Open on press, before the open editor blurs, so one click moves the editor.
                      event.preventDefault();
                      open(index, key as Column);
                    }}
                  >
                    {isEditing ? (
                      <div className="grid-voucher__editor">
                        <input
                          role="combobox"
                          autoFocus
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onBlur={() => lookup.length === 0 && commit()}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") commit(lookup[0]?.[0] ?? draft);
                            if (event.key === "Escape") {
                              setEditing(null);
                              setDraft("");
                            }
                          }}
                        />
                        <span aria-hidden>search</span>
                        {lookup.length > 0 ? (
                          <div className="grid-voucher__lookup">
                            {lookup.map(([number, name]) => (
                              <div
                                key={number}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  commit(number);
                                }}
                              >
                                {number} - {name}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      text
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid-voucher__sums">
        <div>
          <span>Sum debet</span>
          {fmt(debit)}
        </div>
        <div>
          <span>Sum kredit</span>
          {fmt(credit)}
        </div>
        <div>
          <span>Differanse</span>
          {fmt(debit - credit)}
        </div>
        <div>
          <span>Inng.mva</span>
          {fmt(inputVat)}
        </div>
        <div>
          <span>Utg.mva</span>
          {fmt(0)}
        </div>
      </div>
      <p>{posted ? "Bilaget er bokført." : ""}</p>
    </div>
  );
}
