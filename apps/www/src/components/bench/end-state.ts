import { useLayoutEffect } from "react";

/**
 * For the benchmark's end-state checks only: a read-only mirror of a page's
 * React state on `window`, rewritten after every render. Writing to it changes
 * nothing, and a real agent never sees it.
 */
export function useEndState<T>(key: string, state: T) {
  useLayoutEffect(() => {
    (window as unknown as Record<string, T>)[key] = state;
  });
}
