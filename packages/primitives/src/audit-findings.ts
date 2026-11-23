import {
  assertConfirmable,
  confirmFinding,
  createFinding,
  editFinding,
  findingIssues,
  linkSource,
  redactFinding,
  reopenFinding,
  setBasis,
  withdrawFinding,
  type Finding,
  type FindingBasis,
  type FindingPatch,
  type RedactedFinding,
} from "@booki/core/findings";
import { BookiError } from "@booki/core/msg";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { refuseDenied } from "./access.js";
import { checkFields, commitSecret, recordOf } from "./fields.js";
import { personOnly } from "./person-only.js";

export { buttonKey } from "./fields.js";

/** How to draft and edit a finding, shown in the snapshot. Amounts are minor units. */
export const FINDING_FORMAT =
  'draftFinding({ title, category: "misstatement", basis: "documented", amountMinor: 860000 }); editFinding(id, { description })';

/** What `draftFinding` takes. */
export const DRAFT_FIELDS = ["title", "category", "basis", "description", "amountMinor", "currency"] as const;

/** What `editFinding` may change. Confidentiality is a person's to set. */
export const EDIT_FIELDS = ["title", "code", "description", "category", "amountMinor", "currency"] as const;

const DRAFT_EXAMPLE =
  '{ "title": "Revenue cut-off", "category": "misstatement", "basis": "documented", "amountMinor": 860000 }';
const EDIT_EXAMPLE = '{ "description": "Two December invoices delivered in January." }';

/** A piece of evidence the host knows about, that a finding can cite. */
export type FindingEvidence = { id: string; label?: string };

export type Options = {
  findings?: Finding[];
  defaultFindings?: Finding[];
  /** Evidence a finding can cite. When given, `linkSource` refuses any other id. */
  evidence?: FindingEvidence[];
  /** Currency of an amount drafted without one, e.g. "NOK". */
  currency?: string;
  /** Id of the person at the keyboard. */
  actor?: string;
  /** A person's methods their role does not allow, each with the reason. Set by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  /** What an agent's work is recorded as. Defaults to "agent". */
  agentActor?: string;
  onFindingsChange?: (findings: Finding[], details: { reason: string; source?: string; cancel?: () => void }) => void;
};

export function derive(findings: Finding[]) {
  return {
    register: findings.map(redactFinding) as RedactedFinding[],
    // What a person should weigh, per finding that is not withdrawn.
    issues: Object.fromEntries(
      findings
        .filter((finding) => finding.status !== "withdrawn")
        .map((finding) => [finding.id, findingIssues(finding)]),
    ) as Record<string, string[]>,
  };
}

const evidenceIds = (options: Options) => (options.evidence ?? []).map((item) => String(item.id));

/** The first free id of the form F-1, F-2, … */
export function nextFindingId(findings: Finding[]): string {
  const taken = new Set(findings.map((finding) => finding.id));
  let n = findings.length + 1;
  while (taken.has(`F-${n}`)) n += 1;
  return `F-${n}`;
}

/**
 * The register of audit findings on an engagement. An agent reads every
 * finding (a confidential one only as "[confidential]", with its counts), may
 * draft a finding, edit a draft, cite evidence, set the basis and ask
 * `assertConfirmable`. Confirming, withdrawing (with a reason of at least 20
 * characters) and reopening are a person's buttons, not agent actions. The
 * full findings reach the owner on `onFindingsChange`; `agent.subscribe`
 * hears them redacted.
 */
