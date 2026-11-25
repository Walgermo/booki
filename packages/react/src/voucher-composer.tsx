import { formatMoney, money } from "@booki-aui/core/money";
import type { TaxCode } from "@booki-aui/core/locale";
import {
  sumVoucher,
  type AccountOption,
  type DimensionOption,
  type VoucherLine,
  type DimensionDefinition,
} from "@booki-aui/core/voucher";
import type { PeriodState } from "@booki-aui/core/period-lock";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import type { ReactNode } from "react";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { VoucherLines } from "./voucher-lines.js";
import { type RowError, voucherComposer } from "@booki-aui/primitives/voucher-composer";

const TAGS = {
  root: "div",
  accountSelect: "select",
  accountInput: "input",
  nameInput: "input",
  vat: "select",
  department: "select",
  project: "select",
  dimension: "select",
  debit: "input",
  credit: "input",
  remove: "button",
  newAccountSelect: "select",
  newAccountInput: "input",
  add: "button",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof voucherComposer, typeof TAGS> = createParts(voucherComposer, TAGS);
const VoucherComposerRoot: (typeof parts)["Root"] = parts.Root;

/** A select must be able to show the value a line already holds. */
function withCurrent<T>(
  options: T[],
  current: string | undefined,
  codeOf: (option: T) => string,
  make: (code: string) => T,
): T[] {
  return current && !options.some((option) => codeOf(option) === current) ? [...options, make(current)] : options;
}

type EditableLinesProps = {
  lines: VoucherLine[];
  rowError: RowError | null;
  accounts?: AccountOption[];
  taxCodes: TaxCode[];
  departments?: DimensionOption[];
  projects?: DimensionOption[];
  dimensions?: DimensionDefinition[];
};

/**
 * The table a person edits. Every control is a part of the primitive keyed by
 * its line id, and every edit runs the action an agent would call. Rendered
 * inside `VoucherComposerRoot` only.
 */
function EditableLines({
  lines,
  rowError,
  accounts,
  taxCodes,
  departments,
  projects,
  dimensions = [],
}: EditableLinesProps) {
  const { profile } = useBookiLocaleOptional();
  const copy = profile.copy;
  const balance = sumVoucher(lines);
  const listed = dimensions.filter((definition) => definition.options);
  const columns = 6 + (departments ? 1 : 0) + (projects ? 1 : 0) + listed.length;
  const fmt = (minor: number) => formatMoney(money(minor, profile.currency), { locale: profile.locale });
  const say = (error: RowError) => (error.code === "invalid-amount" ? copy.invalidAmount : error.message);

  function dimension(
    Part: typeof parts.Department,
    label: string,
    line: VoucherLine,
    current: string | undefined,
    options: DimensionOption[],
  ) {
    return (
      <td>
        <Part value={line.id} aria-label={label}>
          <option value="">{copy.none}</option>
          {withCurrent(
            options,
            current,
            (option) => option.code,
            (code) => ({ code, name: code }),
          ).map((option) => (
            <option key={option.code} value={option.code}>
              {option.code} {option.name}
            </option>
          ))}
        </Part>
      </td>
    );
  }

  return (
    <div data-slot="voucher-lines" data-editable="true">
      <table data-slot="voucher-lines-table">
        <thead>
          <tr>
            <th>{copy.account}</th>
            <th>{copy.accountName}</th>
            <th>{profile.tax.label}</th>
            {departments ? <th>{copy.department}</th> : null}
            {projects ? <th>{copy.project}</th> : null}
            {listed.map((definition) => (
              <th key={definition.key}>{definition.name}</th>
            ))}
            <th data-align="end">{copy.debit}</th>
            <th data-align="end">{copy.credit}</th>
            <th>
              <span data-slot="visually-hidden">{copy.removeLine}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            // Each control names its row, so a screen reader and the agent
            // bridge can tell one line's debit from the next.
            const row = `${copy.line} ${index + 1}`;
            return [
              <tr key={line.id} data-slot="voucher-line">
                <td>
                  {accounts ? (
                    <parts.AccountSelect value={line.id} aria-label={`${copy.account}, ${row}`}>
                      {withCurrent(
                        accounts,
                        line.account,
                        (option) => option.number,
                        (number) => ({ number, name: line.accountName }),
                      ).map((option) => (
                        <option key={option.number} value={option.number}>
                          {option.number} {option.name}
                        </option>
                      ))}
                    </parts.AccountSelect>
                  ) : (
                    <parts.AccountInput value={line.id} aria-label={`${copy.account}, ${row}`} />
                  )}
                </td>
                <td>
                  {accounts ? (
                    line.accountName
                  ) : (
                    <parts.NameInput value={line.id} aria-label={`${copy.accountName}, ${row}`} />
                  )}
                </td>
                <td>
                  <parts.Vat value={line.id} aria-label={`${profile.tax.label}, ${row}`}>
                    <option value="">{copy.none}</option>
                    {withCurrent(
                      taxCodes,
                      line.vatCode,
                      (tax) => tax.code,
                      (code) => ({ code, label: code, percent: 0 }),
                    ).map((tax) => (
                      <option key={tax.code} value={tax.code}>
                        {tax.label}
                      </option>
                    ))}
                  </parts.Vat>
                </td>
                {departments
                  ? dimension(parts.Department, `${copy.department}, ${row}`, line, line.department, departments)
                  : null}
                {projects
                  ? dimension(
                      // Same shape as the department part; only the slot differs.
                      parts.Project as unknown as typeof parts.Department,
                      `${copy.project}, ${row}`,
                      line,
                      line.project,
                      projects,
                    )
                  : null}
                {listed.map((definition) => (
                  <td key={definition.key}>
                    <parts.Dimension value={`${line.id}|${definition.key}`} aria-label={`${definition.name}, ${row}`}>
                      <option value="">{copy.none}</option>
                      {withCurrent(
                        definition.options ?? [],
                        line.dimensions?.[definition.key],
                        (option) => option.code,
                        (code) => ({ code, name: code }),
                      ).map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.code} {option.name}
                        </option>
                      ))}
                    </parts.Dimension>
                  </td>
                ))}
                <td data-align="end">
                  <parts.Debit value={line.id} aria-label={`${copy.debit}, ${row}`} />
                </td>
                <td data-align="end">
                  <parts.Credit value={line.id} aria-label={`${copy.credit}, ${row}`} />
                </td>
                <td data-align="end">
                  <parts.Remove value={line.id} aria-label={`${copy.removeLine}, ${row}`}>
                    {copy.removeLine}
                  </parts.Remove>
                </td>
              </tr>,
              rowError && rowError.lineId === line.id ? (
                <tr key={`${line.id}:error`} data-slot="voucher-line-error">
                  <td colSpan={columns}>
                    <span role="alert">{say(rowError)}</span>
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
        <tfoot>
          <tr data-balanced={balance.balanced ? "true" : "false"}>
            <td colSpan={columns - 3}>{balance.balanced ? copy.balanced : copy.unbalanced}</td>
            <td data-align="end">{fmt(balance.debitMinor)}</td>
            <td data-align="end">{fmt(balance.creditMinor)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      <div data-slot="voucher-composer-add">
        {accounts ? (
          <parts.NewAccountSelect aria-label={`${copy.addLine}: ${copy.account}`}>
            <option value="">{copy.selectAccount}</option>
            {accounts.map((option) => (
              <option key={option.number} value={option.number}>
                {option.number} {option.name}
              </option>
            ))}
          </parts.NewAccountSelect>
        ) : (
          <parts.NewAccountInput aria-label={`${copy.addLine}: ${copy.account}`} placeholder={copy.account} />
        )}
        <parts.Add>{copy.addLine}</parts.Add>
        {/* A refusal that belongs to no row still on the page lands here. */}
        {rowError && !lines.some((line) => line.id === rowError.lineId) ? (
          <p data-slot="voucher-line-error" role="alert">
            {say(rowError)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export type VoucherComposerProps = {
  lines?: VoucherLine[];
  defaultLines?: VoucherLine[];
  /**
   * Optional closed chart of accounts. When given, `addLine` / `setAccount`
   * reject account numbers not in it and take the name from the chart.
   */
  accounts?: AccountOption[];
  /** VAT codes lines may carry. Defaults to the locale profile's codes. */
  taxCodes?: TaxCode[];
  /** Closed list of departments. */
  departments?: DimensionOption[];
  /** Closed list of projects. */
  projects?: DimensionOption[];
  /** Further dimensions and their closed lists. Agents set them with `setDimension`. */
  dimensions?: DimensionDefinition[];
  /** Closed periods; with `postingDate`, a voucher dated in one is not postable. */
  periods?: PeriodState[];
  postingDate?: string;
  mayAdjustClosed?: boolean;
  /**
   * Let a person edit the lines: account, VAT code, department, project,
   * debit and credit per line, plus add and remove. Every edit runs the same
   * action an agent calls, so the same rules apply; a refused edit leaves the
   * line as it was and shows why next to the row. Off by default (a read-only
   * table).
   */
  editable?: boolean;
  onLinesChange?: (lines: VoucherLine[], details?: { reason: string; source?: string }) => void;
  className?: string;
  "aria-label"?: string;
  /** Optional status strip under the table */
  showStatus?: boolean;
  children?: ReactNode;
};

function VoucherComposer({
  lines,
  defaultLines,
  accounts,
  taxCodes,
  departments,
  projects,
  dimensions,
  periods,
  postingDate,
  mayAdjustClosed,
  editable = false,
  onLinesChange,
  className,
  "aria-label": ariaLabel = "Voucher lines",
  showStatus = true,
  children,
}: VoucherComposerProps) {
  const { profile } = useBookiLocaleOptional();
  const say = useSay();
  const codes = taxCodes ?? profile.tax.codes;

  return (
    <VoucherComposerRoot
      lines={lines}
      defaultLines={defaultLines}
      accounts={accounts}
      taxCodes={codes}
      departments={departments}
      projects={projects}
      dimensions={dimensions}
      periods={periods}
      postingDate={postingDate}
      mayAdjustClosed={mayAdjustClosed}
      currency={profile.currency}
      locale={profile.locale}
      onLinesChange={onLinesChange}
      className={className}
      aria-label={ariaLabel}
    >
      {({
        lines: current,
        balanced,
        debitMinor,
        creditMinor,
        differenceMinor,
        issues,
        rowError,
      }: {
        lines: VoucherLine[];
        balanced: boolean;
        debitMinor: number;
        creditMinor: number;
        differenceMinor: number;
        issues: string[];
        rowError: RowError | null;
      }) => (
        <>
          {editable ? (
            <EditableLines
              lines={current}
              rowError={rowError}
              accounts={accounts}
              taxCodes={codes}
              departments={departments}
              projects={projects}
              dimensions={dimensions}
            />
          ) : (
            <VoucherLines lines={current} />
          )}
          {showStatus ? (
            <p data-slot="voucher-composer-status">
              {balanced
                ? profile.copy.balanced
                : `${profile.copy.unbalanced} (${formatMoney(money(Math.abs(differenceMinor), profile.currency), {
                    locale: profile.locale,
                  })})`}
              {" · "}
              {formatMoney(money(debitMinor, profile.currency), {
                locale: profile.locale,
              })}
              {" / "}
              {formatMoney(money(creditMinor, profile.currency), {
                locale: profile.locale,
              })}
            </p>
          ) : null}
          {showStatus && balanced && current.length > 0 && issues.length > 0 ? (
            <ul data-slot="voucher-composer-issues">
              {issues.map((issue) => (
                <li key={issue}>{say(issue)}</li>
              ))}
            </ul>
          ) : null}
          {children}
        </>
      )}
    </VoucherComposerRoot>
  );
}

export { VoucherComposer, VoucherComposerRoot, voucherComposer };
export type { RowError as VoucherRowError };
export type { AccountOption, DimensionOption, VoucherLine };
