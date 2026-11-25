import { localToday } from "@booki-aui/core/financial-date";
import {
  accumulatedDepreciation,
  assertRunnable,
  carryingAmount,
  depreciationFor,
  depreciationSchedule,
  disposeAsset,
  periodMonths,
  type DepreciationMethod,
  type DepreciationRun,
  type Disposal,
  type FixedAsset,
  type RunAccount,
  type ScheduleEntry,
} from "@booki-aui/core/fixed-assets";
import { BookiError } from "@booki-aui/core/msg";
import { parseToMinor } from "@booki-aui/core/money";
import { periodBounds } from "@booki-aui/core/period";
import { createChange, definePrimitive, dispatch } from "@ui-sdk/core";
import { refuseDenied } from "./access.js";

export type Details = { reason: string; source?: string; cancel?: () => void };

export type Options = {
  /** Person's methods their role does not allow, with the reason. Filled by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  assets?: FixedAsset[];
  defaultAssets?: FixedAsset[];
  /** The period the register is shown as of: a month `2026-03` or a year `2026`. */
  period?: string;
  defaultPeriod?: string;
  /** Period codes already depreciated. */
  runs?: string[];
  defaultRuns?: string[];
  /** The account a run debits. */
  expenseAccount?: RunAccount;
  /** The account a run credits. */
  accumulatedAccount?: RunAccount;
  /** Currency and locale a person's typed proceeds are read in. */
  currency?: string;
  locale?: string;
  onAssetsChange?: (assets: FixedAsset[], details: Details) => void;
  onPeriodChange?: (period: string, details: Details) => void;
  onRunsChange?: (runs: string[], details: Details) => void;
  /** A person confirmed the run: post these lines. Call `details.cancel()` to refuse. */
  onRun?: (run: DepreciationRun, details: Details) => void;
  /** A person disposed of an asset: book the gain or loss. */
  onDispose?: (disposal: Disposal, details: Details) => void;
};

/** One line of the register as of the period. */
export type AssetRow = {
  id: string;
  name: string;
  method: DepreciationMethod;
  acquiredOn: string;
  disposedOn?: string;
  costMinor: number;
  /** Depreciation in the period. */
  depreciationMinor: number;
  /** Accumulated depreciation at the end of the period. */
  accumulatedMinor: number;
  /** Carrying amount at the end of the period. Zero once disposed of. */
  carryingMinor: number;
  /** Why the asset cannot be depreciated, when its data is wrong. */
  issue?: string;
};

export const DEFAULT_EXPENSE: RunAccount = { number: "6000", name: "Depreciation" };
export const DEFAULT_ACCUMULATED: RunAccount = { number: "1209", name: "Accumulated depreciation" };

export const thisMonth = () => localToday().slice(0, 7);

export type Core = { assets: FixedAsset[]; period: string; runs: string[]; openAssetId: string };

export const runOptions = (options: Options, runs: string[]) => ({
  expenseAccount: options.expenseAccount ?? DEFAULT_EXPENSE,
  accumulatedAccount: options.accumulatedAccount ?? DEFAULT_ACCUMULATED,
  runs,
});

export function derive(core: Core, options: Options) {
  const asOf = periodBounds(core.period)?.to;
  const rows = core.assets.map((asset): AssetRow => {
    const base = {
      id: asset.id,
      name: asset.name,
      method: asset.method,
      acquiredOn: asset.acquiredOn,
      ...(asset.disposedOn ? { disposedOn: asset.disposedOn } : {}),
      costMinor: asset.costMinor,
    };
    try {
      if (!asOf) throw new Error(`"${core.period}" is not a period code.`);
      return {
        ...base,
        depreciationMinor: depreciationFor(asset, core.period),
        accumulatedMinor: accumulatedDepreciation(asset, asOf),
        carryingMinor: carryingAmount(asset, asOf),
      };
    } catch (error) {
      return { ...base, depreciationMinor: 0, accumulatedMinor: 0, carryingMinor: 0, issue: (error as Error).message };
    }
  });
  const open = core.assets.find((asset) => asset.id === core.openAssetId);
  let schedule: ScheduleEntry[] = [];
  try {
    if (open) schedule = depreciationSchedule(open);
  } catch {
    /* the row carries the issue */
  }
  let runnable = false;
  try {
    assertRunnable(core.assets, core.period, runOptions(options, core.runs));
    runnable = true;
  } catch {
    /* assertRunnable says why */
  }
  return { rows, schedule, runnable };
}

