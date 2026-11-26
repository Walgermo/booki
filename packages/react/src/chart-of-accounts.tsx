import type { ReactNode } from "react";
import {
  chartSchemeFor,
  groupAccounts,
  type AccountChange,
  type AccountClass,
  type AccountIssue,
  type AccountType,
  type ChartAccount,
  type ChartScheme,
  type ProposedChange,
} from "@booki-aui/core/chart-of-accounts";
import { matchingRows, type TableColumn, type TableQuery } from "@booki-aui/core/table";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import { useAccessFor } from "./access.js";
import type { BookiChangeDetails } from "./change-details.js";
import { ariaSort, downloadCsv, sortMark } from "./csv-download.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SNAPSHOT_ROWS,
  activeKey,
  cellKey,
  chartColumns,
  chartOfAccounts,
  matchingAccounts,
  type ChartRow,
  type ChartTaxCode,
  type StandardAccount,
} from "@booki-aui/primitives/chart-of-accounts";

const TAGS = {
  root: "div",
  search: "input",
  classes: "select",
  status: "select",
  sort: "button",
  heading: "button",
  cell: "input",
  vat: "select",
  active: "button",
  commit: "button",
  discard: "button",
  prev: "button",
  next: "button",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof chartOfAccounts, typeof TAGS> = createParts(chartOfAccounts, TAGS);
const ChartOfAccountsRoot: (typeof parts)["Root"] = parts.Root;
const ChartOfAccountsSearch: (typeof parts)["Search"] = parts.Search;
const ChartOfAccountsClasses: (typeof parts)["Classes"] = parts.Classes;
const ChartOfAccountsStatus: (typeof parts)["Status"] = parts.Status;
const ChartOfAccountsSort: (typeof parts)["Sort"] = parts.Sort;
const ChartOfAccountsHeading: (typeof parts)["Heading"] = parts.Heading;
const ChartOfAccountsCell: (typeof parts)["Cell"] = parts.Cell;
const ChartOfAccountsVat: (typeof parts)["Vat"] = parts.Vat;
const ChartOfAccountsActive: (typeof parts)["Active"] = parts.Active;
const ChartOfAccountsCommit: (typeof parts)["Commit"] = parts.Commit;
const ChartOfAccountsDiscard: (typeof parts)["Discard"] = parts.Discard;
const ChartOfAccountsPrev: (typeof parts)["Prev"] = parts.Prev;
const ChartOfAccountsNext: (typeof parts)["Next"] = parts.Next;

const COPY = {
  EN: {
    title: "Chart of accounts",
    search: "Search",
    searchHint: "Number or name",
    class: "Class",
    allClasses: "All classes",
    status: "Status",
    allStatuses: "Active and inactive",
    active: "Active",
    inactive: "Inactive",
    number: "Number",
    name: "Name",
    type: "Type",
    vatCode: "VAT code",
    noVat: "No VAT code",
    standard: "Standard account",
    standardNo: "SAF-T",
    outside: "Outside every class",
    accounts: (n: number) => (n === 1 ? "1 account" : `${n} accounts`),
    locked: "Has postings: number and type are fixed",
    exportCsv: "Download CSV",
    noMatch: "No accounts match.",
    emptyTitle: "No accounts yet",
    emptyBody: "Accounts appear here once the chart is set up. Classes, checks and the SAF-T mapping follow from them.",
    prev: "Previous page",
    next: "Next page",
    range: (from: number, to: number, of: number) => `${from}–${to} of ${of}`,
    proposal: "Proposed change to the chart",
    add: "New",
    edit: "Change",
    renumber: "New number",
    commit: "Commit change",
    discard: "Discard",
    issues: (n: number) => (n === 1 ? "1 issue in the chart" : `${n} issues in the chart`),
    types: { asset: "Asset", liability: "Liability", equity: "Equity", income: "Income", expense: "Expense" },
    fields: { name: "Name", type: "Type", class: "Class", vatCode: "VAT code", standardAccount: "Standard account" },
    activeAction: (name: string, active: boolean) => `${active ? "Deactivate" : "Activate"} ${name}`,
    editLabel: (field: string, number: string) => `${field}, account ${number}`,
  },
  NO: {
    title: "Kontoplan",
    search: "Søk",
    searchHint: "Nummer eller navn",
    class: "Kontoklasse",
    allClasses: "Alle klasser",
    status: "Status",
    allStatuses: "Aktive og inaktive",
    active: "Aktiv",
    inactive: "Inaktiv",
    number: "Nummer",
    name: "Navn",
    type: "Type",
    vatCode: "Mva-kode",
    noVat: "Ingen mva-kode",
    standard: "Standardkonto",
    standardNo: "SAF-T",
    outside: "Utenfor alle klasser",
    accounts: (n: number) => (n === 1 ? "1 konto" : `${n} kontoer`),
    locked: "Har posteringer: nummer og type ligger fast",
    exportCsv: "Last ned CSV",
    noMatch: "Ingen kontoer passer.",
    emptyTitle: "Ingen kontoer ennå",
    emptyBody: "Kontoene vises her når kontoplanen er satt opp. Klasser, kontroller og SAF-T-koblingen følger av dem.",
    prev: "Forrige side",
    next: "Neste side",
    range: (from: number, to: number, of: number) => `${from}–${to} av ${of}`,
    proposal: "Foreslått endring i kontoplanen",
    add: "Ny",
    edit: "Endring",
    renumber: "Nytt nummer",
    commit: "Ta i bruk endringen",
    discard: "Forkast",
    issues: (n: number) => (n === 1 ? "1 avvik i kontoplanen" : `${n} avvik i kontoplanen`),
    types: { asset: "Eiendel", liability: "Gjeld", equity: "Egenkapital", income: "Inntekt", expense: "Kostnad" },
    fields: { name: "Navn", type: "Type", class: "Klasse", vatCode: "Mva-kode", standardAccount: "Standardkonto" },
    activeAction: (name: string, active: boolean) => `${active ? "Deaktiver" : "Aktiver"} ${name}`,
    editLabel: (field: string, number: string) => `${field}, konto ${number}`,
  },
} as const;

export type ChartOfAccountsProps = {
  accounts?: ChartAccount[];
  defaultAccounts?: ChartAccount[];
  onAccountsChange?: (accounts: ChartAccount[], details: BookiChangeDetails) => void;
  /** The changes an agent proposed, when the app owns them. */
  proposal?: ProposedChange[] | null;
  defaultProposal?: ProposedChange[] | null;
  onProposalChange?: (proposal: ProposedChange[] | null, details: BookiChangeDetails) => void;
  /** Classes and rules of your own. Defaults to the profile's country: NS 4102 for NO, the common ranges for US. */
  scheme?: ChartScheme;
  /** A closed list of VAT codes: the cell becomes a select and an agent's code is checked against it. */
  taxCodes?: ChartTaxCode[];
  /** When given, a standard account must be one of these. */
  standardAccounts?: StandardAccount[];
  /** Most rows an agent's snapshot carries. Defaults to 50. */
  snapshotRows?: number;
  /** Rows a person sees per page. Defaults to 100. */
  pageSize?: number;
  /** The sort, search, filters and page of the list, when the app owns it. */
  query?: TableQuery;
  defaultQuery?: Partial<TableQuery>;
  onQueryChange?: (query: TableQuery, details: BookiChangeDetails) => void;
  /** What an empty chart offers below the headline: the app's own "Import a chart" button. */
  empty?: ReactNode;
  className?: string;
  "aria-label"?: string;
};

type RootState = {
  accounts: ChartAccount[];
  proposal: ProposedChange[] | null;
  proposalIssues: AccountIssue[];
  proposalBlocked: boolean;
  query: TableQuery;
  view: { total: number; matching: number; page: number; pageCount: number };
  classes: { id: string; name: string; range: string; count: number }[];
  scheme: { id: string; requiresStandard: boolean };
  pageRows: ChartRow[];
  allIssues: AccountIssue[];
  collapsed: string[];
  drafts: Record<string, string>;
  refusal: string;
  total: number;
};

/** A header cell whose label sorts the list: asc, desc, off. */
function SortHeader({ id, query, children }: { id: string; query: TableQuery; children: ReactNode }) {
  const sorted = query.sort?.column === id ? query.sort.direction : undefined;
  return (
    <th scope="col" aria-sort={ariaSort(query.sort, id)} data-column={id}>
      <ChartOfAccountsSort value={id}>
        {children}
        <span aria-hidden="true" data-slot="chart-of-accounts-sort-mark">
          {sortMark(sorted)}
        </span>
      </ChartOfAccountsSort>
    </th>
  );
}

/**
 * Composed chart of accounts: a search, a class and a status filter, the
 * accounts under collapsible class headings with inline edits of name, VAT
 * code and standard account, what is wrong with each account, an agent's
 * proposal waiting for a person to commit, pages and a CSV.
 */
function ChartOfAccounts({
  accounts,
  defaultAccounts,
  onAccountsChange,
  proposal,
  defaultProposal,
  onProposalChange,
  scheme,
  taxCodes,
  standardAccounts,
  snapshotRows = DEFAULT_SNAPSHOT_ROWS,
  pageSize = DEFAULT_PAGE_SIZE,
  query,
  defaultQuery,
  onQueryChange,
  empty,
  className,
  "aria-label": ariaLabel,
}: ChartOfAccountsProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const access = useAccessFor({ commit: "chart.maintain", toggleActive: "chart.maintain" });
  const nb = country === "NO";
  const copy = nb ? COPY.NO : COPY.EN;
  const rules = scheme ?? chartSchemeFor(profile.country);
  const classTitle = (cls: AccountClass) => (nb ? cls.names.nb : cls.names.en);
  const standardLabel = rules.requiresStandard ? copy.standardNo : copy.standard;

  return (
    <ChartOfAccountsRoot
      accounts={accounts}
      defaultAccounts={defaultAccounts}
      onAccountsChange={onAccountsChange}
      proposal={proposal}
      defaultProposal={defaultProposal}
      onProposalChange={onProposalChange}
      country={profile.country}
      scheme={scheme}
      taxCodes={taxCodes}
      standardAccounts={standardAccounts}
      denied={access.denied}
      snapshotRows={snapshotRows}
      pageSize={pageSize}
      query={query}
      defaultQuery={defaultQuery}
      onQueryChange={onQueryChange}
      className={className}
      aria-label={ariaLabel ?? copy.title}
    >
      {(state: RootState) => {
        const issuesOf = (number: string) => state.allIssues.filter((issue) => issue.number === number);
        const groups = groupAccounts(
          rules,
          state.pageRows.map((row) => ({ ...row, class: row.class ?? undefined }) as ChartAccount),
        );
        const from = state.view.matching === 0 ? 0 : (state.view.page - 1) * state.query.pageSize + 1;
        const to = Math.min(state.view.matching, state.view.page * state.query.pageSize);
        const download = () => {
          const headers: Record<string, string> = {
            number: copy.number,
            name: copy.name,
            type: copy.type,
            vatCode: copy.vatCode,
            standardAccount: standardLabel,
            active: copy.status,
          };
          const columns: TableColumn<ChartAccount>[] = chartColumns.map((column) => ({
            ...column,
            header: headers[column.id] ?? column.header,
          }));
          const { kept, query: plain } = matchingAccounts(rules, state.accounts, state.query);
          downloadCsv("chart-of-accounts", matchingRows(kept, columns, plain), columns, country);
        };
        const changed = (change: ProposedChange) => {
          const before = state.accounts.find((account) => account.number === change.number);
          const fields = (["name", "type", "class", "vatCode", "standardAccount"] as const).filter(
            (field) => change[field] !== undefined,
          );
          return { before, fields };
        };
        const show = (field: keyof AccountChange, value: unknown) =>
          field === "type" && typeof value === "string"
            ? (copy.types[value as AccountType] ?? value)
            : value === undefined || value === ""
              ? "–"
              : String(value);
        return (
          <>
            <div data-slot="chart-of-accounts-toolbar">
              <label data-slot="chart-of-accounts-field" data-wide="">
                <span>{copy.search}</span>
                <ChartOfAccountsSearch placeholder={copy.searchHint} aria-label={copy.search} />
              </label>
              <label data-slot="chart-of-accounts-field">
                <span>{copy.class}</span>
                <ChartOfAccountsClasses aria-label={copy.class}>
                  <option value="">{copy.allClasses}</option>
                  {rules.classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.from ? `${cls.id} ${classTitle(cls)}` : classTitle(cls)}
                    </option>
                  ))}
                </ChartOfAccountsClasses>
              </label>
              <label data-slot="chart-of-accounts-field">
                <span>{copy.status}</span>
                <ChartOfAccountsStatus aria-label={copy.status}>
                  <option value="">{copy.allStatuses}</option>
                  <option value="active">{copy.active}</option>
                  <option value="inactive">{copy.inactive}</option>
                </ChartOfAccountsStatus>
              </label>
              <button type="button" data-slot="chart-of-accounts-export" data-variant="secondary" onClick={download}>
                {copy.exportCsv}
              </button>
            </div>

            {state.allIssues.length > 0 ? (
              <p data-slot="chart-of-accounts-summary" role="status">
                {copy.issues(state.allIssues.length)}
              </p>
            ) : null}

            {state.proposal ? (
              <section data-slot="chart-of-accounts-proposal" aria-label={copy.proposal}>
                <h3 data-slot="chart-of-accounts-proposal-title">
                  <span data-slot="chart-of-accounts-agent">{profile.copy.proposedByAgent}</span>
                  {copy.proposal}
                </h3>
                <ul data-slot="chart-of-accounts-changes">
                  {state.proposal.map((change) => {
                    const { before, fields } = changed(change);
                    return (
                      <li key={change.number} data-kind={change.kind}>
                        <span data-slot="chart-of-accounts-kind">{change.kind === "add" ? copy.add : copy.edit}</span>
                        <span data-slot="chart-of-accounts-number">{change.number}</span>
                        {change.newNumber ? (
                          <span>
                            {copy.renumber}: <span data-slot="chart-of-accounts-number">{change.newNumber}</span>
                          </span>
                        ) : null}
                        {fields.map((field) => (
                          <span key={field} data-slot="chart-of-accounts-diff">
                            {copy.fields[field]}:{" "}
                            {before ? (
                              <>
                                <del>{show(field, before[field])}</del> →{" "}
                              </>
                            ) : null}
                            <ins>{show(field, change[field])}</ins>
                          </span>
                        ))}
                      </li>
                    );
                  })}
                </ul>
                {state.proposalIssues.length > 0 ? (
                  <ul data-slot="chart-of-accounts-proposal-issues">
                    {state.proposalIssues.map((issue) => (
                      <li key={`${issue.number}-${issue.code}`} data-level={issue.level}>
                        {say(issue.message)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div data-slot="chart-of-accounts-actions">
                  <ChartOfAccountsCommit>{copy.commit}</ChartOfAccountsCommit>
                  <ChartOfAccountsDiscard>{copy.discard}</ChartOfAccountsDiscard>
                </div>
              </section>
            ) : null}

            <div data-slot="chart-of-accounts-scroll">
              <table data-slot="chart-of-accounts-table">
                <thead>
                  <tr>
                    <SortHeader id="number" query={state.query}>
                      {copy.number}
                    </SortHeader>
                    <SortHeader id="name" query={state.query}>
                      {copy.name}
                    </SortHeader>
                    <SortHeader id="type" query={state.query}>
                      {copy.type}
                    </SortHeader>
                    <SortHeader id="vatCode" query={state.query}>
                      {copy.vatCode}
                    </SortHeader>
                    <SortHeader id="standardAccount" query={state.query}>
                      {standardLabel}
                    </SortHeader>
                    <SortHeader id="active" query={state.query}>
                      {copy.status}
                    </SortHeader>
                  </tr>
                </thead>
                {state.total === 0 ? (
                  <tbody>
                    <tr>
                      <td colSpan={6} data-slot="chart-of-accounts-empty">
                        <strong>{copy.emptyTitle}</strong>
                        {empty ?? <p>{copy.emptyBody}</p>}
                      </td>
                    </tr>
                  </tbody>
                ) : state.pageRows.length === 0 ? (
                  <tbody>
                    <tr>
                      <td colSpan={6} data-slot="chart-of-accounts-empty">
                        {copy.noMatch}
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  groups.map((group) => {
                    const id = group.class?.id ?? "none";
                    const open = !state.collapsed.includes(id);
                    const summary = state.classes.find((cls) => cls.id === group.class?.id);
                    return (
                      <tbody key={id} data-slot="chart-of-accounts-group" data-collapsed={open ? undefined : ""}>
                        <tr data-slot="chart-of-accounts-class">
                          <th colSpan={6} scope="colgroup">
                            <ChartOfAccountsHeading value={id}>
                              <span aria-hidden="true" data-slot="chart-of-accounts-chevron" />
                              {group.class?.from ? (
                                <span data-slot="chart-of-accounts-class-id">{group.class.id}</span>
                              ) : null}
                              <span data-slot="chart-of-accounts-class-name">
                                {group.class ? classTitle(group.class) : copy.outside}
                              </span>
                              {group.class?.from ? (
                                <span data-slot="chart-of-accounts-class-range">{summary?.range}</span>
                              ) : null}
                              <span data-slot="chart-of-accounts-class-count">
                                {copy.accounts(summary?.count ?? group.accounts.length)}
                              </span>
                            </ChartOfAccountsHeading>
                          </th>
                        </tr>
                        {open
                          ? group.accounts.map((account) => {
                              const issues = issuesOf(account.number);
                              const error = issues.some((issue) => issue.level === "error");
                              return (
                                <tr
                                  key={account.number}
                                  data-slot="chart-of-accounts-row"
                                  data-inactive={account.active ? undefined : ""}
                                  data-locked={account.locked ? "" : undefined}
                                  data-issue={issues.length ? (error ? "error" : "warning") : undefined}
                                >
                                  <th scope="row" data-slot="chart-of-accounts-number" data-label={copy.number}>
                                    {account.number}
                                    {account.locked ? (
                                      <span data-slot="chart-of-accounts-lock" title={copy.locked}>
                                        <span data-slot="chart-of-accounts-sr">{copy.locked}</span>
                                      </span>
                                    ) : null}
                                  </th>
                                  <td data-slot="chart-of-accounts-name" data-label={copy.name}>
                                    <ChartOfAccountsCell
                                      value={cellKey(account.number, "name")}
                                      aria-label={copy.editLabel(copy.name, account.number)}
                                      aria-invalid={issues.some((issue) => issue.code === "name-empty") || undefined}
                                    />
                                    {issues.length ? (
                                      <ul data-slot="chart-of-accounts-issues">
                                        {issues.map((issue) => (
                                          <li key={issue.code} data-level={issue.level}>
                                            {say(issue.message)}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </td>
                                  <td data-slot="chart-of-accounts-type" data-label={copy.type}>
                                    {copy.types[account.type] ?? account.type}
                                  </td>
                                  <td data-slot="chart-of-accounts-code" data-label={copy.vatCode}>
                                    {taxCodes && taxCodes.length > 0 ? (
                                      <ChartOfAccountsVat
                                        value={account.number}
                                        aria-label={copy.editLabel(copy.vatCode, account.number)}
                                      >
                                        <option value="">{copy.noVat}</option>
                                        {taxCodes.map((code) => (
                                          <option key={code.code} value={code.code}>
                                            {code.label ? `${code.code} ${code.label}` : code.code}
                                          </option>
                                        ))}
                                      </ChartOfAccountsVat>
                                    ) : (
                                      <ChartOfAccountsCell
                                        value={cellKey(account.number, "vatCode")}
                                        aria-label={copy.editLabel(copy.vatCode, account.number)}
                                      />
                                    )}
                                  </td>
                                  <td data-slot="chart-of-accounts-code" data-label={standardLabel}>
                                    <ChartOfAccountsCell
                                      value={cellKey(account.number, "standardAccount")}
                                      aria-label={copy.editLabel(standardLabel, account.number)}
                                      inputMode="numeric"
                                      aria-invalid={
                                        issues.some(
                                          (issue) =>
                                            issue.code === "missing-standard" || issue.code === "standard-format",
                                        ) || undefined
                                      }
                                    />
                                  </td>
                                  <td data-slot="chart-of-accounts-status" data-label={copy.status}>
                                    <ChartOfAccountsActive
                                      value={activeKey(account.number)}
                                      aria-label={copy.activeAction(
                                        `${account.number} ${account.name}`,
                                        account.active,
                                      )}
                                    >
                                      {account.active ? copy.active : copy.inactive}
                                    </ChartOfAccountsActive>
                                  </td>
                                </tr>
                              );
                            })
                          : null}
                      </tbody>
                    );
                  })
                )}
              </table>
            </div>
            {state.view.matching > state.query.pageSize ? (
              <div data-slot="chart-of-accounts-pagination">
                <ChartOfAccountsPrev aria-label={copy.prev}>←</ChartOfAccountsPrev>
                <span data-slot="chart-of-accounts-range" aria-live="polite">
                  {copy.range(from, to, state.view.matching)}
                </span>
                <ChartOfAccountsNext aria-label={copy.next}>→</ChartOfAccountsNext>
              </div>
            ) : null}
            {state.refusal ? (
              <p data-slot="chart-of-accounts-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </ChartOfAccountsRoot>
  );
}

export {
  ChartOfAccounts,
  ChartOfAccountsActive,
  ChartOfAccountsCell,
  ChartOfAccountsCommit,
  ChartOfAccountsDiscard,
  ChartOfAccountsClasses,
  ChartOfAccountsHeading,
  ChartOfAccountsNext,
  ChartOfAccountsPrev,
  ChartOfAccountsRoot,
  ChartOfAccountsSearch,
  ChartOfAccountsSort,
  ChartOfAccountsStatus,
  ChartOfAccountsVat,
  chartOfAccounts,
};
export type { AccountChange, AccountIssue, AccountType, ChartAccount, ChartScheme, ProposedChange };
export type { ChartRow, ChartTaxCode, StandardAccount } from "@booki-aui/primitives/chart-of-accounts";
