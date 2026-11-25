"use client";

import { actAndRecord, type AgentBridge } from "@booki-aui/react";
import { logDecision } from "./agent";
import { settled, takeRefusals } from "./writes";

/**
 * A scripted agent: the steps a bookkeeping agent takes on this page, through
 * the same bridge a model uses (snapshot, then act). No key needed, and the
 * same every time, so the flow can be shown and tested. It reads the page, does
 * what it may, and says what is waiting for a person.
 *
 * `ACCOUNT_BY_SUPPLIER` stands in for what a real agent knows from earlier
 * postings: which account a supplier is usually coded on.
 */
const ACCOUNT_BY_SUPPLIER: Record<string, string> = {
  "923609016": "6800", // Kontorrekvisita AS: kontorrekvisita
  "914778271": "6340", // Fjord Renhold AS: renhold under lys/varme
  "912345674": "6720", // Fjord IT AS: IT-tjenester
};

type Entry = { ref: string; component: string; label?: string; disabled?: boolean } & Record<string, unknown>;

type InboxInvoice = {
  id: string;
  status: string;
  coding?: { account?: string };
  fields: { supplierOrgNumber: { value: string }; invoiceNumber: { value: string } };
  duplicateOf: string[];
  needsReview: string[];
  proposedRejection?: unknown;
};

type ActResult = { ok: boolean; error?: { step: number; message: string } };
type Step = { ref: string; action: string; args?: unknown[] };

export type Report = { did: string[]; waiting: string[] };

const snapshot = (agent: AgentBridge) => agent.snapshot() as unknown as Entry[];

/** Runs steps one at a time, so one refusal does not stop the rest; reports each. */
async function each(agent: AgentBridge, steps: { step: Step; done: string }[], report: Report) {
  for (const { step, done } of steps) {
    takeRefusals();
    // actAndRecord: a step the control refuses gets an audit row, as one allow refused does.
    const result = (await actAndRecord(agent, { steps: [step] } as never, {
      audit: logDecision,
      agentId: "bookkeeper",
    })) as ActResult;
    // The control proposed; the server decides. Read its answer before the next step.
    await settled();
    const [refused] = takeRefusals();
    const what = done.split(":")[0];
    if (!result.ok) report.waiting.push(`${what}: ${result.error?.message ?? "avvist"}`);
    else if (refused) report.waiting.push(`${what}: serveren sa nei: ${refused}`);
    else report.did.push(done);
  }
}

export async function runScriptedAgent(agent: AgentBridge): Promise<Report> {
  const report: Report = { did: [], waiting: [] };

  // 1. Inbox: code what is uncoded, propose rejecting a second copy.
  const inbox = snapshot(agent).find((entry) => entry.component === "supplier-invoice-inbox");
  if (inbox) {
    const open = (inbox.inbox as InboxInvoice[]).filter(
      (invoice) => invoice.status === "new" || invoice.status === "coded",
    );
    const steps: { step: Step; done: string }[] = [];
    for (const invoice of open) {
      const original = invoice.duplicateOf.find((id) => id < invoice.id);
      if (original) {
        if (!invoice.proposedRejection) {
          steps.push({
            step: {
              ref: inbox.ref,
              action: "proposeRejection",
              args: [
                invoice.id,
                `Duplikat av ${original}: samme leverandør og fakturanummer ${invoice.fields.invoiceNumber.value}.`,
              ],
            },
            done: `${invoice.id}: foreslo å avvise som duplikat av ${original}`,
          });
        }
        continue;
      }
      const account = ACCOUNT_BY_SUPPLIER[invoice.fields.supplierOrgNumber.value];
      if (!invoice.coding?.account && account) {
        steps.push({
          step: { ref: inbox.ref, action: "proposeCoding", args: [invoice.id, account] },
          done: `${invoice.id}: konterte på ${account}`,
        });
      }
      if (invoice.needsReview.length > 0) {
        report.waiting.push(
          `${invoice.id}: ${invoice.needsReview.join(", ")} må sjekkes av en person (lest med lav sikkerhet)`,
        );
      }
    }
    await each(agent, steps, report);

    // 2. Approve what the company's rule covers; the rest is a person's.
    const after = snapshot(agent).find((entry) => entry.component === "supplier-invoice-inbox")!;
    const all = after.inbox as InboxInvoice[];
    for (const invoice of all) {
      const copy = invoice.duplicateOf.find(
        (id) => id > invoice.id && all.find((other) => other.id === id)?.status !== "rejected",
      );
      if (invoice.status === "coded" && copy)
        report.waiting.push(`${invoice.id}: venter til en person har avgjort kopien ${copy}`);
    }
    const coded = all.filter((invoice) => invoice.status === "coded" && invoice.duplicateOf.length === 0);
    await each(
      agent,
      coded.map((invoice) => ({
        step: { ref: after.ref, action: "approveUnderRule", args: [invoice.id] },
        done: `${invoice.id}: godkjent etter selskapets regel`,
      })),
      report,
    );
  }

  // 3. Payment batch from what is approved, if nobody has made one.
  const prepare = snapshot(agent).find(
    (entry) => entry.component === "button" && entry.label === "Lag betalingsforslag",
  );
  if (prepare && !prepare.disabled) {
    await each(agent, [{ step: { ref: prepare.ref, action: "press" }, done: "betalingsforslag: laget" }], report);
  }
  const batch = snapshot(agent).find((entry) => entry.component === "payment-batch");
  if (batch && batch.status !== "released") {
    report.waiting.push("betalingsforslag: godkjenning og frigivelse er to personers");
  }

  // 4. Bank: suggest each payment line against the open post with the same amount.
  const bank = snapshot(agent).find((entry) => entry.component === "bank-reconciliation");
  if (bank) {
    const lines = (bank.unmatchedBankLines ?? bank.bankLines ?? []) as { id: string; amountMinor: number }[];
    const posts = (bank.unmatchedPosts ?? bank.openPosts ?? []) as { id: string; amountMinor: number }[];
    const steps: { step: Step; done: string }[] = [];
    for (const line of lines) {
      const candidates = posts.filter((post) => post.amountMinor === line.amountMinor);
      if (candidates.length === 1) {
        steps.push({
          step: { ref: bank.ref, action: "suggestMatch", args: [line.id, candidates[0]!.id] },
          done: `${line.id}: foreslo avstemming mot ${candidates[0]!.id}`,
        });
      } else if (candidates.length > 1) {
        // Two posts with the same amount and nothing else to tell them apart: leave it.
        report.waiting.push(`${line.id}: flere poster med samme beløp; en person velger`);
      }
    }
    await each(agent, steps, report);
    if (steps.length > 0) report.waiting.push("bank: forslagene godkjennes av en person");
  }

  return report;
}
