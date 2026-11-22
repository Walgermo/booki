import { STANDARD_ROLES, type Role } from "@booki/core/permissions";
import type { ServerActor } from "@booki/core/server";

/**
 * The company's roles: Booki's standard set, plus who may put a payment batch
 * together, plus the agent's own role. The agent prepares and approves small
 * invoices under the company's rule; it holds no permission a person's
 * decision needs, and the server refuses those for any agent anyway.
 */
export const ROLES: Role[] = [
  ...STANDARD_ROLES.map((role) =>
    role.id === "accountant" ? { ...role, permissions: [...role.permissions, "payment.prepare"] } : role,
  ),
  {
    id: "bookkeeping-agent",
    name: "Bookkeeping agent",
    permissions: ["payment.prepare", "supplier-invoice.approve-under-rule"],
  },
];

/**
 * Four people, because the duty rules need four: whoever approves an invoice
 * may not approve its payment, and whoever approves a payment may not release it.
 */
export const PEOPLE = [
  {
    id: "nina",
    name: "Nina",
    title: "Regnskapsfører",
    roles: ["accountant"],
    does: "Konterer, lager betalingsforslag, avstemmer banken",
  },
  { id: "kari", name: "Kari", title: "Avdelingsleder", roles: ["manager"], does: "Attesterer fakturaer" },
  { id: "ola", name: "Ola", title: "Økonomisjef", roles: ["controller"], does: "Godkjenner betalingen" },
  { id: "per", name: "Per", title: "Daglig leder", roles: ["controller"], does: "Frigir betalingen til banken" },
] as const;

export type PersonId = (typeof PEOPLE)[number]["id"];

export const AGENT_ID = "bookkeeper";

/**
 * Who a bearer token is. In your app this is your sign-in; the point here is
 * that the agent comes with a credential of its own, so the server can tell it
 * from the person it works for. Never take the actor from the request body.
 */
export function actorFor(token: string | null): ServerActor | undefined {
  if (!token) return undefined;
  const [kind, id] = token.split(":");
  const person = PEOPLE.find((p) => p.id === id);
  if (!person) return undefined;
  if (kind === "person") return { id: person.id, name: person.name, kind: "person", roles: [...person.roles] };
  if (kind === "agent") {
    return { id: AGENT_ID, name: "Agent", kind: "agent", roles: ["bookkeeping-agent"], onBehalfOf: person.id };
  }
  return undefined;
}

export const nameOf = (id: string): string => {
  if (id === AGENT_ID || id === `agent:${AGENT_ID}`) return "Agenten";
  if (id.startsWith("rule:")) return `Regelen «${id.slice(5)}»`;
  return PEOPLE.find((p) => p.id === id)?.name ?? id;
};
