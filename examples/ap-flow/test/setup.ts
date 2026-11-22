import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { handleBooks } from "@/lib/handler";
import { books } from "@/lib/store";
import { seedBooks } from "@/lib/books";
import { cursor } from "@/lib/agent";

// The pointer glides between controls for people to follow; a test needs no travel time.
cursor.setEnabled(false);

// jsdom lacks these; the controls measure and animate with them.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never;
(Element.prototype as unknown as { getAnimations: () => unknown[] }).getAnimations ??= () => [];

// The page's fetch goes straight to the real handler: the same guard, in-process.
beforeEach(() => {
  Object.assign(books(), seedBooks());
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
    handleBooks(new Request(new URL(input, "http://localhost"), init)),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
