import { useState } from "react";
import { useEndState } from "./end-state";

import { BANK_LINES, OPEN_POSTS } from "./workflow-data";

/**
 * Bank reconciliation, built for the workflow benchmark as an ordinary screen:
 * the statement's lines and the open posts as two plain tables, one unlabeled
 * checkbox per row, and one button that reconciles what is ticked. No DOM map
 * of a product's own reconciliation screen was taken: this page follows the
 * patterns of the mapped screens, it is not a copy of one. Neutral look,
 * invented data. Patterns kept:
 *
 * - checkboxes with no label; the row's text sits in the cells beside them
 * - the reconcile button named by its icon ligature ("done_all"); the word
 *   "Avstem" is a caption next to it, not its name
 * - a reconciliation is final at once: no one approves it afterwards
 * - when the ticked sides do not sum to the same amount the button says so
 *   in a line of text and does nothing
 */

const nok = (minor: number) =>
  (minor / 100).toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, " ");

export type RawReconcileState = {
  matches: { bankLineIds: string[]; postIds: string[] }[];
};

export function ReconcileRaw() {
  const [lines, setLines] = useState<string[]>([]);
  const [posts, setPosts] = useState<string[]>([]);
  const [matches, setMatches] = useState<RawReconcileState["matches"]>([]);
  const [message, setMessage] = useState("");

  // For the benchmark's end-state checks only. A real agent never sees this.
  useEndState<RawReconcileState>("__rawReconcile", { matches });

  const usedLines = new Set(matches.flatMap((m) => m.bankLineIds));
  const usedPosts = new Set(matches.flatMap((m) => m.postIds));
  const toggle = (list: string[], set: (next: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const reconcile = () => {
    if (lines.length === 0 || posts.length === 0) {
      setMessage("Velg minst én banklinje og én post.");
      return;
    }
    const bank = BANK_LINES.filter((l) => lines.includes(l.id)).reduce((s, l) => s + l.amountMinor, 0);
    const ledger = OPEN_POSTS.filter((p) => posts.includes(p.id)).reduce((s, p) => s + p.amountMinor, 0);
    if (bank !== ledger) {
      setMessage(`Differanse ${nok(bank - ledger)}. Beløpene må være like.`);
      return;
    }
    setMatches((all) => [...all, { bankLineIds: lines, postIds: posts }]);
    setLines([]);
    setPosts([]);
    setMessage(`Avstemt ${nok(bank)}.`);
  };

  return (
    <div className="raw-voucher">
      <div className="raw-row">
        <h1>Bankavstemming</h1>
        <span>1920 Bankinnskudd · oktober 2026</span>
        <button type="button" className="raw-icon">
          tune
        </button>
        <button type="button" className="raw-icon">
          more_vert
        </button>
      </div>

      <section>
        <h2>Banktransaksjoner</h2>
        <table className="raw-table">
          <thead>
            <tr>
              <th />
              <th>Dato</th>
              <th>Tekst</th>
              <th>Referanse</th>
              <th>Beløp</th>
            </tr>
          </thead>
          <tbody>
            {BANK_LINES.filter((l) => !usedLines.has(l.id)).map((line) => (
              <tr key={line.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={lines.includes(line.id)}
                    onChange={() => toggle(lines, setLines, line.id)}
                  />
                </td>
                <td>{line.date}</td>
                <td>{line.description}</td>
                <td>{line.reference ?? ""}</td>
                <td>{nok(line.amountMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Åpne poster</h2>
        <table className="raw-table">
          <thead>
            <tr>
              <th />
              <th>Dato</th>
              <th>Tekst</th>
              <th>Referanse</th>
              <th>Beløp</th>
            </tr>
          </thead>
          <tbody>
            {OPEN_POSTS.filter((p) => !usedPosts.has(p.id)).map((post) => (
              <tr key={post.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={posts.includes(post.id)}
                    onChange={() => toggle(posts, setPosts, post.id)}
                  />
                </td>
                <td>{post.date}</td>
                <td>{post.description}</td>
                <td>{post.reference ?? ""}</td>
                <td>{nok(post.amountMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="raw-footer">
        <button type="button" className="raw-icon raw-primary" onClick={reconcile}>
          done_all
        </button>
        <span>Avstem</span>
        <span>{message}</span>
      </div>

      <section>
        <h2>Avstemt</h2>
        <table className="raw-table">
          <tbody>
            {matches.map((match, index) => (
              <tr key={index}>
                <td>{match.bankLineIds.map((id) => BANK_LINES.find((l) => l.id === id)?.description).join(" + ")}</td>
                <td>{match.postIds.map((id) => OPEN_POSTS.find((p) => p.id === id)?.description).join(" + ")}</td>
                <td>
                  {nok(
                    match.bankLineIds.reduce((s, id) => s + (BANK_LINES.find((l) => l.id === id)?.amountMinor ?? 0), 0),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
