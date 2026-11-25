import { formatMoney, money, parseToMinor } from "@booki-aui/core/money";
import { amountDraftMessage, amountMessages } from "@booki-aui/core/msg/amount";
import { createChange, definePrimitive, dispatch } from "@ui-sdk/core";
import { asEvent } from "./as-event.js";
import { inputLockAttrs, isLocked, lockOptions, lockState } from "./lock.js";

export type AmountFieldOptions = {
  /** `null` is empty, with `allowEmpty`. */
  value?: number | null;
  defaultValue?: number | null;
  currency?: string;
  locale?: string;
  /** Lowest accepted amount in minor units. Defaults to 0 (no negatives). */
  minMinor?: number;
  maxMinor?: number;
  secret?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Hears every change. With `allowEmpty`, emptying the field reports `null`. */
  onValueChange?: (value: number | null, details: { reason: string; source?: string; cancel?: () => void }) => void;
  /**
   * The field may be empty: no amount, which is not 0. `clear` empties it, a
   * person can delete the text, and `value={null}` shows it empty.
   */
  allowEmpty?: boolean;
  /** Called when the field becomes empty (with `allowEmpty`), after `onValueChange(null)`. */
  onEmpty?: (details: { reason: string; source?: string }) => void;
};

export type AmountFieldState = {
  /** Minor units, or null while the field is empty (with `allowEmpty`). */
  value: number | null;
  /** No amount entered (with `allowEmpty`): `value` and `minor` are null. */
  empty: boolean;
  allowEmpty: boolean;
  /**
   * Mirror of `value` (integer minor units) so the snapshot carries a
   * `minor` key: `stageChanges` with `{ key: "minor" }` calls `setMinor` and
   * reads `before` from it, which makes revert work.
   */
  minor: number | null;
  draft: string;
  draftRefusal: string | null;
  focused: boolean;
  /** Value when the current human edit began (focus); restored on a refused blur. */
  editStart: number | null;
  currency: string;
  locale: string;
  minMinor: number;
  maxMinor: number | undefined;
  secret: boolean;
  /** Read by ui-sdk's agent bridge: either one refuses every agent action. */
  disabled: boolean;
  readOnly: boolean;
};

export function formatMinor(minor: number, currency: string, locale: string): string {
  // formatMoney without currency drops the sign; keep it so the draft
  // shown on focus parses back to the same amount.
  const text = formatMoney(money(Math.abs(minor), currency), {
    locale,
    withCurrency: false,
  });
  return minor < 0 ? `-${text}` : text;
}

export function rangeError(minor: number, minMinor: number, maxMinor: number | undefined): string | null {
  if (minor < minMinor) {
    return amountMessages.msg("amount.below-min", { minor, min: minMinor });
  }
  if (maxMinor !== undefined && minor > maxMinor) {
    return amountMessages.msg("amount.above-max", { minor, max: maxMinor });
  }
  return null;
}

/**
 * Agent-ready amount primitive: snapshot exposes integer `value` and `minor`
 * (both minor units) and agent actions `setMinor` / `clear`, which take integer
 * minor units, the unit the snapshot reads. There is deliberately no agent
 * `setValue`: the bridge parses string args to `setValue` on numeric state
 * with parseFloat, so "3125.00" would arrive as 3125. Typed text goes through
 * `setDraftMajorText` (human input only).
 *
 * Changes are reported to observers (subscribe / attachAudit / history) on
 * key `minor`, because history and staging restore a key through
 * `set<Key>`: key `minor` restores through `setMinor`. `onValueChange` and
 * the `value` / `defaultValue` props work as before.
 */
