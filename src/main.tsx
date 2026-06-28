import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
// Self-hosted typefaces (offline Electron) — Titillium Web for UI, Oswald for
// display (game titles, big headings), IBM Plex Mono for machine data. Imported
// before app.css so @font-face is registered first. Subset to latin + latin-ext
// only (English UI; latin-ext covers accented game titles).
import "@fontsource/titillium-web/latin-300.css";
import "@fontsource/titillium-web/latin-ext-300.css";
import "@fontsource/titillium-web/latin-400.css";
import "@fontsource/titillium-web/latin-ext-400.css";
import "@fontsource/titillium-web/latin-600.css";
import "@fontsource/titillium-web/latin-ext-600.css";
import "@fontsource/titillium-web/latin-700.css";
import "@fontsource/titillium-web/latin-ext-700.css";
import "@fontsource/oswald/latin-500.css";
import "@fontsource/oswald/latin-ext-500.css";
import "@fontsource/oswald/latin-600.css";
import "@fontsource/oswald/latin-ext-600.css";
import "@fontsource/oswald/latin-700.css";
import "@fontsource/oswald/latin-ext-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-ext-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-ext-500.css";
import App from "./App";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
