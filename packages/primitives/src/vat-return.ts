import {
  DRAFT_VAT_FILING,
  assertVatReturnReady,
  computeVatReturn,
  markVatReturnReady,
  submitVatReturn,
  vatReturnIssues,
  type VatBoxVoucher,
  type VatReturnBox,
  type VatReturnComputation,
  type VatReturnFiling,
  type VatReturnSchema,
  type VatTransaction,
} from "@booki-aui/core/vat-return";
import { BookiError } from "@booki-aui/core/msg";
import { createChange, definePrimitive, dispatch } from "@ui-sdk/core";
import { refuseDenied } from "./access.js";

export type Details = { reason: string; source?: string; cancel?: () => void };

/** A box as the snapshot shows it: the amount and how many transactions are behind it. */
export type VatBoxSummary = {
  id: string;
  label: string;
  kind: VatReturnBox["kind"];
  amountMinor: number;
  voucherCount: number;
};

/** What `onSubmit` receives. The app files the return; the library never does. */
export type VatReturnSubmission = {
  country: string;
  period: string;
  payableMinor: number;
  direction: VatReturnComputation["direction"];
  boxes: VatBoxSummary[];
  filing: VatReturnFiling;
};

export type Options = {
  /** The boxes of the return, supplied as data. */
  schema?: VatReturnSchema;
  transactions?: VatTransaction[];
  /** A period code: `2026`, `2026-03` or `2026-T2`. */
  period?: string;
  /** Id of the person at the keyboard. */
  actor?: string;
  /** Person's methods their role does not allow, with the reason. Filled by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  /** When true, whoever marked the return ready cannot also submit it. */
  requireSecondPerson?: boolean;
  filing?: VatReturnFiling;
  defaultFiling?: VatReturnFiling;
  onFilingChange?: (filing: VatReturnFiling, details: Details) => void;
  /** The box drilled into, or null for the list of boxes. */
  box?: string | null;
  defaultBox?: string | null;
  onBoxChange?: (box: string | null, details: Details) => void;
  /** Most rows an agent's snapshot carries. Defaults to 50. */
  snapshotRows?: number;
  onSubmit?: (submission: VatReturnSubmission, details: Details) => void;
};

export const DEFAULT_SNAPSHOT_ROWS = 50;
export const NO_BOXES: VatReturnSchema = { country: "", boxes: [] };

export const wholeAbove = (value: number | undefined, fallback: number) =>
  Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : fallback;

export function compute(options: Options): { computation: VatReturnComputation | null; issues: string[] } {
  try {
    const computation = computeVatReturn(options.schema ?? NO_BOXES, options.transactions ?? [], options.period ?? "");
    return { computation, issues: vatReturnIssues(computation) };
  } catch (error) {
    // A schema or period that cannot be used is the one issue, not a crash.
    return { computation: null, issues: [(error as Error).message] };
  }
}

/** The vouchers of the box drilled into, capped for the snapshot. */
export function drill(computation: VatReturnComputation | null, box: string | null, cap: number) {
  const opened = box === null ? undefined : computation?.boxes.find((item) => item.id === box);
  const vouchers: VatBoxVoucher[] = opened?.vouchers ?? [];
  return { vouchers: vouchers.slice(0, cap), total: vouchers.length, truncated: vouchers.length > cap };
}

export function derive(options: Options, filing: VatReturnFiling, box: string | null) {
  const cap = wholeAbove(options.snapshotRows, DEFAULT_SNAPSHOT_ROWS);
  const { computation, issues } = compute(options);
  const unmapped = computation?.unmapped ?? [];
  return {
    computation,
    period: computation?.period ?? String(options.period ?? ""),
    status: filing.status,
    boxes: (computation?.boxes ?? []).map(
      (item): VatBoxSummary => ({
        id: item.id,
        label: item.label,
        kind: item.kind,
        amountMinor: item.amountMinor,
        voucherCount: item.vouchers.length,
      }),
    ),
    payableMinor: computation?.payableMinor ?? 0,
    direction: computation?.direction ?? ("zero" as const),
    unmapped: unmapped.slice(0, cap),
    unmappedTotal: unmapped.length,
    // The same count under a name that says it is one, not an amount.
    unmappedCount: unmapped.length,
    issues,
    ready: issues.length === 0,
    ...drill(computation, box, cap),
  };
}

