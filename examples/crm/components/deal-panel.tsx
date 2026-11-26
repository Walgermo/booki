"use client";

import type { Activity } from "@booki-aui/core/activity";
import type { Deal, DealValueStatus } from "@booki-aui/core/pipeline";
import {
  ActivityTimeline,
  AmountField,
  CurrencySelect,
  useBookiField,
  type BookiChangeDetails,
} from "@booki-aui/react";
import { useState } from "react";
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
  return (
    <section aria-labelledby="deal" className="grid gap-4 rounded-lg border border-[color:var(--bk-border)] p-4">
      <header className="grid gap-1">
        <h2 id="deal" className="text-lg font-semibold">
          {deal.name}
        </h2>
        <p className="text-sm text-[color:var(--bk-muted-fg)]">{deal.company}</p>
      </header>
      {/* Keyed by the deal: when the server changes it (the agent set a value), the form starts from the new one. */}
      <ValueForm key={JSON.stringify(deal)} deal={deal} onSaveDeal={onSaveDeal} />
      {/* One timeline per deal: a step aimed at this deal's timeline never lands on the next one's. */}
      <ActivityTimeline
        key={deal.id}
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

/** How sure and from where, as the person set them, and the figure they were set for. */
type Evidence = { figure?: string; valueStatus?: DealValueStatus; valueSource?: string | null };

const figureKey = ({ valueMinor, currency }: { valueMinor: number | null; currency: string }) =>
  `${currency}:${valueMinor ?? ""}`;

/** A person's form for the deal's value: how much, in what currency, how sure, and from where. */
function ValueForm({ deal, onSaveDeal }: { deal: Deal; onSaveDeal: (next: Deal) => void }) {
  // Undo starts the amount field over: text it refused is not the deal's, and it would block the next save.
  const [round, setRound] = useState(0);
  const [figure, setFigure] = useState({ valueMinor: deal.valueMinor, currency: deal.currency });
  // How sure and from where, once the person has set them, for the figure they set them for. Until then, and
  // once the figure changes again, they follow the figure: the deal's own for the deal's figure, and none for
  // a new one, since a source vouches for the figure it was given for and no other.
  const [evidence, setEvidence] = useState<Evidence>({});
  const held = evidence.figure === figureKey(figure) ? evidence : {};
  const sameFigure = figure.valueMinor === deal.valueMinor && figure.currency === deal.currency;
  const draft: Deal = {
    ...deal,
    ...figure,
    valueStatus: held.valueStatus ?? (sameFigure ? deal.valueStatus : "unknown"),
    valueSource:
      held.valueSource !== undefined ? (held.valueSource ?? undefined) : sameFigure ? deal.valueSource : undefined,
  };
  if (draft.valueSource === undefined) delete draft.valueSource;
  const setDraft = (next: Deal) => {
    const nextFigure = { valueMinor: next.valueMinor, currency: next.currency };
    const key = figureKey(nextFigure);
    // A new figure starts without the evidence given for the one before.
    const kept: Evidence = key === figureKey(figure) ? { ...held } : {};
    if (next.valueStatus !== draft.valueStatus) kept.valueStatus = next.valueStatus;
    if (next.valueSource !== draft.valueSource) kept.valueSource = next.valueSource ?? null;
    setFigure(nextFigure);
    setEvidence({ ...kept, figure: key });
  };
  const changed = JSON.stringify(draft) !== JSON.stringify(deal);
  return (
    <form
      data-booki=""
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSaveDeal(draft);
      }}
    >
      <div className="grid gap-1">
        <label htmlFor="deal-amount">Beløp</label>
        <AmountField
          key={round}
          id="deal-amount"
          aria-label="Beløp"
          currency={draft.currency}
          allowEmpty
          value={draft.valueMinor}
          onEmpty={() => setDraft({ ...draft, valueMinor: null, valueStatus: "unknown" })}
          onValueChange={(minor) => setDraft({ ...draft, valueMinor: minor })}
        />
      </div>
      <div className="grid gap-1">
        <label htmlFor="deal-currency">Valuta</label>
        <CurrencySelect
          id="deal-currency"
          currencies={CURRENCIES}
          value={draft.currency}
          onValueChange={(currency) => setDraft({ ...draft, currency })}
        />
      </div>
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
        <button
          type="button"
          data-variant="secondary"
          disabled={!changed}
          onClick={() => {
            setFigure({ valueMinor: deal.valueMinor, currency: deal.currency });
            setEvidence({});
            setRound((count) => count + 1);
          }}
        >
          Angre
        </button>
      </div>
    </form>
  );
}