/**
 * The register of fixed assets as of a period: cost, accumulated depreciation
 * and carrying amount, with each asset's schedule behind it. An agent may move
 * the period, open an asset, and propose a depreciation run, which puts the
 * voucher lines on screen and changes nothing. Confirming the run and disposing
 * of an asset are a person's buttons, not agent actions.
 */
export const fixedAssetRegister = definePrimitive({
  name: "fixed-asset-register",
  options: {
    denied: "value",
    assets: "value",
    defaultAssets: "value",
    period: "string",
    defaultPeriod: "string",
    runs: "value",
    defaultRuns: "value",
    expenseAccount: "value",
    accumulatedAccount: "value",
    currency: "string",
    locale: "string",
    onAssetsChange: "callback",
    onPeriodChange: "callback",
    onRunsChange: "callback",
    onRun: "callback",
    onDispose: "callback",
  },
  controlled: ["period", "openAssetId", "rows", "schedule", "proposal", "runs", "runnable"],
  state: (options: Options) => {
    const core: Core = {
      assets: options.assets ?? options.defaultAssets ?? [],
      period: options.period ?? options.defaultPeriod ?? thisMonth(),
      runs: options.runs ?? options.defaultRuns ?? [],
      openAssetId: "",
    };
    return {
      ...core,
      proposal: null as DepreciationRun | null,
      lastDisposal: null as Disposal | null,
      refusal: "",
      drafts: {} as Record<string, string>,
      ...derive(core, options),
    };
  },
  sync: (options: Options) => ({
    ...(options.assets === undefined ? {} : { assets: options.assets }),
    ...(options.period === undefined ? {} : { period: options.period }),
    ...(options.runs === undefined ? {} : { runs: options.runs }),
  }),
  api: (context) => {
    const change = createChange(context);
    /** Recompute the figures from what is in the store, or from `over` when a change was just made. */
    const refresh = (over: Partial<Core> = {}) => {
      const options = context.options();
      const state = context.store.get();
      const core: Core = {
        assets: over.assets ?? options.assets ?? state.assets,
        period: over.period ?? options.period ?? state.period,
        runs: over.runs ?? options.runs ?? state.runs,
        openAssetId: over.openAssetId ?? state.openAssetId,
      };
      const next = derive(core, options);
      if (
        JSON.stringify([state.rows, state.schedule, state.runnable]) !==
        JSON.stringify([next.rows, next.schedule, next.runnable])
      ) {
        context.store.set(next);
      }
    };
    context.onOptions(() => refresh());
    const shown = <T>(run: () => T): T => {
      try {
        const result = run();
        if (context.store.get().refusal !== "") context.store.set({ refusal: "" });
        return result;
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };
    /** A person's button their role does not allow is refused before it runs. */
    const gated = <T>(method: string, run: () => T): T =>
      shown(() => {
        refuseDenied(context.options(), method);
        return run();
      });
    const asset = (assetId: string) => {
      const { assets } = context.store.get();
      const found = assets.find((item) => item.id === String(assetId));
      if (!found) {
        throw new BookiError("assets.no-asset", {
          id: String(assetId),
          ids: assets.map((item) => item.id).join(", ") || "none",
        });
      }
      return found;
    };
    const build = (periodCode?: string) => {
      const state = context.store.get();
      const code = periodCode === undefined || periodCode === null ? state.period : String(periodCode);
      return assertRunnable(state.assets, code, runOptions(context.options(), state.runs));
    };

    function setPeriod(periodCode: string, event?: Event) {
      const code = String(periodCode ?? "").trim();
      periodMonths(code);
      const ok = change("period", code, { reason: "set-period", event });
      if (ok) refresh({ period: code });
      return ok;
    }
    function open(assetId: string, event?: Event) {
      const found = asset(assetId);
      const ok = change("openAssetId", found.id, { reason: "open-asset", event });
      if (ok) {
        context.store.set({ lastDisposal: null, drafts: {} });
        refresh({ openAssetId: found.id });
      }
      return ok;
    }
    function back(event?: Event) {
      const ok = change("openAssetId", "", { reason: "back", event });
      if (ok) refresh({ openAssetId: "" });
      return ok;
    }
    function propose(periodCode?: string, event?: Event) {
      return change("proposal", build(periodCode), { reason: "propose-run", event });
    }
    function dispose(assetId: string, date: string, proceedsMinor: number, event?: Event) {
      const disposal = disposeAsset(asset(assetId), date, proceedsMinor);
      if (dispatch(context, "onDispose", disposal, { reason: "dispose-asset", event })) return false;
      const next = context.store.get().assets.map((item) => (item.id === disposal.asset.id ? disposal.asset : item));
      const ok = change("assets", next, { reason: "dispose-asset", event });
      if (ok) {
        // A proposed run was worked out with the asset still on the books.
        context.store.set({ lastDisposal: disposal, proposal: null, drafts: {} });
        refresh({ assets: next });
      }
      return ok;
    }

    return {
      /** Agent: show the register as of a month (`2026-03`) or a year (`2026`). */
      setPeriod: (periodCode: string) => setPeriod(periodCode),
      /** Agent: show one asset's schedule. */
      openAsset: (assetId: string) => open(assetId),
      /** Agent: return to the register. */
      back: () => back(),
      /**
       * Agent: work out the depreciation for a period (the shown one when left out)
       * and put the voucher lines on screen for a person. Changes no asset and posts nothing.
       */
      proposeRun: (periodCode?: string) => propose(periodCode),
      /** Agent: throws when the period was already run or nothing can be depreciated in it. */
      assertRunnable: (periodCode?: string) => {
        const run = build(periodCode);
        return { period: run.period, totalMinor: run.totalMinor, assets: run.entries.length, skipped: run.skipped };
      },
      // Everything below is for a person using the composed register. It is not
      // in `agent.actions`, so the bridge refuses a step that names it.
      setPeriodByPerson: (periodCode: string, event?: Event) => shown(() => setPeriod(periodCode, event)),
      openByPerson: (assetId: string, event?: Event) => shown(() => open(assetId, event)),
      backByPerson: (event?: Event) => shown(() => back(event)),
      proposeByPerson: (event?: Event) => shown(() => propose(undefined, event)),
      /** Person only. Drop the proposed run. */
      discardRun: (event?: Event) => shown(() => change("proposal", null, { reason: "discard-run", event })),
      /**
       * Person only. Hands the proposed lines to `onRun` and records the period
       * as run, so it cannot be depreciated again.
       */
      confirmRun: (event?: Event) =>
        gated("confirmRun", () => {
          const { proposal, runs } = context.store.get();
          if (!proposal) throw new Error("There is no proposed run to confirm. Propose a run first.");
          // The assets or the runs may have changed since it was proposed.
          const now = build(proposal.period);
          if (JSON.stringify(now.lines) !== JSON.stringify(proposal.lines)) {
            throw new Error(
              `The assets have changed since the run for ${proposal.period} was proposed. Propose it again.`,
            );
          }
          if (dispatch(context, "onRun", proposal, { reason: "confirm-run", event })) return false;
          const next = [...runs, proposal.period];
          const ok = change("runs", next, { reason: "depreciation-run", event });
          if (ok) {
            context.store.set({ proposal: null });
            refresh({ runs: next });
          }
          return ok;
        }),
      /** Person only. Sold, scrapped or lost: computes the gain or loss against the carrying amount. */
      dispose: (assetId: string, date: string, proceedsMinor: number, event?: Event) =>
        gated("dispose", () => dispose(assetId, date, proceedsMinor, event)),
      /** Hold what a person types: "period", "date" or "proceeds". */
      setDraft: (cell: string, text: string) => {
        context.store.set({ drafts: { ...context.store.get().drafts, [cell]: text } });
      },
      /** Commit the typed period. Refused text is dropped and the field shows the period again. */
      commitPeriod: (event?: Event) => {
        const { drafts } = context.store.get();
        if (!("period" in drafts)) return false;
        const { period: text = "", ...rest } = drafts;
        context.store.set({ drafts: rest });
        return shown(() => setPeriod(text, event));
      },
      /** Dispose of the open asset with the typed date and proceeds. */
      disposeTyped: (event?: Event) =>
        gated("disposeTyped", () => {
          const { drafts, openAssetId } = context.store.get();
          const { currency, locale } = context.options();
          const text = (drafts.proceeds ?? "").trim();
          const proceeds =
            text === "" ? 0 : parseToMinor(text, (currency ?? "USD") as Parameters<typeof parseToMinor>[1], { locale });
          if (proceeds === null) throw new Error(`"${text}" is not an amount.`);
          return dispose(openAssetId, (drafts.date ?? "").trim(), proceeds, event);
        }),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-view": state.openAssetId ? "asset" : "register" }),
      state: (state) => ({
        assets: state.assets,
        period: state.period,
        runs: state.runs,
        openAssetId: state.openAssetId,
        rows: state.rows,
        schedule: state.schedule,
        proposal: state.proposal,
        runnable: state.runnable,
        lastDisposal: state.lastDisposal,
        refusal: state.refusal,
      }),
    }),
    // The period the register is shown as of, typed as a code.
    period: slot({
      attrs: (state) => ({
        type: "text",
        autoComplete: "off",
        value: "period" in state.drafts ? (state.drafts.period ?? "") : state.period,
      }),
      on: {
        // "input" is the adapter's name for React's onChange.
        input: (event, { api }) => {
          api.setDraft("period", (event.target as HTMLInputElement).value);
        },
        blur: (event, { api }) => {
          try {
            api.commitPeriod(event);
          } catch {
            /* shown in the control */
          }
        },
        keydown: (event, { api }) => {
          if ((event as KeyboardEvent).key !== "Enter") return;
          event.preventDefault();
          try {
            api.commitPeriod(event);
          } catch {
            /* shown in the control */
          }
        },
      },
    }),
    // One button per asset. `value` is the asset id and is the part's key.
    open: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }, event) => {
        try {
          api.openByPerson(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    back: slot({
      attrs: () => ({ type: "button", "data-variant": "secondary" }),
      press: ({ api }, event) => {
        try {
          api.backByPerson(event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    propose: slot({
      attrs: () => ({ type: "button", "data-variant": "secondary" }),
      press: ({ api }, event) => {
        try {
          api.proposeByPerson(event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    confirm: slot({
      attrs: () => ({ type: "button" }),
      press: ({ api }, event) => {
        try {
          api.confirmRun(event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    discard: slot({
      attrs: () => ({ type: "button", "data-variant": "secondary" }),
      press: ({ api }, event) => {
        try {
          api.discardRun(event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    // The disposal form's two fields. `value` is "date" or "proceeds".
    cell: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        type: String(part.key) === "date" ? "date" : "text",
        autoComplete: "off",
        value: state.drafts[String(part.key)] ?? "",
      }),
      on: {
        input: (event, { api, key }) => {
          api.setDraft(String(key), (event.target as HTMLInputElement).value);
        },
      },
    }),
    dispose: slot({
      attrs: () => ({ type: "button", "data-variant": "secondary" }),
      press: ({ api }, event) => {
        try {
          api.disposeTyped(event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: { actions: ["setPeriod", "openAsset", "back", "proposeRun", "assertRunnable"] },
});
