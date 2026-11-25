// Create the agent bridge before anything renders, so it sees every control.
import "./agent";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { BookiLocaleProvider } from "@booki-aui/react";
import { App } from "./App";
import { LangProvider } from "./lib/lang";
import "./styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root missing");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <LangProvider>
        <BookiLocaleProvider defaultCountry="NO">
          <App />
        </BookiLocaleProvider>
      </LangProvider>
    </BrowserRouter>
  </StrictMode>,
);
