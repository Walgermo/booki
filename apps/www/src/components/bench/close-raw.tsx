import { useState } from "react";

import { CLOSE_TASKS, PEOPLE, PERIOD_CODES, PERIODS, trialBalance } from "./workflow-data";

/**
 * Month-end checklist, built for the workflow benchmark as a plain page: a
 * list of tasks with checkboxes, the period statuses as a table, and a simple
 * voucher form for the one posting the close needs. No DOM map of a product's
 * own close screen was taken: this page follows the patterns of the mapped
 * screens, it is not a copy of one. Neutral look, invented data. Kept from
 * those screens:
 *
 * - checkboxes with no label, the task's title in text beside them
 * - dependencies written as text ("Avhenger av: …"), not enforced: any box
 *   can be ticked in any order
 * - "Signer" and "Lukk periode" are ordinary buttons for whoever is signed
 *   in; nothing tells a person's step from anyone else's
 * - the voucher's account and amount inputs have no label
 * - posting into a locked period is refused with a line of text
 * - the trial balance is a plain table with a sum row
 */

type Status = "open" | "done" | "signed";
export type RawCloseTask = {
  id: string;
  title: string;
  status: Status;
  doneBy?: string;
  signedBy?: string;
  needsSignOff?: boolean;
};
export type RawCloseState = {
  tasks: RawCloseTask[];
  periods: { code: string; status: string }[];
  voucher: { date: string; rows: { account: string; debit: string; credit: string }[]; posted: boolean };
  events: string[];
};

const MONTHS = [
  "januar",
  "februar",
  "mars",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "desember",
];
const monthName = (code: string) => `${MONTHS[Number(code.slice(5, 7)) - 1]} ${code.slice(0, 4)}`;
const STATUS_TEXT: Record<string, string> = { open: "Åpen", "soft-closed": "Lukket", "hard-closed": "Låst" };

/** The person signed in on this screen. Everything done here is recorded as theirs. */
const SIGNED_IN = "kari";

