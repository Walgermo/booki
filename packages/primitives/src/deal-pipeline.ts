import { localToday } from "@booki/core/financial-date";
import { BookiError } from "@booki/core/msg";
import {
  assertStages,
  closeDeal,
  DEAL_VALUE_FIELDS,
  dealIssues,
  findDeal,
  forecast,
  moveDeal,
  pipelineSummary,
  reopenDeal,
  setDealValue,
  setExpectedClose,
  type CurrencyTotals,
  type Deal,
  type DealValuePatch,
  type PipelineStage,
  type StageSummary,
} from "@booki/core/pipeline";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { refuseDenied } from "./access.js";
import { asEvent, checkFields, recordOf } from "./fields.js";
import { restoreSelect } from "./lock.js";
import { personOnly } from "./person-only.js";

export { buttonKey } from "./fields.js";

/** How to set a deal's value, shown in the snapshot. */
export const DEAL_FORMAT =
  'setValue(id, { valueMinor: 12500000, currency: "NOK", valueStatus: "known", valueSource: "Quote 114" }); setExpectedClose(id, "2026-12-15")';

const VALUE_EXAMPLE =
  '{ "valueMinor": 12500000, "currency": "NOK", "valueStatus": "known", "valueSource": "Quote 114" }';

export type PipelineOwner = { id: string; name: string };