export const amountField = definePrimitive({
  name: "amount-field",
  options: {
    value: "number",
    defaultValue: "number",
    currency: "string",
    locale: "string",
    minMinor: "number",
    maxMinor: "number",
    secret: "boolean",
    ...lockOptions,
    onValueChange: "callback",
    allowEmpty: "boolean",
    onEmpty: "callback",
  },
  // `currency` says what `minor` counts the smallest unit of.
  controlled: ["value", "minor", "currency", "empty"],
  state: (options: AmountFieldOptions): AmountFieldState => {
    const currency = options.currency ?? "NOK";
    const locale = options.locale ?? "en-US";
    const allowEmpty = options.allowEmpty ?? false;
    const given = options.value !== undefined ? options.value : options.defaultValue;
    const empty = allowEmpty && (given === null || given === undefined);
    const value = empty ? null : (given ?? 0);
    return {
      value,
      empty,
      allowEmpty,
      minor: value,
      draft: value === null ? "" : formatMinor(value, currency, locale),
      draftRefusal: null,
      focused: false,
      editStart: null,
      currency,
      locale,
      minMinor: options.minMinor ?? 0,
      maxMinor: options.maxMinor,
      secret: options.secret ?? false,
      ...lockState(options),
    };
  },
  sync: (options: AmountFieldOptions): Partial<AmountFieldState> => {
    const next: Partial<AmountFieldState> = { ...lockState(options) };
    if (options.allowEmpty !== undefined) next.allowEmpty = options.allowEmpty;
    if (options.value !== undefined) {
      const empty = (options.allowEmpty ?? false) && options.value === null;
      next.empty = empty;
      next.value = empty ? null : (options.value ?? 0);
      next.minor = next.value;
    }
    if (options.currency !== undefined) next.currency = options.currency;
    if (options.locale !== undefined) next.locale = options.locale;
    if (options.minMinor !== undefined) next.minMinor = options.minMinor;
    if (options.maxMinor !== undefined) next.maxMinor = options.maxMinor;
    if (options.secret !== undefined) next.secret = options.secret;
    return next;
  },
  api: (context) => {
    const change = createChange(context);

    function commitMinor(next: number, reason: string, event?: Event, keepDraft = false) {
      const { currency, locale, value, empty, draftRefusal } = context.store.get();
      if (next === value && !empty) {
        if (!keepDraft && draftRefusal)
          context.store.set({ draft: formatMinor(value, currency, locale), draftRefusal: null });
        return false;
      }
      // The app hears the change first and may cancel it.
      const canceled = dispatch(context, "onValueChange", next, {
        reason,
        event,
      });
      if (canceled) return false;
      // Report on `minor`; this writes `minor` into the store. An empty field
      // already holds 0, so 0 there changes only `empty`.
      const ok = change("minor", next, { reason, event });
      if (ok && empty) change("empty", false, { reason, event });
      if (ok) {
        if (context.options().value !== undefined) {
          // Controlled: the owner passes `value` back through sync; until it
          // does, keep `minor` on the held value.
          context.store.set({ minor: value });
        } else {
          context.store.set({ value: next });
        }
      }
      // While typing, leave the draft as typed; reformat on blur.
      if (ok && !keepDraft) {
        context.store.set({
          draft: formatMinor(next, currency, locale),
          draftRefusal: null,
        });
      }
      return ok;
    }

    /** Agent / programmatic write in minor units. Throws a repairable message. */
    function setMinorChecked(minor: unknown, reason: string, event?: Event) {
      const { currency, minMinor, maxMinor, allowEmpty } = context.store.get();
      // null is "no amount": only where the field may be empty.
      if (minor === null && allowEmpty) return commitEmpty(reason, event);
      const n = typeof minor === "string" && /^\s*-?\d+\s*$/.test(minor) ? Number(minor) : minor;
      if (typeof n !== "number" || !Number.isSafeInteger(n)) {
        throw amountMessages.error("amount.not-minor", {
          currency,
          value: typeof minor === "string" ? JSON.stringify(minor) : String(minor),
        });
      }
      const outOfRange = rangeError(n, minMinor, maxMinor);
      if (outOfRange)
        throw amountMessages.error(n < minMinor ? "amount.below-min" : "amount.above-max", {
          minor: n,
          min: minMinor,
          max: maxMinor ?? "",
        });
      return commitMinor(n, reason, event);
    }

    /** No amount: only with `allowEmpty`. */
    function commitEmpty(reason: string, event?: Event): boolean {
      const { allowEmpty, empty } = context.store.get();
      if (!allowEmpty) return false;
      if (empty) {
        context.store.set({ draft: "", draftRefusal: null });
        return true;
      }
      // The app hears the change first and may cancel it, as for an amount.
      if (dispatch(context, "onValueChange", null, { reason, event })) return false;
      const ok = change("empty", true, { reason, event });
      if (!ok) return false;
      context.options().onEmpty?.({ reason });
      if (context.options().value === undefined) context.store.set({ value: null, minor: null });
      context.store.set({ draft: "", draftRefusal: null });
      return true;
    }

    function commitDraft(draft: string, reason: string, event?: Event): boolean {
      const { allowEmpty, currency, locale, minMinor, maxMinor } = context.store.get();
      if (draft.trim() === "" && allowEmpty) {
        context.store.set({ draftRefusal: null });
        return commitEmpty(reason, event);
      }
      const language = /^(nb|no)(-|$)/i.test(locale) ? "nb" : "en";
      const minor = parseToMinor(draft, currency, { locale });
      if (minor === null) {
        context.store.set({
          draftRefusal: amountDraftMessage(language, "amount.invalid-draft", {
            example: formatMinor(100, currency, locale),
          }),
        });
        return false;
      }
      const outOfRange = rangeError(minor, minMinor, maxMinor);
      if (outOfRange) {
        const belowMinimum = minor < minMinor;
        const bound = belowMinimum ? Math.ceil(minMinor) : Math.floor(maxMinor ?? Infinity);
        context.store.set({
          draftRefusal: Number.isSafeInteger(bound)
            ? amountDraftMessage(language, belowMinimum ? "amount.draft-below-min" : "amount.draft-above-max", {
                limit: formatMinor(bound, currency, locale),
              })
            : outOfRange,
        });
        return false;
      }
      context.store.set({ draftRefusal: null });
      commitMinor(minor, reason, event, true);
      return true;
    }

    return {
      setMinor: (minor: number, event?: Event) => setMinorChecked(minor, "set-minor", event),
      /** Empties the field with `allowEmpty`; otherwise sets it to 0. */
      clear: (event?: Event) =>
        context.store.get().allowEmpty ? commitEmpty("clear", event) : setMinorChecked(0, "clear", event),
      /** Human input: major-unit text as typed. Not an agent action. */
      setDraftMajorText: (draft: string, event?: unknown) => {
        if (isLocked(context.store.get())) return;
        context.store.set({ draft });
        commitDraft(draft, "input", asEvent(event));
      },
      focus: () => {
        if (isLocked(context.store.get())) return;
        const { value, currency, locale, draft, draftRefusal } = context.store.get();
        context.store.set({
          focused: true,
          editStart: value,
          draft: draftRefusal ? draft : value === null ? "" : formatMinor(value, currency, locale),
        });
      },
      blur: (event?: unknown) => {
        if (isLocked(context.store.get())) return;
        const { draft, editStart } = context.store.get();
        context.store.set({ focused: false, editStart: null });
        if (!commitDraft(draft, "blur", asEvent(event))) {
          // Refused (unparseable or out of range): keystrokes may have
          // committed a prefix, so put back the amount from before the edit.
          const { draftRefusal } = context.store.get();
          if (editStart !== null) commitMinor(editStart, "blur", asEvent(event), true);
          else if (context.store.get().allowEmpty) commitEmpty("blur", asEvent(event));
          if (draftRefusal) {
            context.store.set({ draft, draftRefusal });
            return;
          }
        }
        const { value, currency, locale } = context.store.get();
        context.store.set({ draft: value === null ? "" : formatMinor(value, currency, locale) });
      },
    };
  },
  slots: (slot) => ({
    root: slot({
      attrs: (state) => ({
        "data-slot": "amount-field",
        "data-disabled": state.disabled ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
      }),
      state: (state) => ({ value: state.value, empty: state.empty, draftRefused: Boolean(state.draftRefusal) }),
    }),
    currency: slot({
      attrs: () => ({
        "data-slot": "amount-field-currency",
        "aria-hidden": "true",
      }),
      state: (state) => ({ currency: state.currency }),
    }),
    input: slot({
      attrs: (state) => {
        const display =
          state.focused || (state.draftRefusal && !state.secret && !isLocked(state))
            ? state.draft
            : state.value === null
              ? ""
              : state.secret && state.value !== 0
                ? "[redacted]"
                : formatMinor(state.value, state.currency, state.locale);
        const exceeds = state.value !== null && rangeError(state.value, state.minMinor, state.maxMinor) !== null;
        return {
          "data-slot": "amount-field-input",
          type: "text",
          inputMode: "decimal",
          autoComplete: "off",
          value: display,
          "aria-invalid": exceeds || (state.draftRefusal && !isLocked(state)) ? "true" : undefined,
          "data-agent-secret": state.secret ? "" : undefined,
          ...inputLockAttrs(state),
        };
      },
      bind: (el, { store }) => {
        const input = el as HTMLInputElement;
        const validate = () => {
          const state = store.get();
          input.setCustomValidity(isLocked(state) ? "" : (state.draftRefusal ?? ""));
        };
        validate();
        return store.subscribe(validate);
      },
      on: {
        focus: (_event, { api }) => api.focus(),
        blur: (event, { api }) => api.blur(event),
        input: (event, { api }) => {
          api.setDraftMajorText((event.target as HTMLInputElement).value, event);
        },
      },
    }),
  }),
  agent: { actions: ["setMinor", "clear"] },
});
