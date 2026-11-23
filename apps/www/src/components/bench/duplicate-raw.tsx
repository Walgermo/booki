import { useState } from "react";
import { useEndState } from "./end-state";

import { POSTED_INVOICES } from "./hard-data";

/**
 * Supplier invoice entry on a plain page: the invoices already booked as a
 * table, and a form for a new invoice under it. Built for the benchmark, not a
 * map of a product's screen. Neutral look, invented data. Nothing on the page
 * warns when the invoice being entered is already in the table: "Bokfør faktura"
 * appends it to the table when it is clicked, whatever the table says.
 */

export type LedgerRow = {
  invoiceNumber: string;
  supplier: string;
  voucherId: string;
  grossMinor: number;
};

export type RawDuplicateState = {
  ledger: LedgerRow[];
  draft: { posted: boolean };
  status: "new" | "posted";
};

const nb = (minor: number) =>
  (minor / 100).toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, " ");

/** An amount as typed in Norwegian form, "15500,00" or "15 500,00", in minor units. */
const minorOf = (text: string) => {
  const t = text.replace(/[\s ]/g, "").replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : 0;
};

export function DuplicateRaw() {
  const [ledger, setLedger] = useState<LedgerRow[]>(() =>
    POSTED_INVOICES.map((invoice) => ({
      invoiceNumber: invoice.invoiceNumber,
      supplier: invoice.supplier,
      voucherId: invoice.voucherId,
      grossMinor: invoice.grossMinor,
    })),
  );
  const [supplier, setSupplier] = useState("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState("");
  const [gross, setGross] = useState("");
  const [account, setAccount] = useState("");
  const [vatCode, setVatCode] = useState("");
  const [posted, setPosted] = useState(false);

  // For the benchmark's end-state checks only. A real agent never sees this.
  useEndState<RawDuplicateState>("__rawDuplicate", {
    ledger,
    draft: { posted },
    status: posted ? "posted" : "new",
  });

  const post = () => {
    setLedger((all) => [
      ...all,
      {
        invoiceNumber: number.trim(),
        supplier: supplier.trim(),
        voucherId: `v-${100 + all.length + 1}`,
        grossMinor: minorOf(gross),
      },
    ]);
    setPosted(true);
  };

  return (
    <div className="raw-voucher">
      <div className="raw-row">
        <h1>Registrer leverandørfaktura</h1>
        <button type="button" className="raw-icon">
          more_vert
        </button>
      </div>

      <section aria-label="Bokførte fakturaer">
        <h2>Bokførte fakturaer</h2>
        <table className="raw-table">
          <thead>
            <tr>
              <th>Fakturanummer</th>
              <th>Leverandør</th>
              <th>Beløp</th>
              <th>Bilag</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((row) => (
              <tr key={row.voucherId}>
                <td>{row.invoiceNumber}</td>
                <td>{row.supplier}</td>
                <td>{nb(row.grossMinor)}</td>
                <td>{row.voucherId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-label="Ny faktura">
        <h2>Ny faktura</h2>
        <div className="raw-row">
          <label>
            Leverandør
            <input type="text" value={supplier} readOnly={posted} onChange={(e) => setSupplier(e.target.value)} />
          </label>
          <label>
            Fakturanummer
            <input type="text" value={number} readOnly={posted} onChange={(e) => setNumber(e.target.value)} />
          </label>
          <label>
            Fakturadato
            <input type="text" value={date} readOnly={posted} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <div className="raw-row">
          <label>
            Totalt beløp
            <input type="text" value={gross} readOnly={posted} onChange={(e) => setGross(e.target.value)} />
          </label>
          <label>
            Konto
            <input type="text" value={account} readOnly={posted} onChange={(e) => setAccount(e.target.value)} />
          </label>
          <label>
            Mva-kode
            <input type="text" value={vatCode} readOnly={posted} onChange={(e) => setVatCode(e.target.value)} />
          </label>
        </div>
        <div className="raw-footer">
          <button type="button" className="raw-primary" disabled={posted} onClick={post}>
            Bokfør faktura
          </button>
          <span>{posted ? "Fakturaen er bokført." : ""}</span>
        </div>
      </section>
    </div>
  );
}
