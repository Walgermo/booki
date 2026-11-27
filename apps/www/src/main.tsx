// Create the agent bridge before anything renders, so it sees every control.
import "./agent";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { BookiLocaleProvider } from "@booki-aui/react";
import { App } from "./App";
import { LangProvider } from "./lib/lang";
import "./styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root missing");

const app = (
  <StrictMode>
    <BrowserRouter>
      <LangProvider>
        <BookiLocaleProvider defaultCountry="NO">
          <App />
        </BookiLocaleProvider>
      </LangProvider>
    </BrowserRouter>
  </StrictMode>
);

// The page is prerendered in English and hydrated, so the title is painted once, not again when the
// script runs. In Norwegian (or another stored choice) the text differs from the HTML: React then
// renders the page afresh, as before. That one mismatch is expected and not reported.
// The dev server's page is empty: there is nothing to hydrate.
// A client-only route can receive the prerendered home page from the SPA fallback.
const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
const requestedPath = location.pathname.replace(/\/+$/, "") || "/";
if (root.hasChildNodes() && canonical && new URL(canonical.href).pathname === requestedPath) {
  hydrateRoot(root, app, {
    onRecoverableError: (error) => {
      if (document.documentElement.lang !== "en") return;
      reportError(error);
    },
  });
} else {
  createRoot(root).render(app);
}
