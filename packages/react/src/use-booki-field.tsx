"use client";

import { BookiError } from "@booki/core/msg";
import { type PrimitiveHandle, usePart, usePrimitive } from "@ui-sdk/react/primitive";
import type { ReactElement, ReactNode } from "react";
import { bookiFieldAmount } from "./use-booki-field-amount.js";
import { bookiFieldCode, type BookiFieldCodeItem } from "./use-booki-field-code.js";
import { bookiFieldDate } from "./use-booki-field-date.js";

export { bookiFieldAmount, bookiFieldCode, bookiFieldDate };

/**
 * Gives a field the product already has Booki's typed agent actions and rules,
 * without replacing it. The product's own input or select is what `render`
 * returns; the hook keeps the value, refuses what is not allowed, and tells the
 * agent what it may set.
 *
 *   const amount = useBookiField({ kind: "amount", value, label: "Beløp", onValueChange }, ({ value, change, refusal }) => (
 *     <>
 *       <input value={value / 100} onChange={(e) => change(Math.round(Number(e.target.value) * 100), e.nativeEvent)} />
 *       {refusal ? <p>{refusal}</p> : null}
 *     </>
 *   ))
 *
 * A person's change calls `change(next, event)`, which is the same function the
 * agent's action calls: a refusal comes back as `false` and is shown as
 * `refusal`. `onValueChange` hears every change and its `details.source` is
 * `"agent"` for the agent's.
 */

type FieldDetails = { reason: string; source?: string };

export type BookiFieldAmountArgs = {
  kind: "amount";
  /** Integer minor units, like 12500 for 125.00 NOK. */
  value: number;
  onValueChange?: (minor: number, details: FieldDetails) => void;
  currency?: string;
  minMinor?: number;
  maxMinor?: number;
  label: string;
  disabled?: boolean;
  readOnly?: boolean;
};

export type BookiFieldCodeArgs = {
  kind: "code";
  value: string;
  options: BookiFieldCodeItem[];
  onValueChange?: (code: string, details: FieldDetails) => void;
  label: string;
  disabled?: boolean;
  readOnly?: boolean;
};

export type BookiFieldDateArgs = {
  kind: "date";
  /** ISO `YYYY-MM-DD`, or `""` for none. */
  value: string;
  onValueChange?: (date: string, details: FieldDetails) => void;
  label: string;
  disabled?: boolean;
  readOnly?: boolean;
};

export type BookiFieldArgs = BookiFieldAmountArgs | BookiFieldCodeArgs | BookiFieldDateArgs;

export type BookiFieldRender<T> = {
  /** The value the field holds. */
  value: T;
  /** A person's change: returns false, and sets `refusal`, when it is not allowed. */
  change: (next: T, event?: Event) => boolean;
  /** The sentence for why the last change was refused, or null. Show it next to the field. */
  refusal: string | null;
};

type RootState = { minor: number; code: string; date: string; refusal: string | null };

type Api = {
  setMinor: (minor: unknown, event?: Event) => boolean;
  setCode: (code: unknown, event?: Event) => boolean;
  setDate: (date: unknown, event?: Event) => boolean;
  showRefusal: (message: string | null) => void;
};

/**
 * A field the product already has, with Booki's agent actions and rules. `render`
 * returns the product's own field; `change` and `refusal` are what it needs.
 */
export function useBookiField(
  options: BookiFieldAmountArgs,
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
export function useBookiField(options: BookiFieldArgs, render: (field: never) => ReactNode): ReactElement {
  // One usePrimitive call: the definition is chosen by kind, not the hooks.
  const definition =
    options.kind === "amount" ? bookiFieldAmount : options.kind === "code" ? bookiFieldCode : bookiFieldDate;
  const handle = usePrimitive(definition as never, primitiveOptions(options) as never) as unknown as PrimitiveHandle<
    typeof bookiFieldAmount
  > & { api: Api };
  const api = handle.api;

  const change = (next: unknown, event?: Event): boolean => {
    const write = options.kind === "amount" ? api.setMinor : options.kind === "code" ? api.setCode : api.setDate;
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

  // The root's state is the amount's, the code's or the date's, by kind: each
  // reads only its own key.
  const part = {
    "aria-label": options.label,
    children: (state: object) => {
      const shown = state as RootState;
      return render({
        value: options.kind === "amount" ? shown.minor : options.kind === "code" ? shown.code : shown.date,
        change,
        refusal: shown.refusal,
      } as never);
    },
  };
  return usePart(handle, "root", {}, part, "div") as ReactElement;
}

/** The options the definition takes: the arguments without `kind` and `label`. */
function primitiveOptions(options: BookiFieldArgs): Record<string, unknown> {
  const { kind: _kind, label: _label, ...rest } = options;
  return rest;
}
