import { localToday } from "@booki-aui/core/financial-date";
import {
  assertReadyForSignOff,
  drawSample,
  materiality,
  populationTotalMinor,
  setConclusion,
  setItemEvidence,
  setItemNote,
  setItemResult,
  setItemTickMark,
  signOffWorkpaper,
  startWorkpaper,
  summarizeSample,
  withdrawSignOff,
  workpaperIssues,
  EMPTY_WORKPAPER,
  SAMPLE_METHODS,
  type Materiality,
  type MaterialityInput,
  type PopulationItem,
  type SampleMethod,
  type SampleOptions,
  type SampleSummary,
  type TestResult,
  type TickMark,
  type Workpaper,
} from "@booki-aui/core/audit";
import { parseToMinor } from "@booki-aui/core/money";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { BookiError } from "@booki-aui/core/msg";
import { refuseDenied } from "./access.js";
import { checkFields, minorInputText } from "./fields.js";

export type Options = {
  workpaper?: Workpaper;
  defaultWorkpaper?: Workpaper;
  /** Everything the sample is drawn from. */
  population?: PopulationItem[];
  /** The benchmark and percentages. The figures are computed, never typed. */
  materiality?: MaterialityInput;
  /** What the projection is compared with. Defaults to performance materiality. */
  tolerableMinor?: number;
  /** The closed list of tick marks an item can carry. */
  tickMarks?: TickMark[];
  /** Id of the person at the keyboard. */
  actor?: string;
  /** Person's methods their role does not allow, with the reason. Filled by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  /** Currency a person's typed misstatement is read in, e.g. "NOK". */
  currency?: string;
  /** Locale a person's typed misstatement is read in, e.g. "nb-NO". */
  locale?: string;
  onWorkpaperChange?: (workpaper: Workpaper, details: { reason: string; source?: string; cancel?: () => void }) => void;
};

/** What an agent may pass to `drawSample` after the method. */
export type DrawSampleOptions = Omit<SampleOptions, "method">;

export function figures(input: MaterialityInput | undefined): Materiality | null {
  if (!input) return null;
  try {
    return materiality(input);
  } catch {
    return null;
  }
}

export function derive(workpaper: Workpaper, options: Options) {
  const computed = figures(options.materiality);
  const tolerable = options.tolerableMinor ?? computed?.performanceMinor;
  const population = options.population ?? [];
  let summary: SampleSummary;
  try {
    summary = summarizeSample(workpaper, tolerable);
  } catch {
    summary = summarizeSample(workpaper);
  }
  const issues = workpaperIssues(workpaper);
  return {
    materiality: computed,
    tickMarks: options.tickMarks ?? [],
    population: { count: population.length, totalMinor: populationTotalMinor(population) },
    summary,
    issues,
    readyForSignOff: issues.length === 0,
  };
}

export const signed = (workpaper: Workpaper) => Boolean(workpaper.preparer || workpaper.reviewer);

/** How to draw the sample, shown in the snapshot. `tolerableMinor` is in minor units. */
export const SAMPLE_FORMAT =
  'drawSample("monetary-unit", { seed: "2026-01-31", size: 25 }); also tolerableMinor; setResult(itemId, "ok"|"exception", misstatementMinor)';

/**
 * An audit test on one sheet: materiality, a reproducible sample, the result
 * per item, a summary against tolerable misstatement, and two sign-offs. An
 * agent may draw the sample and record results, tick marks, evidence and
 * notes; its work is marked `by: "agent"` until a person changes the item. The
 * conclusion and both sign-offs are a person's: they are not agent actions.
 */
