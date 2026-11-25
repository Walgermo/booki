import { formatPeriod } from "@booki-aui/core/period";
import type { BookiChangeDetails } from "./change-details.js";
import { type PeriodState, type PeriodStatus } from "@booki-aui/core/period-lock";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import { useAccessFor } from "./access.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { useWorkflowCopy } from "./workflow-copy.js";
import { periodLock } from "@booki-aui/primitives/period-lock";

const TAGS = { root: "div", set: "button" } as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof periodLock, typeof TAGS> = createParts(periodLock, TAGS);
const PeriodLockRoot: (typeof parts)["Root"] = parts.Root;
const PeriodLockSet: (typeof parts)["Set"] = parts.Set;

export type PeriodLockProps = {
  /** The period codes to list, e.g. `["2026-01", "2026-02"]`. */
  codes: string[];
  periods?: PeriodState[];
  defaultPeriods?: PeriodState[];
  onPeriodsChange?: (periods: PeriodState[], details: BookiChangeDetails) => void;
  className?: string;
  "aria-label"?: string;
};

/** Composed period list: each period, its status, and the buttons that change it. */
function PeriodLock({
  codes,
  periods,
  defaultPeriods,
  onPeriodsChange,
  className,
  "aria-label": ariaLabel,
}: PeriodLockProps) {
  const copy = useWorkflowCopy();
  const { profile } = useBookiLocaleOptional();
  const say = useSay();
  const access = useAccessFor({ setStatus: "period.close" });
  const label: Record<PeriodStatus, string> = {
    open: copy.open,
    "soft-closed": copy.softClosed,
    "hard-closed": copy.hardClosed,
  };
  return (
    <PeriodLockRoot
      periods={periods}
      defaultPeriods={defaultPeriods}
      denied={access.denied}
      onPeriodsChange={onPeriodsChange}
      className={className}
      aria-label={ariaLabel ?? copy.periods}
    >
      {(state: { periods: PeriodState[]; refusal: string }) => (
        <>
          <table data-slot="period-lock-table">
            <thead>
              <tr>
                <th>{copy.period}</th>
                <th>{copy.status}</th>
                <th>
                  <span data-slot="visually-hidden">{copy.status}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => {
                const status = state.periods.find((p) => p.code === code)?.status ?? "open";
                const name = formatPeriod(code, profile.locale);
                return (
                  <tr key={code} data-status={status}>
                    <td>{name}</td>
                    <td data-slot="period-lock-status">{label[status]}</td>
                    <td data-slot="period-lock-actions">
                      {status === "open" ? (
                        <PeriodLockSet value={`${code}|soft-closed`} aria-label={`${copy.closePeriod}: ${name}`}>
                          {copy.closePeriod}
                        </PeriodLockSet>
                      ) : null}
                      {status === "soft-closed" ? (
                        <>
                          <PeriodLockSet value={`${code}|hard-closed`} aria-label={`${copy.lockPeriod}: ${name}`}>
                            {copy.lockPeriod}
                          </PeriodLockSet>
                          <PeriodLockSet
                            value={`${code}|open`}
                            data-variant="secondary"
                            aria-label={`${copy.reopenPeriod}: ${name}`}
                          >
                            {copy.reopenPeriod}
                          </PeriodLockSet>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {state.refusal ? (
            <p data-slot="period-lock-error" role="alert">
              {say(state.refusal)}
            </p>
          ) : null}
        </>
      )}
    </PeriodLockRoot>
  );
}

export { PeriodLock, PeriodLockRoot, PeriodLockSet, periodLock };
export type { PeriodState, PeriodStatus };
