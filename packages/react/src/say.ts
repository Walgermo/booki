import { useSyncExternalStore } from "react";
import { useBookiLocaleOptional } from "./locale.js";

type Localize = typeof import("@booki-aui/core/messages").localize;

// The Norwegian catalogue loads the first time a Norwegian screen needs it, so
// an English page never downloads it. English needs no catalogue: core's
// sentences are English already.
let loaded: Localize | null = null;
let loading: Promise<Localize> | null = null;

function loadLocalize(): Promise<Localize> {
  loading ??= import("@booki-aui/core/messages").then((module) => (loaded = module.localize));
  return loading;
}

/** Starts loading the Norwegian catalogue ahead of the first refusal. */
export function preloadNorwegian(): Promise<unknown> {
  return loadLocalize();
}

const readLocalize = () => loaded;
const serverLocalize = () => null;
const subscribeEnglish = () => () => {};

function subscribeNorwegian(notify: () => void) {
  let subscribed = true;
  if (!loaded)
    void loadLocalize().then(() => {
      if (subscribed) notify();
    });
  return () => {
    subscribed = false;
  };
}

/**
 * Turns a refusal or an issue from `@booki-aui/core` into the person's language.
 * State keeps the English sentence, which is what an agent reads; only what
 * the screen shows is translated. Text it does not know comes back unchanged.
 * In Norwegian, the first render after the page opens may show English for
 * the moment the catalogue takes to load.
 */
export function useSay(): (text: string) => string {
  const { country } = useBookiLocaleOptional();
  const norwegian = country === "NO";
  const localize = useSyncExternalStore(
    norwegian ? subscribeNorwegian : subscribeEnglish,
    readLocalize,
    serverLocalize,
  );
  return (text: string) => (norwegian && localize ? localize(text, "nb") : text);
}
