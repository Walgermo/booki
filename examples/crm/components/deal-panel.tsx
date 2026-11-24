"use client";

import type { Activity } from "@booki/core/activity";
import type { Deal, DealValueStatus } from "@booki/core/pipeline";
import { ActivityTimeline, AmountField, CurrencySelect, useBookiField, type BookiChangeDetails } from "@booki/react";
import { useEffect, useState } from "react";
import { CURRENCIES } from "@/lib/data";
import { AGENT_ID, OWNERS } from "@/lib/people";

const STATUSES = [
  { value: "unknown", label: "Ubekreftet" },
  { value: "estimate", label: "Estimat" },
  { value: "known", label: "Kjent" },
];

/** The product's own select for how sure the value is, with Booki's agent action and rules. */
function StatusField({
  value,
  onValueChange,
}: {
  value: DealValueStatus;
  onValueChange: (status: DealValueStatus) => void;
}) {
  return useBookiField(
    {
      kind: "code",
      value,
      options: STATUSES,
      label: "Verdigrunnlag",
      onValueChange: (next) => onValueChange(next as DealValueStatus),
    },
    ({ value: current, change, refusal }) => (
      <span className="grid gap-1">
        <select id="deal-status" value={current} onChange={(event) => change(event.target.value, event.nativeEvent)}>
          {STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
        {refusal ? <span role="alert">{refusal}</span> : null}
      </span>
    ),
  );
}

/**
 * One deal: its value with where the figure came from, and its history and
 * next steps. The value form is a person's; the agent sets values through the
 * board's `setValue`, which takes the same rules.
 */
export function DealPanel({
  deal,
  activities,
  me,
  onSaveDeal,
  onActivitiesChange,
}: {
  deal: Deal;
  activities: Activity[];
  me: string;
  onSaveDeal: (next: Deal) => void;
  onActivitiesChange: (next: Activity[], details: BookiChangeDetails) => void;
}) {
  const [draft, setDraft] = useState(deal);
  useEffect(() => setDraft(deal), [deal]);
  const changed = JSON.stringify(draft) !== JSON.stringify(deal);
  return (
    <section aria-labelledby="deal" className="grid gap-4 rounded-lg border border-[color:var(--bk-border)] p-4">
      <header className="grid gap-1">
        <h2 id="deal" className="text-lg font-semibold">
          {deal.name}
        </h2>
        <p className="text-sm text-[color:var(--bk-muted-fg)]">{deal.company}</p>
      </header>
      <form
        data-booki=""
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveDeal(draft);
        }}
      >
        <label className="grid gap-1">
          Beløp
          <AmountField
            aria-label="Beløp"
            currency={draft.currency}
            allowEmpty
            value={draft.valueMinor}
            onEmpty={() => setDraft({ ...draft, valueMinor: null, valueStatus: "unknown" })}
            onValueChange={(minor) => setDraft({ ...draft, valueMinor: minor })}
          />
        </label>
        <label className="grid gap-1">
          Valuta
          <CurrencySelect
            currencies={CURRENCIES}
            value={draft.currency}
            onValueChange={(currency) => setDraft({ ...draft, currency })}
          />
        </label>
        <label className="grid gap-1" htmlFor="deal-status">
          Verdigrunnlag
          <StatusField value={draft.valueStatus} onValueChange={(valueStatus) => setDraft({ ...draft, valueStatus })} />
        </label>
        <label className="grid gap-1">
          Kilde for beløpet
          <input
            value={draft.valueSource ?? ""}
            placeholder="Tilbudsnummer eller grunnlag for estimatet"
            onChange={(event) => setDraft({ ...draft, valueSource: event.target.value || undefined })}
          />
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" disabled={!changed}>
            Lagre verdien
          </button>
          <button type="button" data-variant="secondary" disabled={!changed} onClick={() => setDraft(deal)}>
            Angre
          </button>
        </div>
      </form>
      <ActivityTimeline
        aria-label="Aktivitet"
        activities={activities}
        people={OWNERS}
        actor={me}
        agentActor={`agent:${AGENT_ID}`}
        onActivitiesChange={onActivitiesChange}
      />
    </section>
  );
}
