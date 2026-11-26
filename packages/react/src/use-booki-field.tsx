"use client";

import { BookiError } from "@booki-aui/core/msg";
import { type PrimitiveHandle, usePart, usePrimitive } from "@ui-sdk/react/primitive";
import type { ReactElement, ReactNode } from "react";
import { bookiFieldAccount, type BookiFieldAccountEntry } from "./use-booki-field-account.js";
import { bookiFieldAmount } from "./use-booki-field-amount.js";
import { bookiFieldCode, type BookiFieldCodeItem } from "./use-booki-field-code.js";
import { bookiFieldDate } from "./use-booki-field-date.js";
import { useSay } from "./say.js";

export { bookiFieldAccount, bookiFieldAmount, bookiFieldCode, bookiFieldDate };
export type { BookiFieldAccountEntry };

/**
 * Gives a field the product already has Booki's typed agent actions and rules,
 * without replacing it. The product's own input or select is what `render`
 * returns; the hook keeps the value, refuses what is not allowed, and tells the
 * agent what it may set.
 *
 *   const field = useBookiField({ kind: "code", value, options, label: "Kostnadssted", onValueChange }, ({ value, change, refusal }) => (
 *     <>
 *       <select value={value} onChange={(e) => change(e.target.value, e.nativeEvent)}>…</select>
 *       {refusal ? <p>{refusal}</p> : null}
 *     </>
 *   ))
 *
 * For an amount, keep what the person types as text and parse it with
 * `parseToMinor` from `@booki-aui/core/money`: the install guide has the example.
 *
 * A person's change calls `change(next, event)`, which is the same function the
 * agent's action calls: a refusal comes back as `false` and is shown as
 * `refusal`. `onValueChange` hears every change and its `details.source` is
 * `"agent"` for the agent's.
 */

type FieldDetails = { reason: string; source?: string };

/** Options every kind takes. */
type BookiFieldCommon = {
  /**
   * Set `false` when the field the product renders already has its own labelled group
   * (a `fieldset` with a `legend`, or `role="radiogroup"`): the root is then a plain
   * `div` without `role="group"`, so the group is not announced twice and
   * `getByRole("group", { name })` finds one. The root then has no `aria-label` either, so the
   * product's visible `<label>` is the only accessible name and `getByLabelText` finds its input
   * alone; the agent reads the field's name from a hidden `label` part inside the root.
   * Default `true`.
   */
  group?: boolean;
};

type BookiFieldAmountBase = BookiFieldCommon & {
  kind: "amount";
  currency?: string;
  minMinor?: number;
  maxMinor?: number;
  label: string;
  disabled?: boolean;
  readOnly?: boolean;
};

/** An amount field that always holds an amount. */
export type BookiFieldAmountFilledArgs = BookiFieldAmountBase & {
  /** Integer minor units, like 12500 for 125.00 NOK. */
  value: number;
  allowEmpty?: false;
  onValueChange?: (minor: number, details: FieldDetails) => void;
};

/** An amount field that may be empty: the snapshot reads `minor: null`, and `setMinor(null)` empties it. */
export type BookiFieldAmountEmptyArgs = BookiFieldAmountBase & {
  /** Integer minor units, or `null` for empty. */
  value: number | null;
  allowEmpty: true;
  onValueChange?: (minor: number | null, details: FieldDetails) => void;
};

export type BookiFieldAmountArgs = BookiFieldAmountFilledArgs | BookiFieldAmountEmptyArgs;

export type BookiFieldCodeArgs = BookiFieldCommon & {
  kind: "code";
  value: string;
  options: BookiFieldCodeItem[];
  /** The field may hold no code: `setCode("")` or `setCode(null)` clears it to `""`. */
  allowEmpty?: boolean;
  /** Values only a person may choose (a deal's won and lost stages): an agent's `setCode` to one is refused. */
  personOnly?: string[];
  onValueChange?: (code: string, details: FieldDetails) => void;
  label: string;
  disabled?: boolean;
  readOnly?: boolean;
};

export type BookiFieldDateArgs = BookiFieldCommon & {
  kind: "date";
  /** ISO `YYYY-MM-DD`, or `""` for none. */
  value: string;
  /** The field may hold no date: `setDate("")` or `setDate(null)` clears it to `""`. */
  allowEmpty?: boolean;
  onValueChange?: (date: string, details: FieldDetails) => void;
  label: string;
  disabled?: boolean;
  readOnly?: boolean;
};

export type BookiFieldAccountArgs = BookiFieldCommon & {
  kind: "account";
  /** The account number as digits, like `"1920"`. `""` is none, with `allowEmpty`. */
  value: string;
  /** A closed chart: an unknown number is refused and the refusal names the nearest accounts. */
  chart?: BookiFieldAccountEntry[];
  /** Fewest digits without a `chart`. Default 4. */
  minLength?: number;
  /** Most digits without a `chart`. Default 10. */
  maxLength?: number;
  /** The field may hold no account: `setAccount("")` or `setAccount(null)` clears it to `""`. */
  allowEmpty?: boolean;
  onValueChange?: (account: string, details: FieldDetails) => void;
  label: string;
  disabled?: boolean;
  readOnly?: boolean;
};

