import { localToday } from "@booki/core/financial-date";
import {
  acceptAnswer,
  assertAnswered,
  createRequest,
  editRequest,
  overdue,
  recordAnswer,
  redactRequest,
  rejectAnswer,
  remind,
  requestIssues,
  sendRequest,
  type ClientRequest,
  type ClientRequestPatch,
  type RedactedClientRequest,
} from "@booki/core/client-request";
import { BookiError } from "@booki/core/msg";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { refuseDenied } from "./access.js";
import { checkFields, commitSecret, recordOf } from "./fields.js";
import { personOnly } from "./person-only.js";

export { buttonKey } from "./fields.js";

/** How to draft and edit a request, shown in the snapshot. */
export const REQUEST_FORMAT =
  'draftRequest({ title, recipientName, recipientEmail, area, dueDate: "2026-03-31" }); editRequest(id, { dueDate })';

/** What `draftRequest` takes. */
export const DRAFT_FIELDS = ["title", "recipientName", "recipientEmail", "recipientRole", "area", "dueDate"] as const;

/** What `editRequest` may change on a draft. */
export const EDIT_FIELDS = ["title", "area", "dueDate", "recipientName", "recipientEmail", "recipientRole"] as const;

const DRAFT_EXAMPLE =
  '{ "title": "Bank confirmations", "recipientName": "Ingrid Fjell", "recipientEmail": "ingrid@example.test", "dueDate": "2026-03-31" }';
const EDIT_EXAMPLE = '{ "dueDate": "2026-04-07" }';

export type Options = {
  requests?: ClientRequest[];
  defaultRequests?: ClientRequest[];
  /** Today as YYYY-MM-DD, for what is overdue. Defaults to the date now. */
  today?: string;
  /** Id of the person at the keyboard. */
  actor?: string;
  /** A person's methods their role does not allow, each with the reason. Set by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  /** What an agent's work is recorded as. Defaults to "agent". */
  agentActor?: string;
  onRequestsChange?: (
    requests: ClientRequest[],
    details: { reason: string; source?: string; cancel?: () => void },
  ) => void;
};

export const todayOf = (options: Options) => options.today ?? localToday();

export function derive(requests: ClientRequest[], today: string) {
  return {
    tracker: requests.map(redactRequest) as RedactedClientRequest[],
    overdue: overdue(requests, today),
    issues: Object.fromEntries(requests.map((request) => [request.id, requestIssues(request, today)])) as Record<
      string,
      string[]
    >,
  };
}

/** The first free id of the form R-1, R-2, … */
export function nextRequestId(requests: ClientRequest[]): string {
  const taken = new Set(requests.map((request) => request.id));
  let n = requests.length + 1;
  while (taken.has(`R-${n}`)) n += 1;
  return `R-${n}`;
}

type Flat = Partial<Record<(typeof EDIT_FIELDS)[number], string>>;

function toPatch(fields: Flat): ClientRequestPatch {
  const patch: ClientRequestPatch = {};
  if ("title" in fields) patch.title = fields.title;
  if ("area" in fields) patch.area = fields.area;
  if ("dueDate" in fields) patch.dueDate = fields.dueDate;
  const recipient: Record<string, string | undefined> = {};
  if ("recipientName" in fields) recipient.name = fields.recipientName;
  if ("recipientEmail" in fields) recipient.email = fields.recipientEmail;
  if ("recipientRole" in fields) recipient.role = fields.recipientRole;
  if (Object.keys(recipient).length) patch.recipient = recipient;
  return patch;
}

/**
 * Requests to the client on an engagement. An agent reads each request with
 * the recipient's name and role, never the email; it may draft a request,
 * edit a draft, record an answer that came in and ask `assertAnswered`.
 * Sending, reminding, and accepting or rejecting an answer are a person's
 * buttons, not agent actions: sending reaches someone outside the firm, and
 * whether an answer is enough is the auditor's judgment. The owner hears the
 * full requests on `onRequestsChange`; `agent.subscribe` hears them without
 * the email.
 */
