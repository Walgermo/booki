/**
 * Every sentence `@booki-aui/core` writes for a person, in English and
 * Norwegian bokmål.
 *
 * Core renders the English template with `msg` and throws `BookiError`, so the
 * English text is what it always was. `localize` turns an `BookiError`, a plain
 * `Error` or a sentence string (an issue from `batchIssues`, `voucherIssues`…)
 * into the language the person reads. Text it does not recognise comes back
 * unchanged.
 *
 * Templates use `{name}` placeholders. A param that is a list of sentences is
 * passed as an array and joined with a space. A param whose name ends in
 * `AndList` is a list joined with " and " (" og " in Norwegian), and one whose
 * name ends in `CommaList` a list joined with ", ". Each item of either list
 * is translated on its own.
 */

import { EN } from "./messages-en.js";
import { NB } from "./messages-nb.js";
import {
  BookiError,
  isBookiError,
  msg,
  PLACEHOLDER,
  render,
  type MessageCode,
  type MessageLanguage,
  type MessageParam,
  type MessageParams,
} from "./msg.js";

export { BookiError, isBookiError, msg };
export type { MessageCode, MessageLanguage, MessageParam, MessageParams };

export type MessageTemplate = { readonly en: string; readonly nb: string };

/** Every code with its English and Norwegian sentence. */
export const MESSAGES: Readonly<Record<MessageCode, MessageTemplate>> = Object.fromEntries(
  (Object.keys(EN) as MessageCode[]).map((code) => [code, { en: EN[code], nb: NB[code] }]),
) as Record<MessageCode, MessageTemplate>;

/** The sentence for a code in a given language. */
export function msgIn(language: MessageLanguage, code: MessageCode, params: MessageParams = {}): string {
  const template = language === "nb" ? NB[code] : EN[code];
  // A quoted status is the value the agent sent, written as it must send it; any other is a
  // record's state, which reads in the person's language (the `word.*` codes).
  const quotedStatus = /["«]\{status\}["»]/.test(template);
  return render(template, params, language, (text, lang, name) =>
    name === "status" && quotedStatus ? text : localize(text, lang),
  );
}

type Compiled = { code: MessageCode; pattern: RegExp; names: string[]; literal: number; needle: string };

let compiled: Compiled[] | undefined;

/**
 * Placeholders that hold whole sentences. When reading English text back,
 * only these may run past the end of a sentence; any other placeholder stops
 * at one, so a list of issues is not read as one long issue.
 */
// The bridge's lists of labels and buttons are page text, which can hold a
// sentence of its own.
const SENTENCE_PARAMS = new Set([
  "issues",
  "reasons",
  "reason",
  "exceptions",
  "message",
  "labels",
  "buttons",
  "closed",
  // An app's `data-agent-confirm` text: a question, or two sentences.
  "confirm",
]);

const WITHIN_SENTENCE = `(?:(?![.!?:;]\\s+["'(A-ZÆØÅ])[\\s\\S])*?`;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compile(): Compiled[] {
  if (compiled) return compiled;
  const out: Compiled[] = [];
  for (const code of Object.keys(MESSAGES) as MessageCode[]) {
    const template = MESSAGES[code].en;
    const names: string[] = [];
    let source = "^";
    let last = 0;
    let literal = 0;
    let needle = "";
    for (const match of template.matchAll(PLACEHOLDER)) {
      const before = template.slice(last, match.index);
      source += escapeRegex(before);
      literal += before.length;
      if (before.length > needle.length) needle = before;
      const name = match[1] as string;
      if (names.includes(name)) {
        source += `\\k<p${names.indexOf(name)}>`;
      } else {
        source += `(?<p${names.length}>${SENTENCE_PARAMS.has(name) ? "[\\s\\S]*?" : WITHIN_SENTENCE})`;
        names.push(name);
      }
      last = (match.index ?? 0) + match[0].length;
    }
    const tail = template.slice(last);
    // `render` leaves out a closing stop after a param that ends in its own.
    source += tail === "." && last > 0 ? "\\.?$" : `${escapeRegex(tail)}$`;
    literal += tail.length;
    if (tail.length > needle.length) needle = tail;
    out.push({ code, pattern: new RegExp(source), names, literal, needle });
  }
  // The most specific template wins when two could read the same text.
  out.sort((a, b) => b.literal - a.literal);
  compiled = out;
  return out;
}

function matchWhole(text: string, language: MessageLanguage): string | undefined {
  for (const entry of compile()) {
    // The longest fixed part must be in the text; skip the regex otherwise.
    if (text.length < entry.literal || !text.includes(entry.needle)) continue;
    const found = entry.pattern.exec(text);
    if (!found) continue;
    const params: Record<string, string> = {};
    entry.names.forEach((name, index) => {
      params[name] = found.groups?.[`p${index}`] ?? "";
    });
    return msgIn(language, entry.code, params);
  }
  return undefined;
}

function localizeText(text: string, language: MessageLanguage): string {
  if (text === "") return text;
  const whole = matchWhole(text, language);
  if (whole !== undefined) return whole;
  // A run of sentences, such as issues joined with a space. Take the longest
  // run of sentences that one template reads, sentence by sentence.
  const units = text.split(/(?<=[.!?])\s+/);
  if (units.length < 2) return text;
  const out: string[] = [];
  let start = 0;
  while (start < units.length) {
    let done = false;
    for (let end = units.length; end > start; end--) {
      if (start === 0 && end === units.length) continue;
      const found = matchWhole(units.slice(start, end).join(" "), language);
      if (found !== undefined) {
        out.push(found);
        start = end;
        done = true;
        break;
      }
    }
    if (!done) {
      out.push(units[start] as string);
      start += 1;
    }
  }
  return out.join(" ");
}

/**
 * Write a Booki sentence in the person's language. Takes an `BookiError`, any
 * `Error`, or a sentence string such as an issue from `batchIssues`. For `en`
 * it returns the text as it is. Text it does not recognise comes back
 * unchanged; it never throws.
 */
export function localize(text: unknown, language: MessageLanguage): string {
  try {
    if (isBookiError(text)) {
      return language === "en" ? text.message : msgIn(language, text.code, text.params);
    }
    const value = text instanceof Error ? text.message : typeof text === "string" ? text : String(text ?? "");
    if (language === "en") return value;
    return localizeText(value, language);
  } catch {
    return text instanceof Error ? text.message : String(text ?? "");
  }
}
