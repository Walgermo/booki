import type { MessageCode } from "./msg.js";

export type MessageLanguage = "en" | "nb";

/**
 * A param value. An array is a list of sentences, joined with a space, or for
 * an `…AndList` or `…CommaList` param a list joined with " and " or ", ".
 */
export type MessageParam = string | number | boolean | readonly string[];

export type MessageParams = Readonly<Record<string, MessageParam | undefined>>;

export const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

const JOINERS: { suffix: string; join: Record<MessageLanguage, string> }[] = [
  { suffix: "AndList", join: { en: " and ", nb: " og " } },
  { suffix: "CommaList", join: { en: ", ", nb: ", " } },
];

/** Translates a param that is itself a sentence, or a word such as a status. English needs none. */
export type Translate = (text: string, language: MessageLanguage, name?: string) => string;

/** What a sentence says where a record's status is missing. */
const NO_STATUS: Record<MessageLanguage, string> = { en: "without a status", nb: "uten status" };

function paramText(
  name: string,
  value: MessageParam | undefined,
  language: MessageLanguage,
  translate: Translate,
): string | undefined {
  if (value === undefined || value === null) return name === "status" ? NO_STATUS[language] : undefined;
  const t = (item: string) => (language === "en" ? item : translate(item, language, name));
  const joiner = JOINERS.find((item) => name.endsWith(item.suffix));
  if (joiner) {
    const items = Array.isArray(value) ? (value as readonly string[]) : String(value).split(joiner.join.en);
    return items.map(t).join(joiner.join[language]);
  }
  if (Array.isArray(value)) return (value as readonly string[]).map(t).join(" ");
  if (typeof value === "string") return t(value);
  return String(value);
}

/** Fill a template's `{name}` placeholders. */
export function render(
  template: string,
  params: MessageParams,
  language: MessageLanguage,
  translate: Translate = (text) => text,
): string {
  const out = template.replace(
    PLACEHOLDER,
    (whole, name: string) => paramText(name, params[name], language, translate) ?? whole,
  );
  // A sentence that ends in a param which is a question or a sentence of its own takes no
  // second stop: "…: Approve the invoice?", not "…?.".
  return template.endsWith("}.") && /[.?!…]\.$/.test(out) ? out.slice(0, -1) : out;
}

/**
 * These errors carry the same code and params as the public BookiError. A
 * caller with a local template can create one without loading the full catalogue.
 */
export class BookiMessageError extends Error {
  readonly code: MessageCode;
  readonly params: MessageParams;

  constructor(message: string, code: MessageCode, params: MessageParams) {
    super(message);
    this.name = "BookiError";
    this.code = code;
    this.params = params;
  }
}

export function createMessages<Code extends MessageCode>(templates: Readonly<Record<Code, string>>) {
  function msg(code: Code, params: MessageParams = {}): string {
    return render(templates[code], params, "en");
  }
  return {
    msg,
    error(code: Code, params: MessageParams = {}) {
      return new BookiMessageError(msg(code, params), code, params);
    },
  };
}