export type BookiFieldArgs = BookiFieldAmountArgs | BookiFieldCodeArgs | BookiFieldDateArgs | BookiFieldAccountArgs;

export type BookiFieldRender<T> = {
  /** The value the field holds. */
  value: T;
  /** A person's change: returns false, and sets `refusal`, when it is not allowed. A disabled or read-only field takes none. */
  change: (next: T, event?: Event) => boolean;
  /** The sentence for why the last change was refused, in the screen's language, or null. Show it next to the field. */
  refusal: string | null;
};

type RootState = { minor: number | null; code: string; date: string; account: string; refusal: string | null };

type Api = {
  setMinor: (minor: unknown, event?: Event) => boolean;
  setCode: (code: unknown, event?: Event) => boolean;
  setDate: (date: unknown, event?: Event) => boolean;
  setAccount: (account: unknown, event?: Event) => boolean;
  showRefusal: (message: string | null) => void;
};

/**
 * A field the product already has, with Booki's agent actions and rules. `render`
 * returns the product's own field; `change` and `refusal` are what it needs.
 */
export function useBookiField(
  options: BookiFieldAmountEmptyArgs,
  render: (field: BookiFieldRender<number | null>) => ReactNode,
): ReactElement;
export function useBookiField(
  options: BookiFieldAmountFilledArgs,
  render: (field: BookiFieldRender<number>) => ReactNode,
): ReactElement;
export function useBookiField(
  options: BookiFieldCodeArgs,
  render: (field: BookiFieldRender<string>) => ReactNode,
): ReactElement;
export function useBookiField(
  options: BookiFieldDateArgs,
  render: (field: BookiFieldRender<string>) => ReactNode,
): ReactElement;
export function useBookiField(
  options: BookiFieldAccountArgs,
  render: (field: BookiFieldRender<string>) => ReactNode,
): ReactElement;
export function useBookiField(options: BookiFieldArgs, render: (field: never) => ReactNode): ReactElement {
  // One usePrimitive call: the definition is chosen by kind, not the hooks.
  const definition =
    options.kind === "amount"
      ? bookiFieldAmount
      : options.kind === "code"
        ? bookiFieldCode
        : options.kind === "account"
          ? bookiFieldAccount
          : bookiFieldDate;
  const handle = usePrimitive(definition as never, primitiveOptions(options) as never) as unknown as PrimitiveHandle<
    typeof bookiFieldAmount
  > & { api: Api };
  const api = handle.api;
  // A refusal is kept in English, which is what an agent reads; the person reads it in the screen's language.
  const say = useSay();

  const change = (next: unknown, event?: Event): boolean => {
    // Locked: the person's edit is ignored, as the agent's is.
    if (options.disabled || options.readOnly) return false;
    const write =
      options.kind === "amount"
        ? api.setMinor
        : options.kind === "code"
          ? api.setCode
          : options.kind === "account"
            ? api.setAccount
            : api.setDate;
    try {
      write(next, event);
    } catch (error) {
      if (!(error instanceof BookiError)) throw error;
      api.showRefusal(error.message);
      return false;
    }
    api.showRefusal(null);
    return true;
  };

  // The root's state is the amount's, the code's, the account's or the date's, by kind: each
  // reads only its own key.
  // With the group role the label is the root's `aria-label`. Without it, the root has no role
  // and ARIA does not allow a name on it, so a `hidden` `label` part carries the name
  // (`hidden`, so it shows and is read nowhere, with or without a stylesheet):
  // ui-sdk reads the snapshot's label from that part first, and a visible `<label>` of the
  // product's is then the only accessible name the field's input has.
  const grouped = options.group !== false;
  const labelPart = usePart(handle, "label", {}, { children: options.label, hidden: true }, "span") as ReactElement;
  const part = {
    ...(grouped ? { "aria-label": options.label } : {}),
    children: (state: object) => {
      const shown = state as RootState;
      return (
        <>
          {grouped ? null : labelPart}
          {render({
            value:
              options.kind === "amount"
                ? shown.minor
                : options.kind === "code"
                  ? shown.code
                  : options.kind === "account"
                    ? shown.account
                    : shown.date,
            change,
            refusal: shown.refusal === null ? null : say(shown.refusal),
          } as never)}
        </>
      );
    },
  };
  return usePart(handle, "root", {}, part, "div") as ReactElement;
}

/** The options the definition takes: the arguments without `kind` and `label`. */
function primitiveOptions(options: BookiFieldArgs): Record<string, unknown> {
  const { kind: _kind, label: _label, ...rest } = options;
  return rest;
}
