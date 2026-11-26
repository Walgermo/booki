/**
 * Action names that approve, release or finalize: a person's, never offered to an agent.
 *
 * `approveUnderRule` is not one: it is a canonical agent action (spec/agent-contract.md),
 * run only under a company rule the ERP set and recorded as that rule's.
 */
export const PERSON_ACTION =
  /^(?!approveUnderRule$)(approve|reject|escalate|release|sign[_-]?off|finali[sz]e|submit|closePeriod|lockPeriod|dispose)/i;