/**
 * A VAT return worked out from a schema the app supplies. The snapshot holds
 * the `period`, `status`, every box with its amount, the amount to pay or get
 * back, the `unmapped` transactions that block it, `issues`, `ready`, and the
 * vouchers of the box drilled into (capped, with `total` and `truncated`).
 * An agent may `openBox`, `back` and ask `assertReady`. Marking the return
 * ready and submitting it are a person's buttons, not agent actions.
 * Submitting changes the status and calls `onSubmit`; nothing is filed here.
 */
export const vatReturn = definePrimitive({
  name: "vat-return",
  options: {
    schema: "value",
    transactions: "value",
    period: "string",
    actor: "value",
    denied: "value",
    requireSecondPerson: "boolean",
    filing: "value",
    defaultFiling: "value",
    onFilingChange: "callback",
    box: "value",
    defaultBox: "value",
    onBoxChange: "callback",
    snapshotRows: "number",
    onSubmit: "callback",
  },
  // `computation` is left out: it holds every transaction. The lists here are capped.
  controlled: [
    "period",
    "status",
    "filing",
    "boxes",
    "payableMinor",
    "direction",
    "unmapped",
    "unmappedTotal",
    "unmappedCount",
    "issues",
    "ready",
    "box",
    "vouchers",
    "total",
    "truncated",
  ],
  state: (options: Options) => {
    const filing = options.filing ?? options.defaultFiling ?? DRAFT_VAT_FILING;
    const box = options.box ?? options.defaultBox ?? null;
    return { filing, box, refusal: "", ...derive(options, filing, box) };
  },
  sync: (options: Options) => ({
    ...(options.filing === undefined ? {} : { filing: options.filing, status: options.filing.status }),
    ...(options.box === undefined ? {} : { box: options.box }),
  }),
  api: (context) => {
    const change = createChange(context);
    const cap = () => wholeAbove(context.options().snapshotRows, DEFAULT_SNAPSHOT_ROWS);

    context.onOptions((options) => {
      const state = context.store.get();
      const filing = options.filing === undefined ? state.filing : options.filing;
      const box = options.box === undefined ? state.box : options.box;
      // A submitted return is fixed: its figures no longer follow the transactions.
      if (state.status === "submitted" && filing.status === "submitted") {
        if (box !== state.box) context.store.set(drill(state.computation, box, cap()));
        return;
      }
      context.store.set(derive(options, filing, box));
    });

    /** After a box was opened or left: the vouchers shown follow. */
    const refresh = () => {
      const { computation, box } = context.store.get();
      context.store.set({ refusal: "", ...drill(computation, box, cap()) });
    };
    const shown = <T>(run: () => T): T => {
      try {
        return run();
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
    /** The figures, or the reason there are none. */
    const figures = (): VatReturnComputation => {
      const { computation, issues } = context.store.get();
      if (!computation) throw new Error(issues[0] ?? "The VAT return could not be worked out.");
      return computation;
    };
    // Focus follows a person in and out of a box: to Back, then to the box's button.
    let focusNext: string | null = null;

    function openBox(boxId: unknown, event?: Event) {
      const id = String(boxId ?? "");
      const computation = figures();
      const box = computation.boxes.find((item) => item.id === id);
      if (!box) {
        throw new BookiError("vat.no-box", { id, boxes: computation.boxes.map((item) => item.id).join(", ") });
      }
      if (box.kind === "total") {
        const adds = context.options().schema?.boxes.find((item) => item.id === id)?.formula ?? [];
        throw new BookiError("vat.box-is-total", { id, boxes: adds.join(", ") });
      }
      const ok = change("box", id, { reason: "open-box", event });
      if (ok) refresh();
      return ok;
    }
    function back(event?: Event) {
      const ok = change("box", null, { reason: "back", event });
      if (ok) refresh();
      return ok;
    }
    function commit(next: VatReturnFiling, reason: string, event?: Event) {
      const ok = change("filing", next, { reason, event });
      // A controlled filing is the owner's to accept: sync sets the status once it comes back.
      if (ok)
        context.store.set({ refusal: "", ...(context.options().filing === undefined ? { status: next.status } : {}) });
      return ok;
    }

    return {
      /** Agent: list the vouchers behind one box. */
      openBox: (boxId: string) => openBox(boxId),
      openBoxByPerson: (boxId: string, event?: Event) =>
        shown(() => {
          const ok = openBox(boxId, event);
          if (ok) focusNext = "back";
          return ok;
        }),
      /** Agent: return to the boxes. */
      back: () => back(),
      backByPerson: (event?: Event) =>
        shown(() => {
          const left = context.store.get().box;
          const ok = back(event);
          if (ok && left !== null) focusNext = `box|${left}`;
          return ok;
        }),
      claimFocus: (el: HTMLElement, name: string) => {
        if (focusNext !== name) return;
        focusNext = null;
        el.focus();
      },
      /** Agent: throws while unmapped transactions, the schema or the period block the return. */
      assertReady: () => {
        const computation = figures();
        assertVatReturnReady(computation);
        return {
          ready: true,
          status: context.store.get().status,
          payableMinor: computation.payableMinor,
          direction: computation.direction,
        };
      },
      /** Person only: the figures have been looked over. */
      markReady: (event?: Event) =>
        gated("markReady", () =>
          commit(
            markVatReturnReady(
              context.store.get().filing,
              figures(),
              String(context.options().actor ?? ""),
              new Date().toISOString(),
            ),
            "mark-ready",
            event,
          ),
        ),
      /** Person only: fix the return and tell the app, which does the filing. */
      submit: (event?: Event) =>
        gated("submit", () => {
          const computation = figures();
          const options = context.options();
          const next = submitVatReturn(
            context.store.get().filing,
            computation,
            String(options.actor ?? ""),
            new Date().toISOString(),
            { requireSecondPerson: options.requireSecondPerson === true },
          );
          const ok = commit(next, "submit-return", event);
          if (ok) {
            dispatch(
              context,
              "onSubmit",
              {
                country: computation.country,
                period: computation.period,
                payableMinor: computation.payableMinor,
                direction: computation.direction,
                boxes: context.store.get().boxes,
                filing: next,
              },
              { reason: "submit-return", event },
            );
          }
          return ok;
        }),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({
        "data-status": state.status,
        "data-ready": state.ready ? "true" : "false",
        "data-direction": state.direction,
      }),
      state: (state) => ({
        computation: state.computation,
        period: state.period,
        status: state.status,
        filing: state.filing,
        issues: state.issues,
        ready: state.ready,
        box: state.box,
        refusal: state.refusal,
      }),
    }),
    // One per box. `value` is the box id and becomes the part's key.
    box: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }, event) => {
        try {
          api.openBoxByPerson(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
      bind: (el, part) => part.api.claimFocus(el, `box|${String(part.key)}`),
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
      bind: (el, part) => part.api.claimFocus(el, "back"),
    }),
    ready: slot({
      attrs: (state) => ({ type: "button", disabled: state.status !== "draft" || !state.ready ? "" : undefined }),
      press: ({ api }, event) => {
        try {
          api.markReady(event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    submit: slot({
      attrs: (state) => ({ type: "button", disabled: state.status !== "ready" || !state.ready ? "" : undefined }),
      press: ({ api }, event) => {
        try {
          api.submit(event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: { actions: ["openBox", "back", "assertReady"] },
});