export const auditFindings = definePrimitive({
  name: "audit-findings",
  options: {
    findings: "value",
    defaultFindings: "value",
    evidence: "value",
    currency: "string",
    actor: "string",
    denied: "value",
    agentActor: "string",
    onFindingsChange: "callback",
  },
  // `findings` itself is left out: it carries what confidential findings say.
  controlled: ["register", "issues", "evidence", "findingFormat"],
  state: (options: Options) => {
    const findings = options.findings ?? options.defaultFindings ?? [];
    return {
      findings,
      evidence: evidenceIds(options),
      refusal: "",
      findingFormat: FINDING_FORMAT,
      drafts: {} as Record<string, string>,
      ...derive(findings),
    };
  },
  sync: (options: Options) =>
    options.findings === undefined ? {} : { findings: options.findings, ...derive(options.findings) },
  api: (context) => {
    const change = createChange(context);
    context.onOptions((options) => {
      const next = evidenceIds(options);
      if (next.join("\n") !== context.store.get().evidence.join("\n")) context.store.set({ evidence: next });
    });
    const now = () => new Date().toISOString();
    const agent = () => context.options().agentActor ?? "agent";
    const commit = (next: Finding[], reason: string, event?: Event) => {
      // The bridge hears the findings redacted; the owner hears all of it.
      const ok = commitSecret(context as never, change as never, "findings", next, next.map(redactFinding), {
        reason,
        event,
      });
      if (ok && context.options().findings === undefined) context.store.set({ refusal: "", ...derive(next) });
      else if (ok) context.store.set({ refusal: "" });
      return ok;
    };
    const find = (id: string) => {
      const findings = context.store.get().findings;
      const finding = findings.find((item) => item.id === String(id));
      if (!finding) {
        throw new BookiError("finding.no-finding", {
          id: String(id),
          ids: findings.map((item) => item.id).join(", ") || "none",
        });
      }
      return finding;
    };
    const put = (next: Finding, reason: string, event?: Event) =>
      commit(
        context.store.get().findings.map((item) => (item.id === next.id ? next : item)),
        reason,
        event,
      );
    /** An agent cannot read a confidential finding, so it cannot change one either. */
    const open = (id: string) => {
      const finding = find(id);
      if (finding.confidential) throw new BookiError("finding.confidential-agent", { id: finding.id });
      return finding;
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
    const person = (permission: string) => {
      const actor = String(context.options().actor ?? "").trim();
      if (actor === "") throw new BookiError("permissions.signed-out", { permission });
      return actor;
    };
    return {
      /** Agent: raise a draft finding. Returns its id. */
      draftFinding: (input: {
        title: string;
        category: string;
        basis: string;
        description?: string;
        amountMinor?: number;
        currency?: string;
      }) => {
        const fields = checkFields("draftFinding", input, DRAFT_FIELDS, DRAFT_EXAMPLE);
        const findings = context.store.get().findings;
        const currency = fields.currency ?? (fields.amountMinor === undefined ? undefined : context.options().currency);
        const finding = createFinding(
          { ...(fields as Record<string, unknown>), id: nextFindingId(findings), currency } as never,
          agent(),
          now(),
        );
        return commit([...findings, finding], "draft-finding") ? { id: finding.id } : false;
      },
      /** Agent: change a draft's title, code, description, category or amount. */
      editFinding: (id: string, patch: FindingPatch) => {
        const finding = open(id);
        const fields = checkFields("editFinding", patch, EDIT_FIELDS, EDIT_EXAMPLE);
        const next = editFinding(finding, fields as FindingPatch, agent(), now());
        return next === finding ? false : put(next, "edit-finding");
      },
      /** Agent: cite a piece of evidence by id. */
      linkSource: (id: string, sourceId: string) => {
        const finding = open(id);
        const known = context.store.get().evidence;
        if (known.length > 0 && !known.includes(String(sourceId))) {
          throw new BookiError("finding.unknown-source", { source: String(sourceId), ids: known.join(", ") });
        }
        return put(linkSource(finding, String(sourceId), agent(), now()), "link-source");
      },
      /** Agent: say what the finding rests on: documented, reported or hypothesis. */
      setBasis: (id: string, basis: FindingBasis) => {
        const finding = open(id);
        const next = setBasis(finding, basis, agent(), now());
        return next === finding ? false : put(next, "set-basis");
      },
      /** Agent: throws with what a person should weigh before confirming, as one sentence. */
      assertConfirmable: (id: string) => {
        assertConfirmable(find(id));
        return { confirmable: true };
      },
      // Everything below is for a person. It is not in `agent.actions`, so the
      // bridge refuses a step that names it.
      /** Person only. Warnings do not stop it. */
      confirm: (id: string, event?: Event) =>
        gated("confirm", () =>
          put(confirmFinding(find(id), person("finding.confirm"), now()), "confirm-finding", event),
        ),
      /** Hold the withdrawal reason being typed. Not reported to the bridge. */
      setReason: (id: string, text: string) => {
        context.store.set({ drafts: { ...context.store.get().drafts, [String(id)]: String(text ?? "") } });
      },
      /** Person only. The reason is what was typed for this finding. */
      withdraw: (id: string, event?: Event) =>
        gated("withdraw", () => {
          const { [String(id)]: reason = "", ...rest } = context.store.get().drafts;
          const ok = put(
            withdrawFinding(find(id), person("finding.withdraw"), now(), reason),
            "withdraw-finding",
            event,
          );
          if (ok) context.store.set({ drafts: rest });
          return ok;
        }),
      /** Person only. Back to draft; the log keeps who confirmed or withdrew it. */
      reopen: (id: string, event?: Event) =>
        gated("reopen", () => put(reopenFinding(find(id), person("finding.confirm"), now()), "reopen-finding", event)),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      state: (state) => ({
        findings: state.findings,
        issues: state.issues,
        drafts: state.drafts,
        refusal: state.refusal,
      }),
    }),
    // `value` is the finding id, or for a person's button its `buttonKey`, e.g. "F-1#confirm".
    confirm: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button", "data-agent-confirm": personOnly("Confirming a finding needs a person") }),
      press: ({ api, key }, event) => {
        try {
          api.confirm(recordOf(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    reason: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({ value: state.drafts[String(part.key)] ?? "" }),
      on: {
        // "input" is the adapter's name for React's onChange.
        input: (event, { api, key }) => {
          api.setReason(String(key), (event.target as HTMLTextAreaElement).value);
        },
      },
    }),
    withdraw: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({
        type: "button",
        "data-variant": "secondary",
        "data-agent-confirm": personOnly("Withdrawing a finding needs a person"),
      }),
      press: ({ api, key }, event) => {
        try {
          api.withdraw(recordOf(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    reopen: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({
        type: "button",
        "data-variant": "secondary",
        "data-agent-confirm": personOnly("Reopening a finding needs a person"),
      }),
      press: ({ api, key }, event) => {
        try {
          api.reopen(recordOf(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: { actions: ["draftFinding", "editFinding", "linkSource", "setBasis", "assertConfirmable"] },
});
