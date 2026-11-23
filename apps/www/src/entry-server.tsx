/**
 * The site as HTML at build time, for readers without JavaScript: agents that
 * fetch a page, search engines and link previews. scripts/prerender.mjs calls
 * `render` once per page and writes the result into dist. In the browser,
 * main.tsx renders the same tree again with the agent bridge.
 */
import { StrictMode } from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { StaticRouter } from "react-router-dom";

import { BookiLocaleProvider } from "@booki/react";
import { App } from "./App";
import { LangProvider, SITE_META, renderedPageMeta, type PageMeta } from "./lib/lang";

/** The setup prompt the Install button copies, also served as /prompt.md for agents. */
export { AGENT_PROMPT } from "./components/landing/shared";

export async function render(url: string): Promise<{ html: string; meta: PageMeta }> {
  (globalThis as { __BOOKI_PRERENDER__?: boolean }).__BOOKI_PRERENDER__ = true;
  renderedPageMeta.current = null;
  const { prelude } = await prerenderToNodeStream(
    <StrictMode>
      <StaticRouter location={url}>
        <LangProvider>
          <BookiLocaleProvider defaultCountry="NO">
            <App />
          </BookiLocaleProvider>
        </LangProvider>
      </StaticRouter>
    </StrictMode>,
  );
  let html = "";
  for await (const chunk of prelude) html += String(chunk);
  return { html, meta: renderedPageMeta.current ?? SITE_META };
}
