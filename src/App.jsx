// src/App.jsx — the frame around every page: the menu on the left and the
// page on the right. Each page lives in its own file in src/pages/.

import { useEffect, useState } from "react";
import {
  CellStyleModule,
  ClientSideRowModelModule,
  CsvExportModule,
  ModuleRegistry,
  NumberFilterModule,
  RowSelectionModule,
  TextFilterModule,
  ValidationModule,
} from "ag-grid-community";
import { api } from "./lib/api.js";
import { Icon, Logo } from "./components/ui.jsx";
import Overview from "./pages/Overview.jsx";
import Customers from "./pages/Customers.jsx";
import LicenceAdvisor from "./pages/LicenceAdvisor.jsx";
import Renewals from "./pages/Renewals.jsx";
import Assistant from "./pages/Assistant.jsx";
import Payments from "./pages/Payments.jsx";
import Activity from "./pages/Activity.jsx";
import "./styles.css";

// AG Grid Community features used by the tables (free, no licence key needed).
ModuleRegistry.registerModules([
  CellStyleModule,
  ClientSideRowModelModule,
  CsvExportModule,
  NumberFilterModule,
  RowSelectionModule,
  TextFilterModule,
  ValidationModule,
]);

// The menu, in two groups: running the business, and the money side.
const NAV = [
  {
    group: null,
    pages: [
      { id: "overview", icon: "home", label: "Overview", Page: Overview },
      { id: "customers", icon: "users", label: "Customers", Page: Customers },
      {
        id: "advisor",
        icon: "compass",
        label: "Licence Advisor",
        Page: LicenceAdvisor,
      },
      { id: "renewals", icon: "repeat", label: "Renewals", Page: Renewals },
      {
        id: "assistant",
        icon: "message",
        label: "AI Assistant",
        Page: Assistant,
      },
    ],
  },
  {
    group: "Records",
    pages: [
      { id: "payments", icon: "creditCard", label: "Payments", Page: Payments },
      {
        id: "activity",
        icon: "history",
        label: "Activity History",
        Page: Activity,
      },
    ],
  },
];
const PAGES = NAV.flatMap((section) => section.pages);

function readStored(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [view, setView] = useState("overview");
  const [theme, setTheme] = useState(() => readStored("lp-theme", "light"));
  const [menuOpen, setMenuOpen] = useState(false);
  const [configError, setConfigError] = useState("");
  // What the server says is switched on (PayPal keys, AI key).
  const [cfg, setCfg] = useState({
    paypalClientId: null,
    paypalWebhookConfigured: false,
    aiEnabled: false,
    demoMode: true,
  });

  useEffect(() => {
    api("/config")
      .then(setCfg)
      .catch((e) => setConfigError(e.message));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("lp-theme", theme);
    } catch {
      // Private browsing: the theme just won't be remembered.
    }
  }, [theme]);

  const go = (id) => {
    setView(id);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  };

  const current = PAGES.find((p) => p.id === view);
  const Page = current.Page;

  return (
    <div className="app">
      <header className="mobile-bar">
        <button
          className="btn btn-icon"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
        >
          <Icon name={menuOpen ? "close" : "menu"} size={18} />
        </button>
        <span className="brand-name">LicensePilot</span>
      </header>
      {menuOpen && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu"
        />
      )}

      <aside
        id="main-navigation"
        className={`sidebar ${menuOpen ? "is-open" : ""}`}
        aria-label="Main menu"
      >
        <button className="brand" onClick={() => go("overview")}>
          <Logo size={22} />
          <span className="brand-name">LicensePilot</span>
        </button>

        <nav>
          {NAV.map((section, i) => (
            <div className="nav-group" key={section.group || i}>
              {section.group && (
                <div className="nav-heading">{section.group}</div>
              )}
              {section.pages.map((p) => (
                <button
                  key={p.id}
                  className={`nav-btn ${view === p.id ? "is-active" : ""}`}
                  onClick={() => go(p.id)}
                  aria-current={view === p.id ? "page" : undefined}
                >
                  <Icon name={p.icon} size={17} />
                  {p.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <dl className="env-mini">
            <div>
              <dt>Payments</dt>
              <dd>
                <span
                  className={`dot ${cfg.demoMode ? "seg-warn" : "seg-ok"}`}
                />
                {cfg.demoMode ? "Simulated" : "PayPal sandbox"}
              </dd>
            </div>
            <div>
              <dt>AI</dt>
              <dd>
                <span
                  className={`dot ${cfg.aiEnabled ? "seg-ok" : "seg-muted"}`}
                />
                {cfg.aiEnabled ? "Claude" : "Off — fixed rules"}
              </dd>
            </div>
          </dl>
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
          >
            <Icon name={theme === "light" ? "moon" : "sun"} size={14} />
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
          <p className="legal">
            Independent hackathon project. Not affiliated with AG Grid or
            PayPal.
          </p>
        </div>
      </aside>

      <main className="main">
        <div className="env-strip">
          <span className="env-tag">{cfg.demoMode ? "Demo" : "Sandbox"}</span>
          {cfg.demoMode
            ? "PayPal isn't connected. Payments are simulated."
            : "All payments use PayPal test accounts. No real money is charged."}
        </div>
        {configError && (
          <div
            className="notice notice-bad"
            role="alert"
            style={{ margin: 24 }}
          >
            Can't reach the server ({configError}). Is <code>npm run dev</code>{" "}
            running?
          </div>
        )}
        <Page cfg={cfg} onNavigate={go} />
      </main>
    </div>
  );
}
