import type { ReactNode } from "react";
import type { BookiChangeDetails } from "./change-details.js";
import {
  periodMonths,
  type DepreciationRun,
  type Disposal,
  type FixedAsset,
  type RunAccount,
  type ScheduleEntry,
} from "@booki-aui/core/fixed-assets";
import { formatMoney, money } from "@booki-aui/core/money";
import { formatPeriod } from "@booki-aui/core/period";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import { useAccessFor } from "./access.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { type AssetRow, fixedAssetRegister } from "@booki-aui/primitives/fixed-asset-register";

const TAGS = {
  root: "div",
  period: "input",
  open: "button",
  back: "button",
  propose: "button",
  confirm: "button",
  discard: "button",
  cell: "input",
  dispose: "button",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof fixedAssetRegister, typeof TAGS> = createParts(fixedAssetRegister, TAGS);
const FixedAssetRegisterRoot: (typeof parts)["Root"] = parts.Root;
const FixedAssetRegisterPeriod: (typeof parts)["Period"] = parts.Period;
const FixedAssetRegisterOpen: (typeof parts)["Open"] = parts.Open;
const FixedAssetRegisterBack: (typeof parts)["Back"] = parts.Back;
const FixedAssetRegisterPropose: (typeof parts)["Propose"] = parts.Propose;
const FixedAssetRegisterConfirm: (typeof parts)["Confirm"] = parts.Confirm;
const FixedAssetRegisterDiscard: (typeof parts)["Discard"] = parts.Discard;
const FixedAssetRegisterCell: (typeof parts)["Cell"] = parts.Cell;
const FixedAssetRegisterDispose: (typeof parts)["Dispose"] = parts.Dispose;

const COPY = {
  EN: {
    title: "Fixed asset register",
    period: "Period",
    periodHint: "A month like 2026-03 or a year like 2026",
    asOf: "As of",
    alreadyRun: "depreciation has been run",
    notRun: "depreciation not run",
    asset: "Asset",
    acquired: "Acquired",
    cost: "Cost",
    depreciation: "Depreciation",
    accumulated: "Accumulated",
    carrying: "Carrying amount",
    total: "Total",
    disposed: "Disposed of",
    open: "Open",
    back: "Back to register",
    method: "Method",
    methods: { "straight-line": "Straight-line", "declining-balance": "Declining balance" },
    residual: "Residual value",
    life: "Useful life",
    months: "months",
    rate: "Yearly rate",
    proceeds: "Proceeds",
    schedule: "Depreciation schedule",
    emptyTitle: "No fixed assets yet",
    emptyBody:
      "Assets appear here once they are registered. Depreciation, disposals and the schedule follow from them.",
    month: "Month",
    dispose: "Dispose of asset",
    disposalDate: "Disposal date",
    gain: "Gain on disposal",
    loss: "Loss on disposal",
    proposeRun: "Propose depreciation run",
    proposedRun: "Proposed depreciation run",
    account: "Account",
    debit: "Debit",
    credit: "Credit",
    skipped: "Not depreciated",
    confirmRun: "Confirm run",
    discardRun: "Discard",
  },
  NO: {
    title: "Anleggsregister",
    period: "Periode",
    periodHint: "En måned som 2026-03 eller et år som 2026",
    asOf: "Per",
    alreadyRun: "avskrivning er kjørt",
    notRun: "avskrivning ikke kjørt",
    asset: "Anleggsmiddel",
    acquired: "Anskaffet",
    cost: "Kostpris",
    depreciation: "Avskrivning",
    accumulated: "Akkumulert",
    carrying: "Bokført verdi",
    total: "Sum",
    disposed: "Avhendet",
    open: "Åpne",
    back: "Tilbake til registeret",
    method: "Metode",
    methods: { "straight-line": "Lineær", "declining-balance": "Saldo" },
    residual: "Restverdi",
    life: "Levetid",
    months: "måneder",
    rate: "Årlig sats",
    proceeds: "Vederlag",
    schedule: "Avskrivningsplan",
    emptyTitle: "Ingen anleggsmidler ennå",
    emptyBody: "Anleggsmidlene vises her når de er registrert. Avskrivninger, avganger og planen følger av dem.",
    month: "Måned",
    dispose: "Avhend anleggsmiddel",
    disposalDate: "Avhendelsesdato",
    gain: "Gevinst ved avhendelse",
    loss: "Tap ved avhendelse",
    proposeRun: "Foreslå avskrivningskjøring",
    proposedRun: "Foreslått avskrivningskjøring",
    account: "Konto",
    debit: "Debet",
    credit: "Kredit",
    skipped: "Ikke avskrevet",
    confirmRun: "Bekreft kjøring",
    discardRun: "Forkast",
  },
} as const;

export type FixedAssetRegisterProps = {
  assets?: FixedAsset[];
  defaultAssets?: FixedAsset[];
  period?: string;
  defaultPeriod?: string;
  runs?: string[];
  defaultRuns?: string[];
  expenseAccount?: RunAccount;
  accumulatedAccount?: RunAccount;
  /** Defaults to the profile's currency. */
  currency?: string;
  onAssetsChange?: (assets: FixedAsset[], details: BookiChangeDetails) => void;
  onPeriodChange?: (period: string, details: BookiChangeDetails) => void;
  onRunsChange?: (runs: string[], details: BookiChangeDetails) => void;
  /** A person confirmed the run: post these voucher lines. */
  onRun?: (run: DepreciationRun) => void;
  onDispose?: (disposal: Disposal) => void;
  /**
   * What an empty register says and offers, below the default headline: the
   * app's own "Register an asset" button. Default: a line on where assets come from.
   */
  empty?: ReactNode;
  className?: string;
  "aria-label"?: string;
};

type RootState = {
  assets: FixedAsset[];
  period: string;
  runs: string[];
  openAssetId: string;
  rows: AssetRow[];
  schedule: ScheduleEntry[];
  proposal: DepreciationRun | null;
  runnable: boolean;
  lastDisposal: Disposal | null;
  refusal: string;
};

/** Composed register: the table as of a period, one asset's schedule, and a proposed run to confirm. */
function FixedAssetRegister({
  assets,
  defaultAssets,
  period,
  defaultPeriod,
  runs,
  defaultRuns,
  expenseAccount,
  accumulatedAccount,
  currency,
  onAssetsChange,
  onPeriodChange,
  onRunsChange,
  onRun,
  onDispose,
  empty,
  className,
  "aria-label": ariaLabel,
}: FixedAssetRegisterProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const access = useAccessFor({
    confirmRun: "asset.run-depreciation",
    dispose: "asset.dispose",
    disposeTyped: "asset.dispose",
  });
  const copy = country === "NO" ? COPY.NO : COPY.EN;
  const unit = (currency || profile.currency) as typeof profile.currency;
  const fmt = (minor: number) => formatMoney(money(minor, unit), { locale: profile.locale });
  return (
    <FixedAssetRegisterRoot
      assets={assets}
      denied={access.denied}
      defaultAssets={defaultAssets}
      period={period}
      defaultPeriod={defaultPeriod}
      runs={runs}
      defaultRuns={defaultRuns}
      expenseAccount={expenseAccount}
      accumulatedAccount={accumulatedAccount}
      currency={unit}
      locale={profile.locale}
      onAssetsChange={onAssetsChange}
      onPeriodChange={onPeriodChange}
      onRunsChange={onRunsChange}
      onRun={onRun}
      onDispose={onDispose}
      className={className}
      aria-label={ariaLabel ?? copy.title}
    >
      {(state: RootState) => {
        const label = formatPeriod(state.period, profile.locale);
        const months = (() => {
          try {
            return periodMonths(state.period);
          } catch {
            return [];
          }
        })();
        const run = state.runs.some((code) => {
          try {
            return periodMonths(code).some((month) => months.includes(month));
          } catch {
            return false;
          }
        });
        const open = state.assets.find((asset) => asset.id === state.openAssetId);
        const openRow = state.rows.find((row) => row.id === state.openAssetId);
        const sum = (pick: (row: AssetRow) => number) => state.rows.reduce((total, row) => total + pick(row), 0);
        return (
          <>
            <div data-slot="fixed-asset-register-bar">
              <label data-slot="fixed-asset-register-period">
                <span>{copy.period}</span>
                <FixedAssetRegisterPeriod aria-label={copy.period} placeholder="2026-03" title={copy.periodHint} />
              </label>
              <p data-slot="fixed-asset-register-status" role="status" data-run={run ? "" : undefined}>
                {copy.asOf} {label} · {run ? copy.alreadyRun : copy.notRun}
              </p>
            </div>
            {open ? (
              <section data-slot="fixed-asset-register-asset" aria-label={open.name}>
                <div data-slot="fixed-asset-register-actions">
                  <FixedAssetRegisterBack>{copy.back}</FixedAssetRegisterBack>
                </div>
                <h3 data-slot="fixed-asset-register-heading">{open.name}</h3>
                <dl data-slot="fixed-asset-register-facts">
                  <div>
                    <dt>{copy.acquired}</dt>
                    <dd>{open.acquiredOn}</dd>
                  </div>
                  <div>
                    <dt>{copy.method}</dt>
                    <dd data-text="">{copy.methods[open.method] ?? open.method}</dd>
                  </div>
                  <div>
                    <dt>{copy.cost}</dt>
                    <dd>{fmt(open.costMinor)}</dd>
                  </div>
                  <div>
                    <dt>{copy.residual}</dt>
                    <dd>{fmt(open.residualMinor)}</dd>
                  </div>
                  {open.usefulLifeMonths !== undefined ? (
                    <div>
                      <dt>{copy.life}</dt>
                      <dd>
                        {open.usefulLifeMonths} {copy.months}
                      </dd>
                    </div>
                  ) : null}
                  {open.method === "declining-balance" && open.rateBp !== undefined ? (
                    <div>
                      <dt>{copy.rate}</dt>
                      <dd>{open.rateBp / 100}%</dd>
                    </div>
                  ) : null}
                  {openRow ? (
                    <div>
                      <dt>{copy.carrying}</dt>
                      <dd>{fmt(openRow.carryingMinor)}</dd>
                    </div>
                  ) : null}
                  {open.disposedOn ? (
                    <div>
                      <dt>{copy.disposed}</dt>
                      <dd>{open.disposedOn}</dd>
                    </div>
                  ) : null}
                  {open.disposalProceedsMinor !== undefined ? (
                    <div>
                      <dt>{copy.proceeds}</dt>
                      <dd>{fmt(open.disposalProceedsMinor)}</dd>
                    </div>
                  ) : null}
                </dl>
                {openRow?.issue ? <p data-slot="fixed-asset-register-issue">{openRow.issue}</p> : null}
                {state.lastDisposal && state.lastDisposal.asset.id === open.id ? (
                  <p
                    data-slot="fixed-asset-register-disposal"
                    role="status"
                    data-outcome={state.lastDisposal.gainLossMinor < 0 ? "loss" : "gain"}
                  >
                    {state.lastDisposal.gainLossMinor < 0 ? copy.loss : copy.gain}:{" "}
                    <span>{fmt(Math.abs(state.lastDisposal.gainLossMinor))}</span>
                    {" · "}
                    {copy.carrying} <span>{fmt(state.lastDisposal.carryingMinor)}</span>
                    {" · "}
                    {copy.proceeds} <span>{fmt(state.lastDisposal.proceedsMinor)}</span>
                  </p>
                ) : null}
                <div data-slot="fixed-asset-register-scroll" data-tall="">
                  <table data-slot="fixed-asset-register-table" aria-label={copy.schedule}>
                    <thead>
                      <tr>
                        <th>{copy.month}</th>
                        <th data-align="end">{copy.depreciation}</th>
                        <th data-align="end">{copy.accumulated}</th>
                        <th data-align="end">{copy.carrying}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.schedule.map((entry) => (
                        <tr key={entry.period} aria-current={months.includes(entry.period) ? "true" : undefined}>
                          <th scope="row" data-slot="fixed-asset-register-code">
                            {entry.period}
                          </th>
                          <td data-align="end" data-slot="fixed-asset-register-amount">
                            {fmt(entry.depreciationMinor)}
                          </td>
                          <td data-align="end" data-slot="fixed-asset-register-amount">
                            {fmt(entry.accumulatedMinor)}
                          </td>
                          <td data-align="end" data-slot="fixed-asset-register-amount">
                            {fmt(entry.carryingMinor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!open.disposedOn ? (
                  <fieldset data-slot="fixed-asset-register-dispose">
                    <legend>{copy.dispose}</legend>
                    <label>
                      <span>{copy.disposalDate}</span>
                      <FixedAssetRegisterCell value="date" aria-label={copy.disposalDate} />
                    </label>
                    <label>
                      <span>{copy.proceeds}</span>
                      <FixedAssetRegisterCell
                        value="proceeds"
                        aria-label={copy.proceeds}
                        inputMode="decimal"
                        data-align="end"
                      />
                    </label>
                    <FixedAssetRegisterDispose>{copy.dispose}</FixedAssetRegisterDispose>
                  </fieldset>
                ) : null}
              </section>
            ) : (
              <div data-slot="fixed-asset-register-scroll">
                <table data-slot="fixed-asset-register-table">
                  <thead>
                    <tr>
                      <th>{copy.asset}</th>
                      <th>{copy.acquired}</th>
                      <th data-align="end">{copy.cost}</th>
                      <th data-align="end">{copy.depreciation}</th>
                      <th data-align="end">{copy.accumulated}</th>
                      <th data-align="end">{copy.carrying}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} data-slot="fixed-asset-register-empty">
                          <strong>{copy.emptyTitle}</strong>
                          {empty ?? <p>{copy.emptyBody}</p>}
                        </td>
                      </tr>
                    ) : null}
                    {state.rows.map((row) => (
                      <tr
                        key={row.id}
                        data-disposed={row.disposedOn ? "" : undefined}
                        data-issue={row.issue ? "" : undefined}
                      >
                        <th scope="row">
                          <FixedAssetRegisterOpen value={row.id} aria-label={`${copy.open}: ${row.name}`}>
                            {row.name}
                          </FixedAssetRegisterOpen>
                          {row.disposedOn ? (
                            <span data-slot="fixed-asset-register-note">
                              {copy.disposed} {row.disposedOn}
                            </span>
                          ) : null}
                          {row.issue ? <span data-slot="fixed-asset-register-issue">{row.issue}</span> : null}
                        </th>
                        <td data-slot="fixed-asset-register-code">{row.acquiredOn}</td>
                        <td data-align="end" data-slot="fixed-asset-register-amount">
                          {fmt(row.costMinor)}
                        </td>
                        <td data-align="end" data-slot="fixed-asset-register-amount">
                          {fmt(row.depreciationMinor)}
                        </td>
                        <td data-align="end" data-slot="fixed-asset-register-amount">
                          {fmt(row.accumulatedMinor)}
                        </td>
                        <td data-align="end" data-slot="fixed-asset-register-amount">
                          {fmt(row.carryingMinor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {state.rows.length === 0 ? null : (
                    <tfoot>
                      <tr>
                        <th colSpan={2} scope="row">
                          {copy.total}
                        </th>
                        <td data-align="end" data-slot="fixed-asset-register-amount">
                          {fmt(sum((row) => row.costMinor))}
                        </td>
                        <td data-align="end" data-slot="fixed-asset-register-amount">
                          {fmt(sum((row) => row.depreciationMinor))}
                        </td>
                        <td data-align="end" data-slot="fixed-asset-register-amount">
                          {fmt(sum((row) => row.accumulatedMinor))}
                        </td>
                        <td data-align="end" data-slot="fixed-asset-register-amount">
                          {fmt(sum((row) => row.carryingMinor))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
            {state.proposal ? (
              <section data-slot="fixed-asset-register-run" aria-label={copy.proposedRun}>
                <h3 data-slot="fixed-asset-register-heading">
                  {copy.proposedRun} · {formatPeriod(state.proposal.period, profile.locale)}
                </h3>
                <div data-slot="fixed-asset-register-scroll">
                  <table data-slot="fixed-asset-register-table">
                    <thead>
                      <tr>
                        <th>{copy.account}</th>
                        <th>{copy.asset}</th>
                        <th data-align="end">{copy.debit}</th>
                        <th data-align="end">{copy.credit}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.proposal.lines.map((line) => (
                        <tr key={line.id}>
                          <th scope="row">
                            <span data-slot="fixed-asset-register-code">{line.account}</span> {line.accountName}
                          </th>
                          <td>{line.dims}</td>
                          <td data-align="end" data-slot="fixed-asset-register-amount">
                            {line.debitMinor ? fmt(line.debitMinor) : ""}
                          </td>
                          <td data-align="end" data-slot="fixed-asset-register-amount">
                            {line.creditMinor ? fmt(line.creditMinor) : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan={2} scope="row">
                          {copy.total}
                        </th>
                        <td data-align="end" data-slot="fixed-asset-register-amount">
                          {fmt(state.proposal.totalMinor)}
                        </td>
                        <td data-align="end" data-slot="fixed-asset-register-amount">
                          {fmt(state.proposal.totalMinor)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {state.proposal.skipped.length > 0 ? (
                  <ul data-slot="fixed-asset-register-skipped" aria-label={copy.skipped}>
                    {state.proposal.skipped.map((skip) => (
                      <li key={skip.assetId}>{say(skip.reason)}</li>
                    ))}
                  </ul>
                ) : null}
                <div data-slot="fixed-asset-register-actions">
                  <FixedAssetRegisterConfirm>{copy.confirmRun}</FixedAssetRegisterConfirm>
                  <FixedAssetRegisterDiscard>{copy.discardRun}</FixedAssetRegisterDiscard>
                </div>
              </section>
            ) : (
              <div data-slot="fixed-asset-register-actions">
                <FixedAssetRegisterPropose disabled={!state.runnable}>{copy.proposeRun}</FixedAssetRegisterPropose>
              </div>
            )}
            {state.refusal ? (
              <p data-slot="fixed-asset-register-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </FixedAssetRegisterRoot>
  );
}

export {
  FixedAssetRegister,
  FixedAssetRegisterBack,
  FixedAssetRegisterCell,
  FixedAssetRegisterConfirm,
  FixedAssetRegisterDiscard,
  FixedAssetRegisterDispose,
  FixedAssetRegisterOpen,
  FixedAssetRegisterPeriod,
  FixedAssetRegisterPropose,
  FixedAssetRegisterRoot,
  fixedAssetRegister,
};
export type { DepreciationRun, Disposal, FixedAsset, RunAccount, ScheduleEntry };

export { type AssetRow } from "@booki-aui/primitives/fixed-asset-register";
