import type { PipelineStage } from "@booki-aui/core/pipeline";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import type { ReactNode } from "react";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import {
  derive,
  stageDuration,
  type Details,
  type StageDuration,
  type StageStay,
} from "@booki-aui/primitives/stage-duration";

const TAGS = { root: "div", stage: "button" } as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof stageDuration, typeof TAGS> = createParts(stageDuration, TAGS);
const StageDurationRoot: (typeof parts)["Root"] = parts.Root;
const StageDurationStage: (typeof parts)["Stage"] = parts.Stage;

const COPY = {
  EN: {
    label: "Time in stage",
    days: (n: number) => (n === 1 ? "1 day" : `${n} days`),
    median: "Median",
    longest: "Longest",
    target: "Target",
    now: "Now",
    over: (n: number) => (n === 1 ? "1 over target" : `${n} over target`),
    slowest: "Slowest stage",
    overList: "Over target",
    none: "No stays to show yet.",
  },
  NO: {
    label: "Tid i fase",
    days: (n: number) => (n === 1 ? "1 dag" : `${n} dager`),
    median: "Median",
    longest: "Lengst",
    target: "Mål",
    now: "Nå",
    over: (n: number) => `${n} over målet`,
    slowest: "Tregeste fase",
    overList: "Over målet",
    none: "Ingen opphold å vise ennå.",
  },
} as const;

export type StageDurationProps = {
  stays: StageStay[];
  stages: PipelineStage[];
  /** Target days per stage id. */
  targets?: Record<string, number>;
  today?: string;
  drill?: string | null;
  defaultDrill?: string | null;
  onDrill?: (stageId: string, details: Details) => void;
  /** A deal's name for an id. */
  nameOf?: (dealId: string) => ReactNode;
  title?: string;
  className?: string;
  "aria-label"?: string;
};

type RootState = { drill: string | null; refusal: string };

/** Composed chart: per open stage a bar of the median stay, the longest, its target, and the deals over it. */
function StageDurationChart({
  stays,
  stages,
  targets,
  today,
  drill,
  defaultDrill,
  onDrill,
  nameOf = (id) => id,
  title,
  className,
  "aria-label": ariaLabel,
}: StageDurationProps) {
  const { country } = useBookiLocaleOptional();
  const say = useSay();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  return (
    <StageDurationRoot
      stays={stays}
      stages={stages}
      targets={targets}
      today={today}
      drill={drill}
      defaultDrill={defaultDrill}
      onDrillChange={(next: string | null, details: Details) => {
        if (next !== null) onDrill?.(next, details);
      }}
      className={className}
      aria-label={ariaLabel ?? title ?? copy.label}
    >
      {(state: RootState) => {
        const view = derive({ stays, stages, targets, today }, state.drill);
        const top = Math.max(1, ...view.rows.map((row) => Math.max(row.longestDays ?? 0, row.targetDays ?? 0)));
        const slowest = view.rows.find((row) => row.stageId === view.slowestId);
        return (
          <>
            {title ? <h3 data-slot="stage-duration-title">{title}</h3> : null}
            {view.rows.every((row) => row.count === 0) ? (
              <p data-slot="stage-duration-empty">{copy.none}</p>
            ) : (
              <ol data-slot="stage-duration-rows">
                {view.rows.map((row: StageDuration) => (
                  <li
                    key={row.stageId}
                    data-slot="stage-duration-row"
                    data-over={row.overTarget.length ? "" : undefined}
                  >
                    <StageDurationStage
                      value={row.stageId}
                      aria-label={`${row.name}: ${copy.median} ${row.medianDays === null ? "–" : copy.days(row.medianDays)}, ${copy.longest} ${row.longestDays === null ? "–" : copy.days(row.longestDays)}${row.overTarget.length ? `, ${copy.over(row.overTarget.length)}` : ""}`}
                    >
                      <span data-slot="stage-duration-label">{row.name}</span>
                      <span data-slot="stage-duration-track">
                        {row.longestDays !== null ? (
                          <span
                            data-slot="stage-duration-range"
                            style={{ width: `${(row.longestDays / top) * 100}%` }}
                          />
                        ) : null}
                        {row.medianDays !== null ? (
                          <span
                            data-slot="stage-duration-bar"
                            style={{ width: `${Math.max(1, (row.medianDays / top) * 100)}%` }}
                          />
                        ) : null}
                        {row.targetDays !== null ? (
                          <span
                            data-slot="stage-duration-target"
                            style={{ left: `${(row.targetDays / top) * 100}%` }}
                          />
                        ) : null}
                      </span>
                      <span data-slot="stage-duration-median">
                        {row.medianDays === null ? "–" : copy.days(row.medianDays)}
                      </span>
                    </StageDurationStage>
                    <p data-slot="stage-duration-meta">
                      {copy.longest} {row.longestDays === null ? "–" : copy.days(row.longestDays)}
                      {row.targetDays !== null ? ` · ${copy.target} ${copy.days(row.targetDays)}` : ""} · {copy.now}{" "}
                      {row.current.length}
                      {row.overTarget.length ? ` · ${copy.over(row.overTarget.length)}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
            {slowest ? (
              <p data-slot="stage-duration-summary" role="status">
                {copy.slowest}: {slowest.name} ({copy.median.toLowerCase()} {copy.days(slowest.medianDays ?? 0)})
              </p>
            ) : null}
            {view.drilled && view.drilled.overTarget.length ? (
              <p data-slot="stage-duration-over">
                {copy.overList}:{" "}
                {view.drilled.overTarget.map((id, index) => (
                  <span key={id}>
                    {index ? ", " : ""}
                    {nameOf(id)}
                  </span>
                ))}
              </p>
            ) : null}
            {state.refusal ? (
              <p data-slot="stage-duration-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </StageDurationRoot>
  );
}

export { StageDurationChart, StageDurationRoot, StageDurationStage, stageDuration };
export type { StageDuration, StageStay };
