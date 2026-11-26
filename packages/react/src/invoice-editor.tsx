import {
  lineNetMinor,
  taxBasisPoints,
  TAX_CATEGORIES,
  type Invoice,
  type InvoiceLine,
  type InvoiceTotals,
  type TaxCategory,
} from "@booki-aui/core/invoice";
import type { BookiChangeDetails } from "./change-details.js";
import { formatMoney, money } from "@booki-aui/core/money";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import { useAccessFor } from "./access.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { useWorkflowCopy } from "./workflow-copy.js";
import { invoiceEditor } from "@booki-aui/primitives/invoice-editor";

const TAGS = {
  root: "div",
  cell: "input",
  tax: "select",
  add: "button",
  remove: "button",
  finalize: "button",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof invoiceEditor, typeof TAGS> = createParts(invoiceEditor, TAGS);
const InvoiceEditorRoot: (typeof parts)["Root"] = parts.Root;
const InvoiceEditorCell: (typeof parts)["Cell"] = parts.Cell;
const InvoiceEditorTax: (typeof parts)["Tax"] = parts.Tax;
const InvoiceEditorAdd: (typeof parts)["Add"] = parts.Add;
const InvoiceEditorRemove: (typeof parts)["Remove"] = parts.Remove;
const InvoiceEditorFinalize: (typeof parts)["Finalize"] = parts.Finalize;

export type InvoiceEditorProps = {
  invoice?: Invoice;
  defaultInvoice?: Invoice;
  others?: Invoice[];
  nextNumber?: string;
  onInvoiceChange?: (invoice: Invoice, details: BookiChangeDetails) => void;
  /** Tax rates offered for category S, in basis points. Defaults to the profile's codes. */
  taxRatesBp?: number[];
  className?: string;
  "aria-label"?: string;
};

type RootState = {
  invoice: Invoice;
  totals: InvoiceTotals;
  issues: string[];
  finalizable: boolean;
  refusal: string;
};
/** Composed invoice: editable lines while it is a draft, totals per tax group, and Finalize. */
function InvoiceEditor({
  invoice,
  defaultInvoice,
  others,
  nextNumber,
  onInvoiceChange,
  taxRatesBp,
  className,
  "aria-label": ariaLabel,
}: InvoiceEditorProps) {
  const copy = useWorkflowCopy();
  const { profile } = useBookiLocaleOptional();
  const say = useSay();
  const access = useAccessFor({ finalize: "invoice.finalize" });
  const rates = taxRatesBp ?? [
    ...new Set(profile.tax.codes.map((code) => taxBasisPoints(code.percent)).filter((bp) => bp > 0)),
  ];

  return (
    <InvoiceEditorRoot
      invoice={invoice}
      defaultInvoice={defaultInvoice}
      others={others}
      nextNumber={nextNumber}
      locale={profile.locale}
      denied={access.denied}
      onInvoiceChange={onInvoiceChange}
      className={className}
      aria-label={ariaLabel ?? ((invoice ?? defaultInvoice)?.kind === "credit-note" ? copy.creditNote : copy.invoice)}
    >
      {(state: RootState) => {
        const doc = state.invoice;
        const draft = doc.status === "draft";
        const fmt = (minor: number) =>
          formatMoney(money(minor, (doc.currency || profile.currency) as typeof profile.currency), {
            locale: profile.locale,
          });
        const taxValue = (line: InvoiceLine) => `${line.taxCategory}:${line.taxRateBp}`;
        const title = doc.kind === "credit-note" ? copy.creditNote : copy.invoice;
        return (
          <>
            <p data-slot="invoice-editor-status" role="status">
              {title} {doc.number ?? ""} · {draft ? copy.draft : copy.finalized}
            </p>
            <table data-slot="invoice-editor-table">
              <thead>
                <tr>
                  <th>{copy.description}</th>
                  <th data-align="end">{copy.quantity}</th>
                  <th data-align="end">{copy.unitPrice}</th>
                  <th data-align="end">{copy.discount}</th>
                  <th>{copy.tax}</th>
                  <th data-align="end">{copy.net}</th>
                  <th>
                    <span data-slot="visually-hidden">{copy.removeLine}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((line, index) => {
                  const row = `${copy.description} ${index + 1}`;
                  let net = 0;
                  try {
                    net = lineNetMinor(line);
                  } catch {
                    /* listed under issues */
                  }
                  return (
                    <tr key={line.id}>
                      <td>
                        <InvoiceEditorCell value={`${line.id}|description`} aria-label={row} />
                      </td>
                      <td>
                        <InvoiceEditorCell
                          value={`${line.id}|quantity`}
                          aria-label={`${copy.quantity} ${index + 1}`}
                          inputMode="decimal"
                          data-align="end"
                        />
                      </td>
                      <td>
                        <InvoiceEditorCell
                          value={`${line.id}|unitPrice`}
                          aria-label={`${copy.unitPrice} ${index + 1}`}
                          inputMode="decimal"
                          data-align="end"
                        />
                      </td>
                      <td>
                        <InvoiceEditorCell
                          value={`${line.id}|discount`}
                          aria-label={`${copy.discount} ${index + 1}`}
                          inputMode="decimal"
                          data-align="end"
                        />
                      </td>
                      <td>
                        <InvoiceEditorTax value={line.id} aria-label={`${copy.tax} ${index + 1}`}>
                          {[
                            ...new Set([
                              ...rates.map((bp) => `S:${bp}`),
                              ...TAX_CATEGORIES.filter((c) => c !== "S").map((c) => `${c}:0`),
                              taxValue(line),
                            ]),
                          ].map((value) => {
                            const [category, rate] = value.split(":");
                            return (
                              <option key={value} value={value}>
                                {category === "S" ? `${Number(rate) / 100}%` : category}
                              </option>
                            );
                          })}
                        </InvoiceEditorTax>
                      </td>
                      <td data-align="end" data-slot="invoice-editor-amount">
                        {fmt(net)}
                      </td>
                      <td>
                        {draft ? (
                          <InvoiceEditorRemove value={line.id} aria-label={`${copy.removeLine} ${index + 1}`}>
                            {copy.remove}
                          </InvoiceEditorRemove>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={5} scope="row">
                    {copy.net}
                  </th>
                  <td data-align="end" data-slot="invoice-editor-amount">
                    {fmt(state.totals.netMinor)}
                  </td>
                  <td />
                </tr>
                {state.totals.groups
                  .filter((group) => group.taxMinor !== 0)
                  .map((group) => (
                    <tr key={`${group.taxCategory}:${group.taxRateBp}`}>
                      <th colSpan={5} scope="row">
                        {copy.tax} {group.taxRateBp / 100}%
                      </th>
                      <td data-align="end" data-slot="invoice-editor-amount">
                        {fmt(group.taxMinor)}
                      </td>
                      <td />
                    </tr>
                  ))}
                <tr data-slot="invoice-editor-total">
                  <th colSpan={5} scope="row">
                    {copy.gross}
                  </th>
                  <td data-align="end" data-slot="invoice-editor-amount">
                    {fmt(state.totals.grossMinor)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
            <label data-slot="invoice-editor-tax-id">
              <span>{copy.customerTaxId}</span>
              <InvoiceEditorCell value="|taxId" aria-label={copy.customerTaxId} />
            </label>
            {draft && state.issues.length > 0 ? (
              <ul data-slot="invoice-editor-issues" aria-label={copy.issues}>
                {state.issues.map((issue) => (
                  <li key={issue}>{say(issue)}</li>
                ))}
              </ul>
            ) : null}
            {draft ? (
              <div data-slot="invoice-editor-actions">
                <InvoiceEditorAdd>{copy.addLine}</InvoiceEditorAdd>
                <InvoiceEditorFinalize disabled={!state.finalizable}>{copy.finalize}</InvoiceEditorFinalize>
              </div>
            ) : null}
            {state.refusal ? (
              <p data-slot="invoice-editor-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </InvoiceEditorRoot>
  );
}

export {
  InvoiceEditor,
  InvoiceEditorAdd,
  InvoiceEditorCell,
  InvoiceEditorFinalize,
  InvoiceEditorRemove,
  InvoiceEditorRoot,
  InvoiceEditorTax,
  invoiceEditor,
};
export type { Invoice, InvoiceLine, TaxCategory };

export { type InvoiceLinePatch } from "@booki-aui/primitives/invoice-editor";
