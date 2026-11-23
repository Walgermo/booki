import { BookiError, msg } from "./msg.js";

/** The things Booki asks "may this person do it?" about. Add your own strings freely. */
export const PERMISSIONS = [
  "voucher.post",
  "invoice.finalize",
  "supplier-invoice.approve",
  "supplier-invoice.approve-under-rule",
  "expense.approve",
  "evidence.remove",
  "approval.decide",
  "payment.approve",
  "payment.release",
  "reconciliation.approve",
  "period.close",
  "period.adjust-closed",
  "close.sign-off",
  "vat.prepare",
  "vat.submit",
  "asset.run-depreciation",
  "asset.dispose",
  "audit.prepare",
  "audit.sign-off",
  /** Review work someone else prepared (gjennomgått). */
  "audit.review",
  /** Conclude an area or the engagement (the partner's, godkjent). */
  "audit.conclude",
  /** The engagement quality control review (EQCR). */
  "audit.eqcr",
  /** Freeze the file or an extract: nothing changes after. */
  "audit.freeze",
  /** Raise or edit a draft audit finding. */
  "finding.raise",
  /** Stand behind a finding (a person's judgment). */
  "finding.confirm",
  /** Take a finding back, with a reason (a person's judgment). */
  "finding.withdraw",
  /** Draft a request to the client. */
  "request.draft",
  /** Send a request or a reminder to the client: a message outside the firm. */
  "request.send",
  /** Judge whether the client's answer is sufficient. */
  "request.decide",
] as const;

export type Permission = (typeof PERMISSIONS)[number] | (string & {});

export type Role = { id: string; name: string; permissions: Permission[] };

/** A company in a group. Each has its own books, base currency and country. */
export type Entity = { id: string; name: string; baseCurrency: string; country: string };

export type Actor = {
  id: string;
  name?: string;
  roles: string[];
  /** Entities this person may work in. Omit for all. */
  entities?: string[];
  /**
   * Roles held in one engagement, case or project, by its id: a person can be
   * the partner on one engagement and the EQCR on another. A check that names
   * the scope adds these to `roles`.
   */
  scopes?: Record<string, string[]>;
};

/**
 * A duty rule's refusal: the rule's own sentence, for the person to read. The
 * server guard answers it as 403 `permissions.duty`; any other error a rule
 * throws is not a refusal and is not shown to the caller.
 */
export class DutyRefusal extends Error {
  override name = "DutyRefusal";
}

/** Two things one person should not both do on the same item. */
export type DutyRule = { first: Permission; second: Permission; reason: string };

/** What has already been done to an item, and by whom. An agent's deed names whose session it ran in. */
export type Deed = { actorId: string; permission: Permission; onBehalfOf?: string };

/**
 * Whether a deed was this actor's: by its id or its agent label, by its own
 * agent (a deed on its behalf), or, for an agent, by the person it acts for.
 * Duties hold for agents and people alike.
 */
function wasTheirs(deed: Deed, actor: Actor): boolean {
  const own = actor as Actor & { kind?: string; onBehalfOf?: string };
  return (
    deed.actorId === actor.id ||
    deed.actorId === `agent:${actor.id}` ||
    deed.onBehalfOf === actor.id ||
    (own.onBehalfOf !== undefined && (deed.actorId === own.onBehalfOf || deed.onBehalfOf === own.onBehalfOf))
  );
}

/** Preparing and approving, approving and releasing: the usual separations. */
export const STANDARD_DUTY_RULES: DutyRule[] = [
  { first: "payment.approve", second: "payment.release", reason: msg("permissions.duty.approve-release") },
  { first: "voucher.post", second: "close.sign-off", reason: msg("permissions.duty.post-sign-off") },
  { first: "supplier-invoice.approve", second: "payment.approve", reason: msg("permissions.duty.invoice-payment") },
  { first: "audit.prepare", second: "audit.review", reason: msg("permissions.duty.prepare-review") },
  { first: "audit.prepare", second: "audit.eqcr", reason: msg("permissions.duty.eqcr") },
  { first: "audit.review", second: "audit.eqcr", reason: msg("permissions.duty.eqcr") },
  { first: "audit.conclude", second: "audit.eqcr", reason: msg("permissions.duty.eqcr") },
];

