import { STANDARD_ROLES, type Actor, type Role } from "@booki/core/permissions";
import type { ServerActor } from "@booki/core/server";

/**
 * The company's roles. Booki's `sales` role closes deals and removes
 * activities; `deal.edit` and `activity.log` are this app's own permissions,
 * which the sales role and the agent both hold. Closing a deal is a person's
 * decision in Booki: the server refuses it for any agent, whatever its roles.
 */
export const ROLES: Role[] = [
  ...STANDARD_ROLES.map((role) =>
    role.id === "sales" ? { ...role, permissions: [...role.permissions, "deal.edit", "activity.log"] } : role,
  ),
  { id: "sales-agent", name: "Sales agent", permissions: ["deal.edit", "activity.log"] },
];

export const PEOPLE = [
  { id: "kari", name: "Kari Nordmann", title: "Rådgiver", roles: ["sales"] },
  { id: "ola", name: "Ola Hansen", title: "Salgssjef", roles: ["sales"] },
] as const;

export type PersonId = (typeof PEOPLE)[number]["id"];

export const OWNERS = PEOPLE.map((person) => ({ id: person.id, name: person.name }));

export const AGENT_ID = "crm-assistant";

/**
 * Who a bearer token is. In your app this is your sign-in. The agent comes with
 * a credential of its own, so the server can tell it from the person it works
 * for. Never take the actor from the request body.
 */
export function actorFor(token: string | null): ServerActor | undefined {
  if (!token) return undefined;
  const [kind, id] = token.split(":");
  const person = PEOPLE.find((p) => p.id === id);
  if (!person) return undefined;
  if (kind === "person") return { id: person.id, name: person.name, kind: "person", roles: [...person.roles] };
  if (kind === "agent")
    return { id: AGENT_ID, name: "Agent", kind: "agent", roles: ["sales-agent"], onBehalfOf: person.id };
  return undefined;
}

/** A person and their roles as they are now, for an agent that works for them. */
export function personOf(id: string): Actor | undefined {
  const person = PEOPLE.find((p) => p.id === id);
  return person && { id: person.id, name: person.name, roles: [...person.roles] };
}

export const nameOf = (id: string): string => {
  if (id === AGENT_ID || id === `agent:${AGENT_ID}`) return "Agenten";
  return PEOPLE.find((p) => p.id === id)?.name ?? id;
};