const amount = (text: string) => {
  const t = text
    .replace(/[\s ]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  return t === "" ? 0 : /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : Number.NaN;
};

/** The date as typed: ISO or d.m.yyyy. */
const isoOf = (text: string) => {
  const t = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : "";
};

export function CloseRaw() {
  const [tasks, setTasks] = useState<RawCloseTask[]>(() => CLOSE_TASKS.map((t) => ({ ...t })));
  const [periods, setPeriods] = useState(() =>
    PERIOD_CODES.map((code) => ({ code, status: PERIODS.find((p) => p.code === code)?.status ?? "open" })),
  );
  const [date, setDate] = useState("");
  const [rows, setRows] = useState([
    { account: "", debit: "", credit: "" },
    { account: "", debit: "", credit: "" },
  ]);
  const [posted, setPosted] = useState(false);
  const [message, setMessage] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const log = (event: string) => setEvents((all) => [...all, event]);

  // For the benchmark's end-state checks only. A real agent never sees this.
  (window as unknown as { __rawClose?: RawCloseState }).__rawClose = {
    tasks,
    periods,
    voucher: { date, rows, posted },
    events,
  };

  const setTask = (id: string, patch: Partial<RawCloseTask>) =>
    setTasks((all) => all.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const titleOf = (id: string) => tasks.find((t) => t.id === id)?.title ?? id;

  const nok = (minor: number) =>
    (minor / 100)
      .toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .replace(/\u00a0/g, " ");
  const postedLines = posted
    ? rows.map((r) => ({
        account: r.account.trim().split(/\s/)[0] ?? "",
        debitMinor: amount(r.debit) || 0,
        creditMinor: amount(r.credit) || 0,
      }))
    : [];
  const balance = trialBalance(postedLines);
  const balanceSum = balance.reduce((sum, row) => sum + row.balanceMinor, 0);

  const post = () => {
    const iso = isoOf(date);
    const status = periods.find((p) => iso.startsWith(p.code))?.status ?? "open";
    const debit = rows.reduce((s, r) => s + amount(r.debit), 0);
    const credit = rows.reduce((s, r) => s + amount(r.credit), 0);
    if (!iso) return setMessage("Ugyldig dato.");
    if (status !== "open")
      return setMessage(`Perioden ${monthName(iso.slice(0, 7))} er ${STATUS_TEXT[status]!.toLowerCase()}.`);
    if (!(debit > 0) || debit !== credit) return setMessage("Bilaget balanserer ikke.");
    setPosted(true);
    setMessage("Bilaget er bokført.");
    log("posted");
  };

  return (
    <div className="raw-voucher">
      <div className="raw-row">
        <h1>Månedsavslutning oktober 2026</h1>
        <button type="button" className="raw-icon">
          more_vert
        </button>
      </div>

      <section>
        <h2>Sjekkliste</h2>
        <table className="raw-table">
          <tbody>
            {tasks.map((task) => {
              const spec = CLOSE_TASKS.find((t) => t.id === task.id)!;
              return (
                <tr key={task.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={task.status !== "open"}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setTask(task.id, { status: "done", doneBy: SIGNED_IN });
                          log(`done:${task.id}`);
                        } else {
                          setTask(task.id, { status: "open", doneBy: undefined, signedBy: undefined });
                          log(`reopen:${task.id}`);
                        }
                      }}
                    />
                  </td>
                  <td>{task.title}</td>
                  <td>{spec.dependsOn?.length ? `Avhenger av: ${spec.dependsOn.map(titleOf).join(", ")}` : ""}</td>
                  <td>
                    {task.status === "open"
                      ? "Ikke startet"
                      : `Utført av ${PEOPLE[task.doneBy ?? ""] ?? task.doneBy}` +
                        (task.status === "signed"
                          ? ` · signert av ${PEOPLE[task.signedBy ?? ""] ?? task.signedBy}`
                          : task.needsSignOff
                            ? " · venter på signering"
                            : "")}
                  </td>
                  <td>
                    {task.status === "done" && task.needsSignOff ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTask(task.id, { status: "signed", signedBy: SIGNED_IN });
                          log(`signed:${task.id}`);
                        }}
                      >
                        Signer
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Perioder</h2>
        <table className="raw-table">
          <tbody>
            {periods.map((period) => (
              <tr key={period.code}>
                <td>{monthName(period.code)}</td>
                <td>{STATUS_TEXT[period.status]}</td>
                <td>
                  {period.status === "open" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPeriods((all) =>
                          all.map((p) => (p.code === period.code ? { ...p, status: "soft-closed" } : p)),
                        );
                        log(`close:${period.code}`);
                      }}
                    >
                      Lukk periode
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Saldobalanse oktober 2026</h2>
        <table className="raw-table">
          <thead>
            <tr>
              <th>Konto</th>
              <th>Navn</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {balance.map((row) => (
              <tr key={row.account}>
                <td>{row.account}</td>
                <td>{row.name}</td>
                <td>{nok(row.balanceMinor)}</td>
              </tr>
            ))}
            <tr>
              <td>Sum</td>
              <td />
              <td>{nok(balanceSum)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Bilag</h2>
        <div className="raw-row">
          <label>
            Bilagsdato
            <input type="text" value={date} readOnly={posted} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <div className="raw-grid raw-head">
          <span>Konto</span>
          <span>Debet</span>
          <span>Kredit</span>
          <span />
          <span />
        </div>
        {rows.map((row, index) => (
          <div key={index} className="raw-grid">
            {(["account", "debit", "credit"] as const).map((key) => (
              <input
                key={key}
                type="text"
                placeholder=""
                readOnly={posted}
                value={row[key]}
                onChange={(e) =>
                  setRows((all) => all.map((r, i) => (i === index ? { ...r, [key]: e.target.value } : r)))
                }
              />
            ))}
            <span />
            <button type="button" className="raw-icon">
              delete
            </button>
          </div>
        ))}
        <div className="raw-footer">
          <button type="button" className="raw-primary" disabled={posted} onClick={post}>
            Bokfør bilag
          </button>
          <span>{message}</span>
        </div>
      </section>
    </div>
  );
}