/** A starting set of roles. Replace it with your own. */
export const STANDARD_ROLES: Role[] = [
  {
    id: "accountant",
    name: "Accountant",
    permissions: [
      "voucher.post",
      "invoice.finalize",
      "reconciliation.approve",
      "asset.run-depreciation",
      "evidence.remove",
      "vat.prepare",
    ],
  },
  {
    id: "manager",
    name: "Manager",
    permissions: [
      "approval.decide",
      "supplier-invoice.approve",
      "expense.approve",
      "payment.approve",
      "close.sign-off",
    ],
  },
  {
    id: "controller",
    name: "Controller",
    permissions: [
      "period.close",
      "period.adjust-closed",
      "close.sign-off",
      "vat.submit",
      "payment.release",
      "payment.approve",
      "approval.decide",
      "asset.dispose",
    ],
  },
  {
    id: "auditor",
    name: "Auditor",
    permissions: [
      "audit.prepare",
      "audit.sign-off",
      "audit.review",
      "finding.raise",
      "request.draft",
      "request.send",
      "request.decide",
    ],
  },
  {
    id: "partner",
    name: "Partner",
    permissions: [
      "audit.review",
      "audit.sign-off",
      "audit.conclude",
      "audit.freeze",
      "finding.raise",
      "finding.confirm",
      "finding.withdraw",
      "request.draft",
      "request.send",
      "request.decide",
    ],
  },
  { id: "eqcr", name: "Quality reviewer", permissions: ["audit.eqcr"] },
];

/** The roles an actor holds here: their own, and those of the scope named, if any. */
export function rolesIn(actor: Actor, scope?: string): string[] {
  // Own keys only: a scope named "constructor" must not reach Object's prototype.
  const scoped =
    scope && actor.scopes && Object.hasOwn(actor.scopes, scope) && Array.isArray(actor.scopes[scope])
      ? actor.scopes[scope]!
      : [];
  return scoped.length ? [...new Set([...actor.roles, ...scoped])] : actor.roles;
}

/** True when one of the actor's roles grants the permission, in that entity if one is given. */
export function can(
  actor: Actor | undefined,
  roles: Role[],
  permission: Permission,
  options: { entity?: string; scope?: string } = {},
): boolean {
  if (!actor) return false;
  // An empty entity is still an entity: only `undefined` means "no company named".
  if (options.entity !== undefined && actor.entities && !actor.entities.includes(options.entity)) return false;
  const held = rolesIn(actor, options.scope);
  return roles.some((role) => held.includes(role.id) && role.permissions.includes(permission));
}

/**
 * Throws, with a sentence that says who may, unless the actor has the
 * permission and no duty rule is broken by what they already did to the item.
 */
export function assertCan(
  actor: Actor | undefined,
  roles: Role[],
  permission: Permission,
  options: { entity?: string; scope?: string; deeds?: Deed[]; dutyRules?: DutyRule[] } = {},
): void {
  if (!actor) throw new BookiError("permissions.signed-out", { permission: String(permission) });
  if (options.entity !== undefined && actor.entities && !actor.entities.includes(options.entity)) {
    throw new BookiError("permissions.wrong-entity", { id: String(actor.id), entity: String(options.entity) });
  }
  if (!can(actor, roles, permission, { scope: options.scope })) {
    const able = roles.filter((role) => role.permissions.includes(permission)).map((role) => role.name);
    throw new BookiError("permissions.denied", {
      id: String(actor.id),
      permission: String(permission),
      roles: able.join(", ") || msg("permissions.none-defined"),
    });
  }
  for (const rule of options.dutyRules ?? []) {
    const other = rule.first === permission ? rule.second : rule.second === permission ? rule.first : undefined;
    if (other && options.deeds?.some((deed) => wasTheirs(deed, actor) && deed.permission === other)) {
      throw new DutyRefusal(rule.reason);
    }
  }
}
