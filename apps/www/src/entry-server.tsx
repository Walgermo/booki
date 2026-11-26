/**
 * The site as HTML at build time, for readers without JavaScript: agents that
 * fetch a page, search engines and link previews. scripts/prerender.mjs calls
 * `render` once per page and writes the result into dist. In the browser,
 * main.tsx renders the same tree again with the agent bridge.
 */
import { StrictMode } from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { StaticRouter } from "react-router-dom";

import { BookiLocaleProvider } from "@booki-aui/react";
import { App } from "./App";
import { LangProvider, SITE_META, renderedPageMeta, type PageMeta } from "./lib/lang";

/** The setup prompts: the one-screen trial the homepage copies (/prompt.md) and the whole-app one (/prompt-full.md). */
export { AGENT_PROMPT, AGENT_PROMPT_FULL } from "./components/landing/shared";

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
