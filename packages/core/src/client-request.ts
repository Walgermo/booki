import { BookiError, msg } from "./msg.js";

/**
 * Requests to the client for information or documents during an engagement
 * (the "provided by client" list). Drafting is preparation an agent may do,
 * and an agent may record an answer that came in. Sending and reminding put a
 * message in front of someone outside the firm, and judging whether an answer
 * is sufficient evidence (ISA 500) is the auditor's: those are a person's.
 *
 * - `draft`: being written, not sent.
 * - `sent`: with the client, waiting for an answer.
 * - `answered`: the client answered; a person judges whether it is enough.
 * - `accepted`: a person found the answer sufficient.
 * - `rejected`: a person found it insufficient; it waits for the client again.
 */
export type ClientRequestStatus = "draft" | "sent" | "answered" | "accepted" | "rejected";

export const CLIENT_REQUEST_STATUSES: readonly ClientRequestStatus[] = [
  "draft",
  "sent",
  "answered",
  "accepted",
  "rejected",
];

/** Who at the client the request goes to. The email is personal data. */
export type ClientRecipient = { name: string; email: string; role?: string };

export type ClientRequest = {
  id: string;
  title: string;
  /** The audit area, e.g. "Revenue" or "Payroll". */
  area?: string;
  status: ClientRequestStatus;
  recipient: ClientRecipient;
  /** ISO timestamp. */
  sentAt?: string;
  /** YYYY-MM-DD. */
  dueDate?: string;
  /** ISO timestamp. */
  answeredAt?: string;
  answer?: string;
  /** How many reminders were sent. */
  reminders: number;
  /** ISO timestamp of the last reminder. */
  remindedAt?: string;
  createdBy: string;
  sentBy?: string;
  decidedBy?: string;
  /** Why a person found the answer insufficient. */
  rejectReason?: string;
};

/** What may change on a draft with `editRequest`. */
export type ClientRequestPatch = Partial<Pick<ClientRequest, "title" | "area" | "dueDate">> & {
  recipient?: Partial<ClientRecipient>;
};

export const CLIENT_REQUEST_PATCH_FIELDS = ["title", "area", "dueDate", "recipient"] as const;

/** Waiting for the client: sent, or sent back after an answer was found insufficient. */
const WAITING: readonly ClientRequestStatus[] = ["sent", "rejected"];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function realDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const who = (by: unknown, what: string) => {
  const id = String(by ?? "").trim();
  if (id === "") throw new BookiError("request.actor-required", { what });
  return id;
};

function text(id: string, field: string, value: unknown, required: boolean): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string")
    throw new BookiError("request.field-text", { id, field, value: JSON.stringify(value) ?? String(value) });
  const trimmed = value.trim();
  if (required && trimmed === "") throw new BookiError("request.field-empty", { id, field });
  return trimmed === "" ? undefined : trimmed;
}

function dueDate(id: string, value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = String(value).trim();
  if (!realDate(date)) throw new BookiError("request.due-date-format", { id, value: String(value) });
  return date;
}

function recipient(id: string, value: Partial<ClientRecipient> | undefined): ClientRecipient {
  const name = text(id, "recipient.name", value?.name, true) as string;
  const email = String(value?.email ?? "").trim();
  // The address is personal data: the refusal does not repeat it.
  if (!EMAIL.test(email)) throw new BookiError("request.email-format", { id });
  const role = text(id, "recipient.role", value?.role, false);
  return role ? { name, email, role } : { name, email };
}

function tidy<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function inStatus(
  request: ClientRequest,
  allowed: readonly ClientRequestStatus[],
  code: "request.not-draft" | "request.not-waiting" | "request.not-judgeable",
): void {
  if (!allowed.includes(request.status)) throw new BookiError(code, { id: request.id, status: request.status });
}

export type NewClientRequest = {
  id: string;
  title: string;
  recipient: ClientRecipient;
  area?: string;
  dueDate?: string;
};

/** Draft a request. Nothing is sent. */
export function createRequest(input: NewClientRequest, by: string): ClientRequest {
  const id = String(input?.id ?? "").trim();
  if (id === "") throw new BookiError("request.id-required");
  return tidy({
    id,
    title: text(id, "title", input.title, true) as string,
    area: text(id, "area", input.area, false),
    status: "draft" as ClientRequestStatus,
    recipient: recipient(id, input.recipient),
    dueDate: dueDate(id, input.dueDate),
    reminders: 0,
    createdBy: who(by, msg("request.what.draft")),
  });
}

