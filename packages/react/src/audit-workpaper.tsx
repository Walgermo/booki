import { localToday } from "@booki/core/financial-date";
import type { BookiChangeDetails } from "./change-details.js";
import {
  SAMPLE_METHODS,
  TEST_RESULTS,
  type Materiality,
  type MaterialityInput,
  type PopulationItem,
  type SampleMethod,
  type SampleSummary,
  type TestResult,
  type TickMark,
  type Workpaper,
  type WorkpaperItem,
} from "@booki/core/audit";
import { formatMoney, money } from "@booki/core/money";
import { createParts } from "@ui-sdk/react/primitive";
import type { ReactNode } from "react";
import { useAccessFor } from "./access.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { signed, auditWorkpaper } from "@booki/primitives/audit-workpaper";

const parts = createParts(auditWorkpaper, {
  root: "div",
  result: "select",
  tick: "select",
  cell: "input",
  conclusion: "textarea",
  method: "select",
  sampler: "input",
  draw: "button",
  prepare: "button",
  review: "button",
  withdraw: "button",
});
const AuditWorkpaperRoot = parts.Root;
const AuditWorkpaperResult = parts.Result;
const AuditWorkpaperTick = parts.Tick;
const AuditWorkpaperCell = parts.Cell;
const AuditWorkpaperConclusion = parts.Conclusion;
const AuditWorkpaperMethod = parts.Method;
const AuditWorkpaperSampler = parts.Sampler;
const AuditWorkpaperDraw = parts.Draw;
const AuditWorkpaperPrepare = parts.Prepare;
const AuditWorkpaperReview = parts.Review;
const AuditWorkpaperWithdraw = parts.Withdraw;

const COPY = {
  EN: {
    title: "Audit workpaper",
    materiality: "Materiality",
    benchmark: "Benchmark",
    overall: "Overall materiality",
    performance: "Performance materiality",
    trivial: "Clearly trivial",
    noSample: "No sample drawn",
    method: "Method",
    size: "Size",
    sizeHint: "auto",
    draw: "Draw sample",
    sample: "Sample",
    methods: { "all-above": "All items above", "monetary-unit": "Monetary unit", random: "Random" },
    seed: "Seed",
    interval: "Interval",
    start: "Start",
    threshold: "Threshold",
    of: "of",
    items: "items",
    populationTotal: "Population",
    item: "Item",
    amount: "Amount",
    result: "Result",
    results: { untested: "Untested", ok: "No exception", exception: "Exception" },
    misstatement: "Misstatement",
    tick: "Tick mark",
    noTick: "None",
    evidence: "Evidence",
    note: "Note",
    by: "By",
    agent: "Agent",
    notReviewed: "not yet reviewed by a person",
    legend: "Tick-mark legend",
    summary: "Summary",
    tested: "Tested",
    exceptions: "Exceptions",
    known: "Known misstatement",
    projected: "Projected misstatement",
    tolerable: "Tolerable misstatement",
    within: "Within tolerable misstatement",
    exceeds: "Above tolerable misstatement",
    issues: "Before sign-off",
    conclusion: "Conclusion",
    signOffs: "Sign-offs",
    preparer: "Preparer",
    reviewer: "Reviewer",
    notSigned: "not signed",
    signPreparer: "Sign as preparer",
    signReviewer: "Sign as reviewer",
    withdraw: "Withdraw sign-off",
  },
  NO: {
    title: "Arbeidspapir",
    materiality: "Vesentlighet",
    benchmark: "Grunnlag",
    overall: "Total vesentlighet",
    performance: "Arbeidsvesentlighet",
    trivial: "Ubetydelig feilinformasjon",
    noSample: "Ingen utvalg trukket",
    method: "Metode",
    size: "Antall",
    sizeHint: "auto",
    draw: "Trekk utvalg",
    sample: "Utvalg",
    methods: { "all-above": "Alle poster over", "monetary-unit": "Pengeenhetsutvalg", random: "Tilfeldig" },
    seed: "Startverdi",
    interval: "Intervall",
    start: "Start",
    threshold: "Grense",
    of: "av",
    items: "poster",
    populationTotal: "Populasjon",
    item: "Post",
    amount: "Beløp",
    result: "Resultat",
    results: { untested: "Ikke testet", ok: "Uten avvik", exception: "Avvik" },
    misstatement: "Feilinformasjon",
    tick: "Revisjonsmerke",
    noTick: "Ingen",
    evidence: "Bevis",
    note: "Merknad",
    by: "Av",
    agent: "Agent",
    notReviewed: "ikke gjennomgått av en person ennå",
    legend: "Forklaring til revisjonsmerker",
    summary: "Oppsummering",
    tested: "Testet",
    exceptions: "Avvik",
    known: "Kjent feilinformasjon",
    projected: "Anslått feilinformasjon",
    tolerable: "Tolererbar feilinformasjon",
    within: "Innenfor tolererbar feilinformasjon",
    exceeds: "Over tolererbar feilinformasjon",
    issues: "Før signering",
    conclusion: "Konklusjon",
    signOffs: "Signaturer",
    preparer: "Utført av",
    reviewer: "Gjennomgått av",
    notSigned: "ikke signert",
    signPreparer: "Signer som utførende",
    signReviewer: "Signer som gjennomgående",
    withdraw: "Trekk signatur",
  },
} as const;