export const auditWorkpaper = definePrimitive({
  name: "audit-workpaper",
  options: {
    workpaper: "value",
    defaultWorkpaper: "value",
    population: "value",
    materiality: "value",
    tolerableMinor: "number",
    tickMarks: "value",
    actor: "string",
    denied: "value",
    currency: "string",
    locale: "string",
    onWorkpaperChange: "callback",
  },
  controlled: [
    "workpaper",
    "materiality",
    "tickMarks",
    "population",
    "summary",
    "issues",
    "readyForSignOff",
    "sampleFormat",
  ],
  state: (options: Options) => {
    const workpaper = options.workpaper ?? options.defaultWorkpaper ?? EMPTY_WORKPAPER;
    return {
      workpaper,
      locale: options.locale ?? "en-US",
      currency: options.currency ?? "USD",
      refusal: "",
      drafts: {} as Record<string, string>,
      // Read before the first try, so an agent draws the sample right the first time.
      sampleFormat: SAMPLE_FORMAT,
      ...derive(workpaper, options),
    };
  },
  sync: (options: Options) =>
    options.workpaper === undefined ? {} : { workpaper: options.workpaper, ...derive(options.workpaper, options) },
  api: (context) => {
    const change = createChange(context);
    // The population, materiality and legend come from the app and may change.
    context.onOptions(() => {
      const { locale } = context.options();
      if (locale && locale !== context.store.get().locale) context.store.set({ locale });
      const currency = context.options().currency ?? "USD";
      if (currency !== context.store.get().currency) context.store.set({ currency });
      const next = derive(context.store.get().workpaper, context.options());
      const now = context.store.get();
      if (
        JSON.stringify([now.materiality, now.tickMarks, now.population, now.summary]) !==
        JSON.stringify([next.materiality, next.tickMarks, next.population, next.summary])
      ) {
        context.store.set(next);
      }
    });
    const current = () => context.store.get().workpaper;
    const commit = (next: Workpaper, reason: string, event?: Event) => {
      const ok = change("workpaper", next, { reason, event });
      // A controlled workpaper is the owner's to accept: sync derives once it comes back.
      if (ok)
        context.store.set({
          refusal: "",
          ...(context.options().workpaper === undefined ? derive(next, context.options()) : {}),
        });
      return ok;
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
    /** Who a person's edit is recorded as. */
    const person = () => String(context.options().actor ?? "").trim() || "person";
    /** Sign-offs need to know exactly who. */
    const signer = () => {
      const actor = String(context.options().actor ?? "").trim();
      if (actor === "") throw new Error("Nobody is signed in. Pass `actor` with the person's id.");
      return actor;
    };
    const legend = () => context.options().tickMarks ?? [];

    return {
      /**
       * Agent: draw the sample. `options` is `{ seed, size?, tolerableMinor? }`.
       * `tolerableMinor` defaults to the workpaper's tolerable misstatement.
       */
      drawSample: (method: SampleMethod, options: DrawSampleOptions) => {
        const workpaper = current();
        const byPerson = workpaper.items.filter((item) => item.result !== "untested" && item.by !== "agent");
        if (byPerson.length > 0) {
          throw new Error(
            `A person has already tested ${byPerson.map((item) => item.id).join(", ")}. Drawing a new sample would discard that work, so an agent may not.`,
          );
        }
        if (!SAMPLE_METHODS.includes(method) || typeof options !== "object" || options === null) {
          throw new BookiError("audit.sample-shape", { methods: SAMPLE_METHODS.join(", ") });
        }
        checkFields("drawSample", options, ["seed", "size", "tolerableMinor"], SAMPLE_FORMAT);
        const fallback = context.store.get().summary.tolerableMinor;
        const tolerableMinor =
          options.tolerableMinor ??
          (method === "all-above" || options.size === undefined ? fallback || undefined : undefined);
        const sample = drawSample(context.options().population ?? [], {
          method,
          seed: options.seed,
          ...(options.size !== undefined ? { size: options.size } : {}),
          ...(tolerableMinor !== undefined ? { tolerableMinor } : {}),
        });
        return commit(startWorkpaper(sample, workpaper), "draw-sample");
      },
      /**
       * Person: draw the sample from what was picked and typed in the draw
       * form (method, size, seed). Refused once any item has a result.
       */
      drawByPerson: (event?: Event) =>
        gated("drawByPerson", () => {
          const workpaper = current();
          const tested = workpaper.items.filter((item) => item.result !== "untested");
          if (tested.length > 0) {
            throw new Error(
              `Results are recorded for ${tested.map((item) => item.id).join(", ")}. A new sample would discard them; clear them first.`,
            );
          }
          const { drafts, summary } = context.store.get();
          const method = (drafts["|method"] || "monetary-unit") as SampleMethod;
          if (!SAMPLE_METHODS.includes(method)) throw new Error(`"${method}" is not a sampling method.`);
          const sizeText = (drafts["|size"] ?? "").trim();
          const size = sizeText === "" ? undefined : Number(sizeText);
          if (size !== undefined && (!Number.isSafeInteger(size) || size <= 0)) {
            throw new Error(`The sample size is a whole number above zero, got "${sizeText}".`);
          }
          const seed = (drafts["|seed"] ?? "").trim() || localToday();
          const tolerableMinor =
            method === "all-above" || size === undefined ? summary.tolerableMinor || undefined : undefined;
          const sample = drawSample(context.options().population ?? [], {
            method,
            seed,
            ...(size !== undefined ? { size } : {}),
            ...(tolerableMinor !== undefined ? { tolerableMinor } : {}),
          });
          const ok = commit(startWorkpaper(sample, workpaper), "draw-sample", event);
          if (ok) {
            const { "|method": _m, "|size": _s, "|seed": _d, ...rest } = context.store.get().drafts;
            context.store.set({ drafts: rest });
          }
          return ok;
        }),
      /** Agent: record a result. Marked as the agent's work. */
      setResult: (itemId: string, result: TestResult, misstatementMinor?: number) =>
        commit(setItemResult(current(), String(itemId), result, misstatementMinor ?? undefined, "agent"), "set-result"),
      /** Agent: a symbol from the legend, or "" to clear. */
      setTickMark: (itemId: string, symbol: string) =>
        commit(setItemTickMark(current(), String(itemId), symbol, legend(), "agent"), "set-tick-mark"),
      /** Agent: the attachment that supports the result, or "" to clear. */
      setEvidence: (itemId: string, attachmentId: string) =>
        commit(setItemEvidence(current(), String(itemId), attachmentId, "agent"), "set-evidence"),
      /** Agent: a note on the item, or "" to clear. */
      setNote: (itemId: string, text: string) =>
        commit(setItemNote(current(), String(itemId), text, "agent"), "set-note"),
      /** Agent: throws while an item is untested or an exception has no note. */
      assertReadyForSignOff: () => {
        assertReadyForSignOff(current());
        return context.store.get().summary;
      },
      // Everything below is for a person using the composed workpaper. It is not
      // in `agent.actions`, so the bridge refuses a step that names it.
      setResultByPerson: (itemId: string, result: TestResult, event?: Event) =>
        shown(() => {
          const item = current().items.find((entry) => entry.id === itemId);
          const keep = result === "exception" ? item?.misstatementMinor : undefined;
          return commit(setItemResult(current(), itemId, result, keep, person()), "set-result", event);
        }),
      setTickMarkByPerson: (itemId: string, symbol: string, event?: Event) =>
        shown(() => commit(setItemTickMark(current(), itemId, symbol, legend(), person()), "set-tick-mark", event)),
      /** Hold what is being typed in a cell until blur or Enter. */
      setDraft: (cell: string, text: string) => {
        context.store.set({ drafts: { ...context.store.get().drafts, [cell]: text } });
      },
      /** Commit a typed cell: "itemId|misstatement", "itemId|evidence", "itemId|note" or "|conclusion". */
      commitDraft: (cell: string, event?: Event) => {
        const { drafts } = context.store.get();
        if (!(cell in drafts)) return false;
        const { [cell]: text = "", ...rest } = drafts;
        context.store.set({ drafts: rest });
        const split = cell.lastIndexOf("|");
        const itemId = cell.slice(0, split);
        const field = cell.slice(split + 1);
        return shown(() => {
          if (field === "conclusion") return commit(setConclusion(current(), text), "set-conclusion", event);
          if (field === "evidence")
            return commit(setItemEvidence(current(), itemId, text, person()), "set-evidence", event);
          if (field === "note") return commit(setItemNote(current(), itemId, text, person()), "set-note", event);
          const item = current().items.find((entry) => entry.id === itemId);
          if (text.trim() === "") {
            return commit(
              setItemResult(current(), itemId, item?.result ?? "untested", undefined, person()),
              "set-result",
              event,
            );
          }
          const { currency, locale } = context.options();
          const minor = parseToMinor(text, (currency ?? "USD") as Parameters<typeof parseToMinor>[1], { locale });
          if (minor === null) throw new Error(`"${text}" is not an amount.`);
          // A misstatement makes the item an exception.
          return commit(setItemResult(current(), itemId, "exception", minor, person()), "set-result", event);
        });
      },
      /** Person only. */
      signAsPreparer: (event?: Event) =>
        gated("signAsPreparer", () =>
          commit(signOffWorkpaper(current(), "preparer", signer(), new Date().toISOString()), "sign-preparer", event),
        ),
      /** Person only. Must be someone other than the preparer. */
      signAsReviewer: (event?: Event) =>
        gated("signAsReviewer", () =>
          commit(signOffWorkpaper(current(), "reviewer", signer(), new Date().toISOString()), "sign-reviewer", event),
        ),
      /** Person only. The preparer withdraws their own sign-off, the reviewer their own review. */
      withdraw: (event?: Event) =>
        shown(() => commit(withdrawSignOff(current(), signer()), "withdraw-sign-off", event)),
    };
  },
  slots: (slot) => {
    type CellState = { workpaper: Workpaper; drafts: Record<string, string>; locale: string; currency: string };
    const find = (state: CellState, id: string) => state.workpaper.items.find((item) => item.id === id);
    const fixed = (state: CellState) => (signed(state.workpaper) ? "" : undefined);
    return {
      root: slot({
        role: "group",
        attrs: (state) => ({
          "data-signed": state.workpaper.reviewer ? "reviewer" : state.workpaper.preparer ? "preparer" : undefined,
          "data-ready": state.readyForSignOff ? "" : undefined,
        }),
        state: (state) => ({
          workpaper: state.workpaper,
          materiality: state.materiality,
          tickMarks: state.tickMarks,
          population: state.population,
          summary: state.summary,
          issues: state.issues,
          readyForSignOff: state.readyForSignOff,
          refusal: state.refusal,
        }),
      }),
      // One result select per item. `value` is the item id and is the part's key.
      result: slot<{ value: string }>({
        props: { value: "string" },
        attrs: (state, part) => ({
          value: find(state, String(part.key))?.result ?? "untested",
          disabled: fixed(state),
        }),
        on: {
          // "input" is the adapter's name for React's onChange.
          input: (event, { api, key }) => {
            try {
              api.setResultByPerson(String(key), (event.target as HTMLSelectElement).value as TestResult, event);
            } catch {
              /* shown in the control */
            }
          },
        },
      }),
      tick: slot<{ value: string }>({
        props: { value: "string" },
        attrs: (state, part) => ({
          value: find(state, String(part.key))?.tickMark ?? "",
          disabled: fixed(state),
        }),
        on: {
          input: (event, { api, key }) => {
            try {
              api.setTickMarkByPerson(String(key), (event.target as HTMLSelectElement).value, event);
            } catch {
              /* shown in the control */
            }
          },
        },
      }),
      // One text cell per item and field. `value` is "itemId|field".
      cell: slot<{ value: string }>({
        props: { value: "string" },
        attrs: (state, part) => {
          const cell = String(part.key);
          const split = cell.lastIndexOf("|");
          const item = find(state, cell.slice(0, split));
          const field = cell.slice(split + 1);
          let value = "";
          if (cell in state.drafts) value = state.drafts[cell] ?? "";
          else if (field === "evidence") value = item?.evidenceId ?? "";
          else if (field === "note") value = item?.note ?? "";
          else if (item?.misstatementMinor !== undefined) {
            value = minorInputText(item.misstatementMinor, state.currency, state.locale, false);
          }
          return { type: "text", autoComplete: "off", value, disabled: fixed(state) };
        },
        on: {
          input: (event, { api, key }) => {
            api.setDraft(String(key), (event.target as HTMLInputElement).value);
          },
          blur: (event, { api, key }) => {
            try {
              api.commitDraft(String(key), event);
            } catch {
              /* shown in the control */
            }
          },
          keydown: (event, { api, key }) => {
            if ((event as KeyboardEvent).key !== "Enter") return;
            event.preventDefault();
            try {
              api.commitDraft(String(key), event);
            } catch {
              /* shown in the control */
            }
          },
        },
      }),
      // The conclusion: a person's words. No agent action reaches it.
      conclusion: slot({
        attrs: (state) => ({
          value:
            "|conclusion" in state.drafts ? (state.drafts["|conclusion"] ?? "") : (state.workpaper.conclusion ?? ""),
          disabled: fixed(state),
        }),
        on: {
          input: (event, { api }) => {
            api.setDraft("|conclusion", (event.target as HTMLTextAreaElement).value);
          },
          blur: (event, { api }) => {
            try {
              api.commitDraft("|conclusion", event);
            } catch {
              /* shown in the control */
            }
          },
        },
      }),
      // The draw form, shown while there is no sample. A person picks, types and presses Draw.
      method: slot({
        attrs: (state) => ({ value: state.drafts["|method"] || "monetary-unit", disabled: fixed(state) }),
        on: {
          input: (event, { api }) => {
            api.setDraft("|method", (event.target as HTMLSelectElement).value);
          },
        },
      }),
      // `value` is "size" or "seed".
      sampler: slot<{ value: string }>({
        props: { value: "string" },
        attrs: (state, part) => ({
          type: "text",
          autoComplete: "off",
          inputMode: String(part.key) === "size" ? "numeric" : undefined,
          value: state.drafts[`|${String(part.key)}`] ?? "",
          disabled: fixed(state),
        }),
        on: {
          input: (event, { api, key }) => {
            api.setDraft(`|${String(key)}`, (event.target as HTMLInputElement).value);
          },
          keydown: (event, { api }) => {
            if ((event as KeyboardEvent).key !== "Enter") return;
            event.preventDefault();
            try {
              api.drawByPerson(event);
            } catch {
              /* shown in the control */
            }
          },
        },
      }),
      draw: slot({
        attrs: () => ({ type: "button" }),
        press: ({ api }, event) => {
          try {
            api.drawByPerson(event);
          } catch {
            /* shown in the control */
          }
        },
      }),
      prepare: slot({
        attrs: () => ({ type: "button" }),
        press: ({ api }, event) => {
          try {
            api.signAsPreparer(event);
          } catch {
            /* shown in the control */
          }
        },
      }),
      review: slot({
        attrs: () => ({ type: "button" }),
        press: ({ api }, event) => {
          try {
            api.signAsReviewer(event);
          } catch {
            /* shown in the control */
          }
        },
      }),
      withdraw: slot({
        attrs: () => ({ type: "button", "data-variant": "secondary" }),
        press: ({ api }, event) => {
          try {
            api.withdraw(event);
          } catch {
            /* shown in the control */
          }
        },
      }),
    };
  },
  agent: {
    actions: ["drawSample", "setResult", "setTickMark", "setEvidence", "setNote", "assertReadyForSignOff"],
  },
});
