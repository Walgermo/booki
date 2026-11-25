/**
 * The demo company's write API, guarded by `@booki-aui/core/server`: the same rules
 * the screens enforce, checked again where it counts. Served at /api/books by
 * the Vite dev server and by api/books.ts in production.
 *
 * Who is calling comes from the bearer token, never from the request body.
 * These tokens are fixed demo sessions; a real app uses its own sign-in, and
 * gives an agent a credential of its own so the server knows it is an agent.
 */
import { approveBatch, type PaymentBatch } from "@booki-aui/core/payment-batch";
import {
  guardDecideApproval,
  guardPostVoucher,
  guardReleasePayments,
  toHttp,
  type GuardContext,
  type ServerActor,
} from "@booki-aui/core/server";
import type { ApprovalLevel, ApprovalRequest } from "@booki-aui/core/approval";
import { createVoucherLine, type VoucherLine } from "@booki-aui/core/voucher";

/** Demo sessions: token → the actor the sign-in established. */
const SESSIONS: Record<string, ServerActor> = {
  "demo-nina": { id: "nina", name: "Nina, regnskapsfører", kind: "person", roles: ["accountant"] },
  "demo-kari": { id: "kari", name: "Kari, leder", kind: "person", roles: ["manager"] },
  "demo-ola": { id: "ola", name: "Ola, økonomisjef", kind: "person", roles: ["controller"] },
  // The agent has every role a bookkeeper team has, and still may not decide for a person.
  "demo-agent": {
    id: "bookkeeper",
    name: "Agent",
    kind: "agent",
    roles: ["accountant", "manager", "controller"],
    onBehalfOf: "nina",
  },
};

const PERIODS = [
  { code: "2026-09", status: "soft-closed" as const },
  { code: "2025", status: "hard-closed" as const },
];
const ACCOUNTS = [
  { number: "2400", name: "Leverandørgjeld" },
  { number: "2710", name: "Inngående mva" },
  { number: "6800", name: "Kontorrekvisita" },
];

const CHAIN: ApprovalLevel[] = [{ id: "leader", name: "Leder", approvers: [{ id: "kari" }, { id: "bookkeeper" }] }];
const REQUEST: ApprovalRequest = { id: "si-1", amountMinor: 1_550_000, requesterId: "nina", decisions: [] };

const BATCH: PaymentBatch = approveBatch(
  approveBatch(
    {
      id: "pb-1",
      status: "draft",
      debitAccount: "1503.12.34567",
      valueDate: "2026-11-02",
      currency: "NOK",
      preparedBy: "nina",
      items: [
        { id: "p1", creditorName: "Kontorrekvisita AS", amountMinor: 1_550_000, creditorAccount: "1234.56.78903" },
      ],
      approvals: [],
    },
    "kari",
    "2026-11-01T09:00:00Z",
  ),
  "ola",
  "2026-11-01T09:05:00Z",
);

type Body =
  | { action: "post-voucher"; date: string; lines: { account: string; debitMinor?: number; creditMinor?: number }[] }
  | { action: "decide-approval"; decision: "approved" | "rejected" }
  | { action: "release-payments" };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });

export async function handleBooksRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") return json(405, { ok: false, message: "POST a JSON body with an action." });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const actor = SESSIONS[token];
  const context: GuardContext = {
    actor,
    locale: request.headers.get("accept-language")?.startsWith("nb") ? "nb" : "en",
  };

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json(400, { ok: false, message: "The body is not JSON." });
  }

  switch (body.action) {
    case "post-voucher": {
      let lines: VoucherLine[];
      try {
        lines = body.lines.map((line, i) =>
          createVoucherLine({
            id: String(i + 1),
            account: line.account,
            accountName: ACCOUNTS.find((a) => a.number === line.account)?.name ?? "",
            debitMinor: line.debitMinor,
            creditMinor: line.creditMinor,
          }),
        );
      } catch (error) {
        return json(422, { ok: false, code: "voucher.bad-line", message: (error as Error).message });
      }
      const { status, body: answer } = toHttp(
        guardPostVoucher(context, { lines, date: body.date, rules: { periods: PERIODS, accounts: ACCOUNTS } }),
      );
      return json(status, answer);
    }
    case "decide-approval": {
      const { status, body: answer } = toHttp(
        guardDecideApproval(context, {
          chain: CHAIN,
          request: REQUEST,
          decision: body.decision,
          at: new Date().toISOString(),
        }),
      );
      return json(status, answer);
    }
    case "release-payments": {
      const { status, body: answer } = toHttp(guardReleasePayments(context, { batch: BATCH }));
      return json(status, answer);
    }
    default:
      return json(400, {
        ok: false,
        message: "Unknown action. Use post-voucher, decide-approval or release-payments.",
      });
  }
}
