import { seedCrm, type Crm } from "./crm";

/**
 * One set of records for the whole server process, kept across hot reloads.
 * Your app reads and writes its database here instead.
 */
const holder = globalThis as typeof globalThis & { __crmExample?: Crm };

export function crm(): Crm {
  holder.__crmExample ??= seedCrm();
  return holder.__crmExample;
}
