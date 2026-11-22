import { useState } from "react";

/**
 * The picker pattern shared by the supplier-invoice and order replicas, kept
 * as mapped (read only): a `div role="listbox"` whose accessible name is built
 * by string-concatenating an object, so it reads "[object Object] (Ikke
 * valgt)" and, once chosen, "[object Object] <text>". Clicking it opens a
 * dialog with no role: an unlabeled search box (placeholder only) and a list
 * table. Neutral look, invented data.
 */

export type PickEntry = { type?: string; number?: string; name: string };

export const entryText = (entry: PickEntry) => [entry.number, entry.name].filter(Boolean).join(" ");

export function RawListbox({
  value,
  empty,
  onOpen,
}: {
  value: PickEntry | null;
  /** What the box says when nothing is chosen, e.g. "(Ikke valgt)". */
  empty: string;
  onOpen: () => void;
}) {
  const text = value ? entryText(value) : empty;
  // The mapped product builds the name as `${object} ${text}`.
  const objectName = String({});
  return (
    <div
      role="listbox"
      tabIndex={0}
      aria-label={`${objectName} ${text}`}
      className="raw-picker"
      onClick={onOpen}
      onKeyDown={(event) => event.key === "Enter" && onOpen()}
    >
      <span>{text}</span>
      <span aria-hidden className="raw-caret">
        ▾
      </span>
    </div>
  );
}

export function RawPickDialog({
  entries,
  columns,
  onPick,
  onClose,
}: {
  entries: PickEntry[];
  /** Header texts; a header table separate from the list, as mapped. */
  columns: string[];
  onPick: (entry: PickEntry) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = entries.filter((entry) => !q || entry.number?.startsWith(q) || entry.name.toLowerCase().includes(q));
  const cells = (entry: PickEntry) =>
    columns.length === 3 ? [entry.type ?? "", entry.number ?? "", entry.name] : [entryText(entry)];
  return (
    <div className="raw-dialog">
      <div className="raw-row">
        <input
          type="text"
          placeholder="Søk"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && onClose()}
        />
      </div>
      {columns.length > 1 ? (
        <table className="raw-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
        </table>
      ) : null}
      <div className="raw-list">
        <table className="raw-table">
          <tbody>
            {matches.map((entry) => (
              <tr key={`${entry.type ?? ""}-${entry.number ?? ""}-${entry.name}`} onClick={() => onPick(entry)}>
                {cells(entry).map((cell, index) => (
                  <td key={index}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