export type Options = {
  deals?: Deal[];
  defaultDeals?: Deal[];
  stages?: PipelineStage[];
  /** Who may own a deal. When given, `setOwner` takes only these ids. */
  owners?: PipelineOwner[];
  /** Today as YYYY-MM-DD, for deals past their expected close. Defaults to the date now. */
  today?: string;
  /** Days in one stage before a deal is called stale. Defaults to 30. */
  staleDays?: number;
  /** Id of the person at the keyboard. */
  actor?: string;
  /** A person's methods their role does not allow, each with the reason. Set by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  onDealsChange?: (deals: Deal[], details: { reason: string; source?: string; cancel?: () => void }) => void;
};

const todayOf = (options: Options) => options.today ?? localToday();

export function derive(deals: Deal[], stages: PipelineStage[], today: string, staleDays?: number) {
  return {
    summary: pipelineSummary(deals, stages) as StageSummary[],
    forecast: forecast(deals, stages) as CurrencyTotals[],
    issues: Object.fromEntries(
      deals.map((deal) => [deal.id, dealIssues(deal, stages, today, { staleDays })]),
    ) as Record<string, string[]>,
  };
}

function stagesOf(options: Options): PipelineStage[] {
  const stages = options.stages ?? [];
  assertStages(stages);
  return stages;
}

/**
 * A sales pipeline: deals in stages, with each stage's totals per currency and
 * the weighted forecast. An agent moves open deals between open stages,
 * records a deal's value with its source, and sets the expected close date
 * and the owner. A value without a source is shown and never summed. Marking
 * a deal won or lost, and reopening it, are a person's buttons.
 */
export const dealPipeline = definePrimitive({
  name: "deal-pipeline",
  options: {
    deals: "value",
    defaultDeals: "value",
    stages: "value",
    owners: "value",
    today: "string",
    staleDays: "number",
    actor: "string",
    denied: "value",
    onDealsChange: "callback",
  },
  controlled: ["deals", "stages", "owners", "summary", "forecast", "issues", "dealFormat"],
  state: (options: Options) => {
    const deals = options.deals ?? options.defaultDeals ?? [];
    const stages = stagesOf(options);
    const today = todayOf(options);
    return {
      deals,
      stages,
      owners: options.owners ?? [],
      today,
      refusal: "",
      dealFormat: DEAL_FORMAT,
      drafts: {} as Record<string, string>,
      ...derive(deals, stages, today, options.staleDays),
    };
  },
  sync: (options: Options) => ({
    ...(options.owners !== undefined ? { owners: options.owners } : {}),
    ...(options.deals !== undefined
      ? { deals: options.deals, ...derive(options.deals, stagesOf(options), todayOf(options), options.staleDays) }
      : {}),
  }),
  api: (context) => {
    const change = createChange(context);
    const rederive = () => {
      const { deals, stages, today } = context.store.get();
      context.store.set(derive(deals, stages, today, context.options().staleDays));
    };
    context.onOptions((options) => {
      const patch: Record<string, unknown> = {};
      if (options.stages !== undefined && options.stages !== context.store.get().stages)
        patch.stages = stagesOf(options);
      const today = todayOf(options);
      if (today !== context.store.get().today) patch.today = today;
      if (Object.keys(patch).length) {
        context.store.set(patch);
        rederive();
      }
    });
    const now = () => new Date().toISOString();
    const commit = (next: Deal[], reason: string, event?: Event) => {
      // Controlled, the owner passes the deals back through sync; until then the board keeps what it has.
      const ok = change("deals", next, { reason, event });
      if (!ok) return false;
      context.store.set({ refusal: "" });
      rederive();
      return true;
    };
    const put = (deal: Deal, reason: string, event?: Event) => {
      const deals = context.store.get().deals;
      const before = deals.find((item) => item.id === deal.id);
      if (before === deal) return false;
      return commit(
        deals.map((item) => (item.id === deal.id ? deal : item)),
        reason,
        event,
      );
    };
    const find = (id: unknown) => findDeal(context.store.get().deals, id);
    const shown = <T>(run: () => T): T => {
      try {
        return run();
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };
    const gated = <T>(method: string, run: () => T): T =>
      shown(() => {
        refuseDenied(context.options(), method);
        return run();
      });
    const person = () => {
      const actor = String(context.options().actor ?? "").trim();
      if (actor === "") throw new BookiError("permissions.signed-out", { permission: "deal.close" });
      return actor;
    };
    return {
      /** Agent and person: move an open deal to another open stage. A won or lost stage is refused. */
      moveDeal: (dealId: string, stageId: string, event?: Event) =>
        shown(() => {
          const deal = find(dealId);
          return put(moveDeal(deal, context.store.get().stages, String(stageId), now()), "move-deal", asEvent(event));
        }),
      /** Agent: the deal's value, how sure it is and where it came from. */
      setValue: (dealId: string, patch: DealValuePatch) =>
        shown(() => {
          const deal = find(dealId);
          const fields = checkFields("setValue", patch, DEAL_VALUE_FIELDS, VALUE_EXAMPLE) as DealValuePatch;
          return put(setDealValue(deal, fields), "set-value");
        }),
      /** Agent: the expected close date, YYYY-MM-DD, or "" to clear it. */
      setExpectedClose: (dealId: string, date: string) =>
        shown(() => put(setExpectedClose(find(dealId), String(date ?? "")), "set-expected-close")),
      /** Agent: the deal's owner, one of `owners` (by id or name), or "" for none. */
      setOwner: (dealId: string, ownerId: string) =>
        shown(() => {
          const deal = find(dealId);
          const raw = String(ownerId ?? "").trim();
          if (raw === "") {
            const { ownerId: _o, ...rest } = deal;
            return deal.ownerId === undefined ? false : put(rest, "set-owner");
          }
          const owners = context.store.get().owners;
          const owner =
            owners.length === 0
              ? { id: raw }
              : (owners.find((item) => item.id === raw) ??
                owners.find((item) => item.name.trim().toLowerCase() === raw.toLowerCase()));
          if (!owner) {
            throw new BookiError("pipeline.no-owner", {
              id: deal.id,
              owner: raw,
              owners: owners.map((item) => `${item.id} (${item.name})`).join(", "),
            });
          }
          return deal.ownerId === owner.id ? false : put({ ...deal, ownerId: owner.id }, "set-owner");
        }),
      items: () => context.store.get().deals.map((deal) => ({ value: deal.id, label: deal.name })),
      // Everything below is for a person. It is not in `agent.actions`, so the
      // bridge refuses a step that names it.
      /** Person only: the deal is won. */
      closeWon: (dealId: string, event?: Event) =>
        gated("closeWon", () =>
          put(closeDeal(find(dealId), context.store.get().stages, "won", person(), now()), "close-won", event),
        ),
      /** Hold the reason being typed for a lost deal. Not reported to the bridge. */
      setReason: (dealId: string, text: string) => {
        context.store.set({ drafts: { ...context.store.get().drafts, [String(dealId)]: String(text ?? "") } });
      },
      /** Person only: the deal is lost, for the reason typed. */
      closeLost: (dealId: string, event?: Event) =>
        gated("closeLost", () => {
          const { [String(dealId)]: reason = "", ...rest } = context.store.get().drafts;
          const ok = put(
            closeDeal(find(dealId), context.store.get().stages, "lost", person(), now(), reason),
            "close-lost",
            event,
          );
          if (ok) context.store.set({ drafts: rest });
          return ok;
        }),
      /** Person only: back into the last open stage. */
      reopen: (dealId: string, event?: Event) =>
        gated("reopen", () => {
          const stages = context.store.get().stages;
          const open = stages.filter((stage) => !stage.outcome);
          const target = open[open.length - 1];
          if (!target)
            throw new BookiError("pipeline.no-stage", { stage: "", stages: stages.map((s) => s.id).join(", ") });
          return put(reopenDeal(find(dealId), stages, target.id, person(), now()), "reopen-deal", event);
        }),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      state: (state) => ({
        deals: state.deals,
        stages: state.stages,
        owners: state.owners,
        summary: state.summary,
        forecast: state.forecast,
        issues: state.issues,
        drafts: state.drafts,
        refusal: state.refusal,
      }),
    }),
    // A person's stage picker on a card: `value` is the deal id.
    move: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        value: state.deals.find((deal: Deal) => deal.id === String(part.key))?.stageId ?? "",
      }),
      on: {
        input: (event, { api, key, store }) => {
          try {
            api.moveDeal(String(key), (event.target as HTMLSelectElement).value, event);
          } catch {
            /* shown in the control */
          }
          restoreSelect(event, store.get().deals.find((deal: Deal) => deal.id === String(key))?.stageId ?? "");
        },
      },
    }),
    // `value` is the deal's `buttonKey`, e.g. "D-1#won".
    won: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button", "data-agent-confirm": personOnly("Marking a deal won needs a person") }),
      press: ({ api, key }, event) => {
        try {
          api.closeWon(recordOf(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    reason: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({ value: state.drafts[String(part.key)] ?? "" }),
      on: {
        input: (event, { api, key }) => {
          api.setReason(String(key), (event.target as HTMLTextAreaElement).value);
        },
      },
    }),
    lost: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({
        type: "button",
        "data-variant": "secondary",
        "data-agent-confirm": personOnly("Marking a deal lost needs a person"),
      }),
      press: ({ api, key }, event) => {
        try {
          api.closeLost(recordOf(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    reopen: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({
        type: "button",
        "data-variant": "secondary",
        "data-agent-confirm": personOnly("Reopening a closed deal needs a person"),
      }),
      press: ({ api, key }, event) => {
        try {
          api.reopen(recordOf(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: { actions: ["moveDeal", "setValue", "setExpectedClose", "setOwner"], items: (api) => api.items() },
});
