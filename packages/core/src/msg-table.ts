import { createMessages } from "./message-render.js";

/** The table sentences, on their own: a table control loads these and not the whole catalogue. */
export const TABLE_EN = {
  "table.unknown-column": 'No column "{column}". Columns: {columns}.',
  "table.not-sortable": 'Column "{column}" cannot be sorted.',
  "table.bad-direction": 'A sort direction is "asc" or "desc", got "{direction}".',
  "table.bad-page": "Page {page} does not exist. There are {pages} pages.",
  "table.ids-not-list": 'Ids are a list of strings, like ["r1", "r2"]; got {got}.',
  "table.bad-page-size": "A page size is a whole number from 1 to {max}, got {size}.",
  "table.unknown-row": 'No row "{id}" in this table.',
  "table.unknown-row-listed": 'No row "{id}" in this table. Rows on this page: {rows}.',
} as const;

export const tableMessages = /* @__PURE__ */ createMessages(TABLE_EN);
