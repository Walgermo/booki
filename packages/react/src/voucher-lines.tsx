import { formatMoney, minorDigitsFor, money } from "@booki-aui/core/money";
import { sumVoucher, type VoucherLine } from "@booki-aui/core/voucher";
import { useBookiLocaleOptional } from "./locale.js";

export type VoucherLinesProps = {
  lines: VoucherLine[];
  className?: string;
};

function VoucherLines({ lines, className }: VoucherLinesProps) {
  const { profile } = useBookiLocaleOptional();
  const balance = sumVoucher(lines);
  // Extra columns appear only when a line uses them, so simple vouchers stay simple.
  const showVat = lines.some((line) => line.vatCode);
  const showDimensions = lines.some(
    (line) => line.department || line.project || line.foreign || Object.keys(line.dimensions ?? {}).length > 0,
  );
  const lead = 2 + (showVat ? 1 : 0) + (showDimensions ? 1 : 0);

  function fmt(minor: number) {
    return formatMoney(money(minor, profile.currency), {
      locale: profile.locale,
    });
  }

  return (
    <div data-slot="voucher-lines" className={className}>
      <table data-slot="voucher-lines-table">
        <thead>
          <tr>
            <th>{profile.copy.account}</th>
            <th>{profile.copy.accountName}</th>
            {showVat ? <th>{profile.tax.label}</th> : null}
            {showDimensions ? <th>{profile.copy.dimensions}</th> : null}
            <th data-align="end">{profile.copy.debit}</th>
            <th data-align="end">{profile.copy.credit}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td data-slot="voucher-account">{line.account}</td>
              <td>
                {line.accountName}
                {line.dims ? <div data-slot="voucher-dims">{line.dims}</div> : null}
              </td>
              {showVat ? <td data-slot="voucher-vat">{line.vatCode ?? "—"}</td> : null}
              {showDimensions ? (
                <td data-slot="voucher-dimensions">
                  {[
                    line.department,
                    line.project,
                    ...Object.values(line.dimensions ?? {}),
                    line.foreign
                      ? `${line.foreign.currency} ${(line.foreign.amountMinor / 10 ** minorDigitsFor(line.foreign.currency)).toFixed(minorDigitsFor(line.foreign.currency))}`
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </td>
              ) : null}
              <td data-align="end" data-slot="voucher-debit">
                {line.debitMinor ? fmt(line.debitMinor) : "—"}
              </td>
              <td data-align="end" data-slot="voucher-credit">
                {line.creditMinor ? fmt(line.creditMinor) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr data-balanced={balance.balanced ? "true" : "false"}>
            <td colSpan={lead}>{balance.balanced ? profile.copy.balanced : profile.copy.unbalanced}</td>
            <td data-align="end">{fmt(balance.debitMinor)}</td>
            <td data-align="end">{fmt(balance.creditMinor)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export { VoucherLines };
export type { VoucherLine };
