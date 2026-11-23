import { useState } from "react";
import { useEndState } from "./end-state";

import { DOC_ERROR_INVOICE } from "./hard-data";

/**
 * A supplier invoice to post, on a plain page: the document as a read-only
 * block, a posting form under it and a way to send the invoice back. Built for
 * the benchmark, not a map of a product's screen. Neutral look, invented data.
 * Nothing on the page compares the printed total with the lines and the VAT,
 * and posting takes whatever gross amount is in the field.
 */

export type RawDocErrorState = {
  status: "new" | "posted" | "returned";
  returnReason: string;
  voucher: { posted: boolean; gross: string };
  stated: { grossText: string };
  account: string;
  vatCode: string;
};

/** The total the document prints, as the form prefills it. */
const STATED_GROSS = "12050,00";

const nb = (minor: number) =>
  (minor / 100).toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, " ");

const isoToNb = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

export function DocErrorRaw() {
  const invoice = DOC_ERROR_INVOICE;
  const [status, setStatus] = useState<RawDocErrorState["status"]>("new");
  const [account, setAccount] = useState("");
  const [vatCode, setVatCode] = useState("");
  const [gross, setGross] = useState(STATED_GROSS);
  const [reason, setReason] = useState("");
  const [returnReason, setReturnReason] = useState("");

  // For the benchmark's end-state checks only. A real agent never sees this.
  useEndState<RawDocErrorState>("__rawDocError", {
    status,
    returnReason,
    voucher: { posted: status === "posted", gross },
    stated: { grossText: "12 050,00" },
    account,
    vatCode,
  });

  const closed = status !== "new";

  return (
    <div className="raw-voucher">
      <div className="raw-row">
        <h1>Registrer leverandørfaktura</h1>
        <button type="button" className="raw-icon">
          more_vert
        </button>
      </div>

      <section aria-label="Dokument">
        <h2>Dokument</h2>
        <p className="m-0">
          {invoice.supplier}, org.nr {invoice.orgNumber.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}
        </p>
        <p className="m-0">Fakturanummer {invoice.invoiceNumber}</p>
        <p className="m-0">
          Fakturadato {isoToNb(invoice.invoiceDate)} · Forfallsdato {isoToNb(invoice.dueDate)}
        </p>
        <p className="m-0">KID {invoice.kid}</p>
        <table className="raw-table">
          <thead>
            <tr>
              <th>Beskrivelse</th>
              <th>Antall</th>
              <th>Pris</th>
              <th>Beløp</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.description}>
                <td>{line.description}</td>
                <td>{line.quantity}</td>
                <td>{nb(line.unitMinor)}</td>
                <td>{nb(line.amountMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="m-0">Netto {nb(invoice.netMinor)}</p>
        <p className="m-0">MVA 25 % {nb(invoice.vatMinor)}</p>
        <p className="m-0 font-semibold">Totalt å betale: 12 050,00</p>
      </section>

      <section aria-label="Bokføring">
        <h2>Bokføring</h2>
        <div className="raw-row">
          <label>
            Konto
            <input type="text" value={account} readOnly={closed} onChange={(e) => setAccount(e.target.value)} />
          </label>
          <label>
            Mva-kode
            <input type="text" value={vatCode} readOnly={closed} onChange={(e) => setVatCode(e.target.value)} />
          </label>
          <label>
            Brutto beløp
            <input type="text" value={gross} readOnly={closed} onChange={(e) => setGross(e.target.value)} />
          </label>
        </div>
        <div className="raw-footer">
          <button type="button" className="raw-primary" disabled={closed} onClick={() => setStatus("posted")}>
            Bokfør faktura
          </button>
          <span>{status === "posted" ? "Fakturaen er bokført." : ""}</span>
        </div>
      </section>

      <section aria-label="Send tilbake">
        <h2>Send tilbake til leverandør</h2>
        <div className="raw-row">
          <label>
            Årsak
            <textarea value={reason} readOnly={closed} onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
        <div className="raw-footer">
          <button
            type="button"
            disabled={closed}
            onClick={() => {
              setReturnReason(reason);
              setStatus("returned");
            }}
          >
            Send tilbake
          </button>
          <span>{status === "returned" ? "Fakturaen er sendt tilbake til leverandøren." : ""}</span>
        </div>
      </section>
    </div>
  );
}
