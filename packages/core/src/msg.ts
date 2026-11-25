/**
 * The English half of the message catalogue: what core needs to write its
 * sentences and throw `BookiError`. It carries no other language, so a module
 * that only reports in English ships only English. `@booki-aui/core/messages`
 * adds Norwegian and `localize`.
 */
import { EN } from "./messages-en.js";

import { BookiMessageError, render, type MessageParams } from "./message-render.js";

export { PLACEHOLDER, render } from "./message-render.js";
export type { MessageLanguage, MessageParam, MessageParams, Translate } from "./message-render.js";

export type MessageCode = keyof typeof EN;

/** The English sentence for a code. Core uses it for every sentence it writes. */
export function msg(code: MessageCode, params: MessageParams = {}): string {
  return render(EN[code], params, "en");
}

/**
 * An error whose message is a Booki sentence. `code` and `params` let
 * `localize` write the same sentence in another language.
 */
export class BookiError extends BookiMessageError {
  constructor(code: MessageCode, params: MessageParams = {}) {
    super(msg(code, params), code, params);
  }

  static override [Symbol.hasInstance](value: unknown): boolean {
    return this === BookiError ? value instanceof BookiMessageError : super[Symbol.hasInstance](value);
  }
}

/** True for an `BookiError`, also one from another copy of this module. */
export function isBookiError(value: unknown): value is BookiError {
  if (value instanceof BookiError) return true;
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { code?: unknown; params?: unknown };
  return (
    typeof candidate.code === "string" &&
    Object.hasOwn(EN, candidate.code) &&
    typeof candidate.params === "object" &&
    candidate.params !== null
  );
}