export const clientRequests = definePrimitive({
  name: "client-requests",
  options: {
    requests: "value",
    defaultRequests: "value",
    today: "string",
    actor: "string",
    denied: "value",
    agentActor: "string",
    onRequestsChange: "callback",
  },
  // `requests` itself is left out: it carries the recipients' email.
  controlled: ["tracker", "overdue", "issues", "requestFormat"],
  state: (options: Options) => {
    const requests = options.requests ?? options.defaultRequests ?? [];
    const today = todayOf(options);
    return {
      requests,
      today,
      refusal: "",
      requestFormat: REQUEST_FORMAT,
      drafts: {} as Record<string, string>,
      ...derive(requests, today),
    };
  },
  sync: (options: Options) =>
    options.requests === undefined ? {} : { requests: options.requests, ...derive(options.requests, todayOf(options)) },
  api: (context) => {
    const change = createChange(context);
    context.onOptions((options) => {
      const today = todayOf(options);
      if (today !== context.store.get().today)
        context.store.set({ today, ...derive(context.store.get().requests, today) });
    });
    const now = () => new Date().toISOString();
    const agent = () => context.options().agentActor ?? "agent";
    const commit = (next: ClientRequest[], reason: string, event?: Event) => {
      // The bridge hears the requests without email; the owner hears all of it.
      const ok = commitSecret(context as never, change as never, "requests", next, next.map(redactRequest), {
        reason,
        event,
      });
      if (ok && context.options().requests === undefined) {
        context.store.set({ refusal: "", ...derive(next, context.store.get().today) });
      } else if (ok) context.store.set({ refusal: "" });
      return ok;
    };
    const find = (id: string) => {
      const requests = context.store.get().requests;
      const request = requests.find((item) => item.id === String(id));
      if (!request) {
        throw new BookiError("request.no-request", {
          id: String(id),
          ids: requests.map((item) => item.id).join(", ") || "none",
        });
      }
      return request;
    };
    const put = (next: ClientRequest, reason: string, event?: Event) =>
      commit(
        context.store.get().requests.map((item) => (item.id === next.id ? next : item)),
        reason,
        event,
      );
    const shown = <T>(run: () => T): T => {
      try {
        return run();
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };
    const gated = <T>(method: string, run: () => T): T =>
      shown(() => {
        refuseDenied(context.options(), method);
        return run();
      });
    const person = (permission: string) => {
      const actor = String(context.options().actor ?? "").trim();
      if (actor === "") throw new BookiError("permissions.signed-out", { permission });
      return actor;
    };
    return {
      /** Agent: draft a request. Nothing is sent. Returns its id. */
      draftRequest: (input: {
        title: string;
        recipientName: string;
        recipientEmail: string;
        recipientRole?: string;
        area?: string;
        dueDate?: string;
      }) => {
        const fields = checkFields("draftRequest", input, DRAFT_FIELDS, DRAFT_EXAMPLE) as Flat;
        const requests = context.store.get().requests;
        const request = createRequest(
          {
            id: nextRequestId(requests),
            title: fields.title as string,
            area: fields.area,
            dueDate: fields.dueDate,
            recipient: {
              name: fields.recipientName as string,
              email: fields.recipientEmail as string,
              role: fields.recipientRole,
            },
          },
          agent(),
        );
        return commit([...requests, request], "draft-request") ? { id: request.id } : false;
      },
      /** Agent: change a draft's title, area, due date or recipient. */
      editRequest: (id: string, patch: Flat) => {
        const request = find(id);
        const fields = checkFields("editRequest", patch, EDIT_FIELDS, EDIT_EXAMPLE) as Flat;
        if (Object.keys(fields).length === 0) return false;
        return put(editRequest(request, toPatch(fields)), "edit-request");
      },
      /** Agent: record the client's answer as it came in. Judging it stays with a person. */
      recordAnswer: (id: string, text: string) => put(recordAnswer(find(id), text, now()), "record-answer"),
      /** Agent: throws unless the client has answered. */
      assertAnswered: (id: string) => {
        assertAnswered(find(id));
        return { answered: true };
      },
      // Everything below is for a person. It is not in `agent.actions`, so the
      // bridge refuses a step that names it.
      /** Person only: the request leaves the firm. */
      send: (id: string, event?: Event) =>
        gated("send", () => put(sendRequest(find(id), person("request.send"), now()), "send-request", event)),
      /** Person only. */
      remind: (id: string, event?: Event) =>
        gated("remind", () => put(remind(find(id), person("request.send"), now()), "remind-request", event)),
      /** Person only: the answer is sufficient. */
      accept: (id: string, event?: Event) =>
        gated("accept", () => put(acceptAnswer(find(id), person("request.decide")), "accept-answer", event)),
      /** Hold the rejection reason being typed. Not reported to the bridge. */
      setReason: (id: string, text: string) => {
        context.store.set({ drafts: { ...context.store.get().drafts, [String(id)]: String(text ?? "") } });
      },
      /** Person only: the answer is not enough; the reason is what was typed for this request. */
      reject: (id: string, event?: Event) =>
        gated("reject", () => {
          const { [String(id)]: reason = "", ...rest } = context.store.get().drafts;
          const ok = put(rejectAnswer(find(id), person("request.decide"), reason), "reject-answer", event);
          if (ok) context.store.set({ drafts: rest });
          return ok;
        }),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-overdue": state.overdue.length ? "" : undefined }),
      state: (state) => ({
        requests: state.requests,
        overdue: state.overdue,
        issues: state.issues,
        drafts: state.drafts,
        refusal: state.refusal,
      }),
    }),
    // `value` is the request id, or for a person's button its `buttonKey`, e.g. "R-1#send".
    send: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button", "data-agent-confirm": personOnly("Sending to the client needs a person") }),
      press: ({ api, key }, event) => {
        try {
          api.send(recordOf(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    remind: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({
        type: "button",
        "data-variant": "secondary",
        "data-agent-confirm": personOnly("Reminding the client needs a person"),
      }),
      press: ({ api, key }, event) => {
        try {
          api.remind(recordOf(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    accept: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button", "data-agent-confirm": personOnly("Accepting an answer needs a person") }),
      press: ({ api, key }, event) => {
        try {
          api.accept(recordOf(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    reason: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({ value: state.drafts[String(part.key)] ?? "" }),
      on: {
        input: (event, { api, key }) => {
          api.setReason(String(key), (event.target as HTMLTextAreaElement).value);
        },
      },
    }),
    reject: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({
        type: "button",
        "data-variant": "secondary",
        "data-agent-confirm": personOnly("Rejecting an answer needs a person"),
      }),
      press: ({ api, key }, event) => {
        try {
          api.reject(recordOf(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: { actions: ["draftRequest", "editRequest", "recordAnswer", "assertAnswered"] },
});