export type AuditWorkpaperProps = {
  workpaper?: Workpaper;
  defaultWorkpaper?: Workpaper;
  population?: PopulationItem[];
  materiality?: MaterialityInput;
  tolerableMinor?: number;
  tickMarks?: TickMark[];
  actor?: string;
  /** Defaults to the profile's currency. */
  currency?: string;
  onWorkpaperChange?: (workpaper: Workpaper, details: BookiChangeDetails) => void;
  /** How a person's id is shown. */
  nameOf?: (id: string) => ReactNode;
  /** How an attachment id is described next to its field, e.g. a file name. */
  evidenceName?: (attachmentId: string) => ReactNode;
  className?: string;
  "aria-label"?: string;
};

type RootState = {
  workpaper: Workpaper;
  materiality: Materiality | null;
  tickMarks: TickMark[];
  population: { count: number; totalMinor: number };
  summary: SampleSummary;
  issues: string[];
  readyForSignOff: boolean;
  refusal: string;
};

/** Composed workpaper: materiality, the sample, the legend, the summary, the conclusion and the sign-offs. */
function AuditWorkpaper({
  workpaper,
  defaultWorkpaper,
  population,
  materiality: materialityInput,
  tolerableMinor,
  tickMarks,
  actor,
  currency,
  onWorkpaperChange,
  nameOf = (id) => id,
  evidenceName,
  className,
  "aria-label": ariaLabel,
}: AuditWorkpaperProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const access = useAccessFor(
    { drawByPerson: "audit.prepare", signAsPreparer: "audit.prepare", signAsReviewer: "audit.sign-off" },
    actor,
  );
  const copy = country === "NO" ? COPY.NO : COPY.EN;
  const unit = (currency || profile.currency) as typeof profile.currency;
  const fmt = (minor: number) => formatMoney(money(minor, unit), { locale: profile.locale });
  return (
    <AuditWorkpaperRoot
      workpaper={workpaper}
      defaultWorkpaper={defaultWorkpaper}
      population={population}
      materiality={materialityInput}
      tolerableMinor={tolerableMinor}
      tickMarks={tickMarks}
      actor={access.actor}
      denied={access.denied}
      currency={unit}
      locale={profile.locale}
      onWorkpaperChange={onWorkpaperChange}
      className={className}
      aria-label={ariaLabel ?? copy.title}
    >
      {(state: RootState) => {
        const { workpaper: paper, summary } = state;
        const sample = paper.sample;
        const signedNow = signed(paper);
        const today = localToday();
        const who = (item: WorkpaperItem) =>
          item.by === undefined ? "" : item.by === "agent" ? copy.agent : nameOf(item.by);
        return (
          <>
            {state.materiality ? (
              <dl data-slot="audit-workpaper-materiality" aria-label={copy.materiality}>
                <div>
                  <dt>{copy.benchmark}</dt>
                  <dd>{fmt(state.materiality.benchmarkMinor)}</dd>
                </div>
                <div>
                  <dt>{copy.overall}</dt>
                  <dd>{fmt(state.materiality.overallMinor)}</dd>
                </div>
                <div>
                  <dt>{copy.performance}</dt>
                  <dd>{fmt(state.materiality.performanceMinor)}</dd>
                </div>
                <div>
                  <dt>{copy.trivial}</dt>
                  <dd>{fmt(state.materiality.trivialMinor)}</dd>
                </div>
              </dl>
            ) : null}
            <p data-slot="audit-workpaper-sample" role="status">
              {sample ? (
                <>
                  {copy.sample}: {copy.methods[sample.method]}
                  {sample.method === "all-above" && sample.tolerableMinor !== undefined ? (
                    <> {fmt(sample.tolerableMinor)}</>
                  ) : null}
                  {" · "}
                  {copy.seed} {sample.seed}
                  {sample.intervalMinor !== undefined ? (
                    <>
                      {" "}
                      · {copy.interval} {fmt(sample.intervalMinor)}
                    </>
                  ) : null}
                  {sample.startMinor !== undefined ? (
                    <>
                      {" "}
                      · {copy.start} {fmt(sample.startMinor)}
                    </>
                  ) : null}
                  {" · "}
                  {sample.items.length} {copy.of} {sample.populationCount} {copy.items}
                  {" · "}
                  {copy.populationTotal} {fmt(sample.populationTotalMinor)}
                </>
              ) : (
                <>
                  {copy.noSample} · {copy.populationTotal} {state.population.count} {copy.items},{" "}
                  {fmt(state.population.totalMinor)}
                </>
              )}
            </p>
            {!sample && !signedNow ? (
              <div data-slot="audit-workpaper-draw" role="group" aria-label={copy.draw}>
                <label>
                  <span>{copy.method}</span>
                  <AuditWorkpaperMethod>
                    {SAMPLE_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {copy.methods[method]}
                      </option>
                    ))}
                  </AuditWorkpaperMethod>
                </label>
                <label>
                  <span>{copy.size}</span>
                  <AuditWorkpaperSampler value="size" placeholder={copy.sizeHint} />
                </label>
                <label>
                  <span>{copy.seed}</span>
                  <AuditWorkpaperSampler value="seed" placeholder={today} />
                </label>
                <AuditWorkpaperDraw>{copy.draw}</AuditWorkpaperDraw>
              </div>
            ) : null}
            {paper.items.length > 0 ? (
              <div data-slot="audit-workpaper-scroll">
                <table data-slot="audit-workpaper-table">
                  <thead>
                    <tr>
                      <th>{copy.item}</th>
                      <th data-align="end">{copy.amount}</th>
                      <th>{copy.result}</th>
                      <th data-align="end">{copy.misstatement}</th>
                      <th>{copy.tick}</th>
                      <th>{copy.evidence}</th>
                      <th>{copy.note}</th>
                      <th>{copy.by}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paper.items.map((item) => (
                      <tr key={item.id} data-result={item.result} data-by-agent={item.by === "agent" ? "" : undefined}>
                        <th scope="row">
                          <span data-slot="audit-workpaper-id">{item.id}</span>
                          {item.description ? (
                            <span data-slot="audit-workpaper-description">{item.description}</span>
                          ) : null}
                        </th>
                        <td data-align="end" data-slot="audit-workpaper-amount">
                          {fmt(item.amountMinor)}
                        </td>
                        <td>
                          <AuditWorkpaperResult value={item.id} aria-label={`${copy.result}: ${item.id}`}>
                            {TEST_RESULTS.map((result) => (
                              <option key={result} value={result}>
                                {copy.results[result]}
                              </option>
                            ))}
                          </AuditWorkpaperResult>
                        </td>
                        <td>
                          <AuditWorkpaperCell
                            value={`${item.id}|misstatement`}
                            aria-label={`${copy.misstatement}: ${item.id}`}
                            inputMode="decimal"
                            data-align="end"
                          />
                        </td>
                        <td>
                          <AuditWorkpaperTick value={item.id} aria-label={`${copy.tick}: ${item.id}`}>
                            <option value="">{copy.noTick}</option>
                            {state.tickMarks.map((mark) => (
                              <option key={mark.symbol} value={mark.symbol}>
                                {mark.symbol}
                              </option>
                            ))}
                          </AuditWorkpaperTick>
                        </td>
                        <td>
                          <AuditWorkpaperCell
                            value={`${item.id}|evidence`}
                            aria-label={`${copy.evidence}: ${item.id}`}
                          />
                          {evidenceName && item.evidenceId ? (
                            <span data-slot="audit-workpaper-description">{evidenceName(item.evidenceId)}</span>
                          ) : null}
                        </td>
                        <td>
                          <AuditWorkpaperCell value={`${item.id}|note`} aria-label={`${copy.note}: ${item.id}`} />
                        </td>
                        <td data-slot="audit-workpaper-by" title={item.by === "agent" ? copy.notReviewed : undefined}>
                          {who(item)}
                          {item.by === "agent" ? <span data-slot="visually-hidden"> — {copy.notReviewed}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {state.tickMarks.length > 0 ? (
              <dl data-slot="audit-workpaper-legend" aria-label={copy.legend}>
                {state.tickMarks.map((mark) => (
                  <div key={mark.symbol}>
                    <dt>{mark.symbol}</dt>
                    <dd>{mark.meaning}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {sample ? (
              <dl
                data-slot="audit-workpaper-summary"
                aria-label={copy.summary}
                data-exceeds={summary.exceedsTolerable ? "" : undefined}
              >
                <div>
                  <dt>{copy.tested}</dt>
                  <dd>
                    {summary.tested}/{summary.selected}
                  </dd>
                </div>
                <div>
                  <dt>{copy.exceptions}</dt>
                  <dd>{summary.exceptions}</dd>
                </div>
                <div>
                  <dt>{copy.known}</dt>
                  <dd>{fmt(summary.knownMisstatementMinor)}</dd>
                </div>
                <div>
                  <dt>{copy.projected}</dt>
                  <dd data-slot="audit-workpaper-projected">{fmt(summary.projectedMisstatementMinor)}</dd>
                </div>
                {summary.tolerableMinor !== undefined ? (
                  <div>
                    <dt>{copy.tolerable}</dt>
                    <dd>{fmt(summary.tolerableMinor)}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            {sample && summary.exceedsTolerable !== undefined && summary.untested === 0 ? (
              <p data-slot="audit-workpaper-verdict" data-exceeds={summary.exceedsTolerable ? "" : undefined}>
                {summary.exceedsTolerable ? copy.exceeds : copy.within}
              </p>
            ) : null}
            {sample && state.issues.length > 0 ? (
              <ul data-slot="audit-workpaper-issues" aria-label={copy.issues}>
                {state.issues.map((issue) => (
                  <li key={issue}>{say(issue)}</li>
                ))}
              </ul>
            ) : null}
            <label data-slot="audit-workpaper-conclusion">
              <span>{copy.conclusion}</span>
              <AuditWorkpaperConclusion rows={3} aria-label={copy.conclusion} />
            </label>
            <dl data-slot="audit-workpaper-sign-offs" aria-label={copy.signOffs}>
              <div data-signed={paper.preparer ? "" : undefined}>
                <dt>{copy.preparer}</dt>
                <dd>
                  {paper.preparer ? (
                    <>
                      {nameOf(paper.preparer.by)}{" "}
                      <time dateTime={paper.preparer.at}>{paper.preparer.at.slice(0, 10)}</time>
                    </>
                  ) : (
                    copy.notSigned
                  )}
                </dd>
              </div>
              <div data-signed={paper.reviewer ? "" : undefined}>
                <dt>{copy.reviewer}</dt>
                <dd>
                  {paper.reviewer ? (
                    <>
                      {nameOf(paper.reviewer.by)}{" "}
                      <time dateTime={paper.reviewer.at}>{paper.reviewer.at.slice(0, 10)}</time>
                    </>
                  ) : (
                    copy.notSigned
                  )}
                </dd>
              </div>
            </dl>
            <div data-slot="audit-workpaper-actions">
              {!paper.preparer ? (
                <AuditWorkpaperPrepare disabled={!state.readyForSignOff}>{copy.signPreparer}</AuditWorkpaperPrepare>
              ) : null}
              {paper.preparer && !paper.reviewer ? (
                <AuditWorkpaperReview disabled={!state.readyForSignOff}>{copy.signReviewer}</AuditWorkpaperReview>
              ) : null}
              {paper.preparer ? <AuditWorkpaperWithdraw>{copy.withdraw}</AuditWorkpaperWithdraw> : null}
            </div>
            {state.refusal ? (
              <p data-slot="audit-workpaper-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </AuditWorkpaperRoot>
  );
}

export {
  AuditWorkpaper,
  AuditWorkpaperCell,
  AuditWorkpaperConclusion,
  AuditWorkpaperResult,
  AuditWorkpaperMethod,
  AuditWorkpaperSampler,
  AuditWorkpaperDraw,
  AuditWorkpaperRoot,
  AuditWorkpaperPrepare,
  AuditWorkpaperReview,
  AuditWorkpaperTick,
  AuditWorkpaperWithdraw,
  auditWorkpaper,
};
export type {
  Materiality,
  MaterialityInput,
  PopulationItem,
  SampleMethod,
  SampleSummary,
  TestResult,
  TickMark,
  Workpaper,
  WorkpaperItem,
};

export { type DrawSampleOptions } from "@booki/primitives/audit-workpaper";
