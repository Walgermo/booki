import { seedBooks, type Books } from "./books";

/**
 * One set of books for the whole server process, kept across hot reloads.
 * Your app reads and writes its database here instead.
 */
const holder = globalThis as typeof globalThis & { __apFlowBooks?: Books };

export function books(): Books {
  holder.__apFlowBooks ??= seedBooks();
  return holder.__apFlowBooks;
}