/** Change a draft. Refused once it is sent. */
export function editRequest(request: ClientRequest, patch: ClientRequestPatch): ClientRequest {
  inStatus(request, ["draft"], "request.not-draft");
  for (const key of Object.keys(patch ?? {})) {
    if (!(CLIENT_REQUEST_PATCH_FIELDS as readonly string[]).includes(key)) {
      throw new BookiError("request.unknown-field", {
        id: request.id,
        field: key,
        fields: CLIENT_REQUEST_PATCH_FIELDS.join(", "),
      });
    }
  }
  const id = request.id;
  return tidy({
    ...request,
    ...("title" in patch ? { title: text(id, "title", patch.title, true) } : {}),
    ...("area" in patch ? { area: text(id, "area", patch.area, false) } : {}),
    ...("dueDate" in patch ? { dueDate: dueDate(id, patch.dueDate) } : {}),
    ...(patch.recipient ? { recipient: recipient(id, { ...request.recipient, ...patch.recipient }) } : {}),
  });
}

/** A person sends the draft to the client. */
export function sendRequest(request: ClientRequest, by: string, at: string): ClientRequest {
  inStatus(request, ["draft"], "request.not-draft");
  return { ...request, status: "sent", sentAt: at, sentBy: who(by, msg("request.what.send")) };
}

/** Record the client's answer. Also after an answer was found insufficient. */
export function recordAnswer(request: ClientRequest, answer: string, at: string): ClientRequest {
  inStatus(request, WAITING, "request.not-waiting");
  const body = String(answer ?? "").trim();
  if (body === "") throw new BookiError("request.answer-required", { id: request.id });
  const { decidedBy: _d, rejectReason: _r, ...rest } = request;
  return { ...rest, status: "answered", answer: body, answeredAt: at };
}

/** A person finds the answer sufficient. */
export function acceptAnswer(request: ClientRequest, by: string): ClientRequest {
  inStatus(request, ["answered"], "request.not-judgeable");
  return { ...request, status: "accepted", decidedBy: who(by, msg("request.what.decide")) };
}

/** A person finds the answer insufficient, saying why; the request waits for the client again. */
export function rejectAnswer(request: ClientRequest, by: string, reason: string): ClientRequest {
  inStatus(request, ["answered"], "request.not-judgeable");
  const actor = who(by, msg("request.what.decide"));
  const why = String(reason ?? "").trim();
  if (why === "") throw new BookiError("request.reject-reason", { id: request.id });
  return { ...request, status: "rejected", decidedBy: actor, rejectReason: why };
}

/** A person reminds the client of a request that is still waiting. */
export function remind(request: ClientRequest, by: string, at: string): ClientRequest {
  inStatus(request, WAITING, "request.not-waiting");
  who(by, msg("request.what.remind"));
  return { ...request, reminders: request.reminders + 1, remindedAt: at };
}

/** Ids of requests still waiting for the client after their due date. `today` is YYYY-MM-DD. */
export function overdue(requests: ClientRequest[], today: string): string[] {
  return requests
    .filter((request) => WAITING.includes(request.status) && request.dueDate !== undefined && request.dueDate < today)
    .map((request) => request.id);
}

/** What a person should know about a request, as sentences. Warnings, not refusals. */
export function requestIssues(request: ClientRequest, today?: string): string[] {
  const issues: string[] = [];
  const id = request.id;
  if (!request.dueDate && (request.status === "draft" || WAITING.includes(request.status))) {
    issues.push(msg("request.issue.no-due-date", { id }));
  }
  if (today && overdue([request], today).length) {
    issues.push(msg("request.issue.overdue", { id, due: String(request.dueDate) }));
  }
  if (request.status === "answered") issues.push(msg("request.issue.awaiting-decision", { id }));
  return issues;
}

/** Throws unless the client has answered (and, if decided, the answer was accepted). */
export function assertAnswered(request: ClientRequest): void {
  if (request.status !== "answered" && request.status !== "accepted") {
    throw new BookiError("request.not-answered", { id: request.id, status: request.status });
  }
}

/** What an agent reads of a request: the recipient's name and role, never the email. */
export type RedactedClientRequest = Omit<ClientRequest, "recipient"> & { recipient: Omit<ClientRecipient, "email"> };

export function redactRequest(request: ClientRequest): RedactedClientRequest {
  const { email: _email, ...shown } = request.recipient;
  return { ...request, recipient: shown };
}
