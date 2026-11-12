// src/components/ui.jsx — small building blocks shared by every page.

import { themeQuartz } from "ag-grid-community";

// Look and feel of every AG Grid table. Colours come from CSS variables in
// styles.css, so tables follow light and dark mode automatically.
export const gridTheme = themeQuartz.withParams({
  fontFamily: "var(--font)",
  fontSize: 14,
  accentColor: "var(--accent)",
  backgroundColor: "var(--surface)",
  foregroundColor: "var(--ink)",
  headerBackgroundColor: "var(--surface)",
  headerTextColor: "var(--muted)",
  headerFontWeight: 500,
  borderColor: "var(--line)",
  rowHoverColor: "var(--hover)",
  selectedRowBackgroundColor: "var(--accent-soft)",
  wrapperBorderRadius: 6,
  rowHeight: 44,
  headerHeight: 40,
});

export const Icon = ({ name, size = 16, className = "" }) => {
  const paths = {
    shoppingCart:
      "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
    layoutDashboard:
      "M5 3H3a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM21 3h-2a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM5 15H3a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2zM21 15h-2a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2z",
    bot: "M12 8V4H8M12 8V4h4M12 8v4M4 20h16M4 20a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2M9 16h.01M15 16h.01",
    settings:
      "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    zap: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
    fileSearch:
      "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15h6",
    trendingUp: "M22 7 13.5 15.5 8.5 10.5 2 17M22 7h-5M22 7v5",
    check: "M20 6 9 17l-5-5",
    x: "M18 6 6 18M6 6l12 12",
    alertTriangle:
      "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
    send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z",
    refreshCw:
      "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16M21 8v-5M21 16v5",
    sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42",
    moon: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
    play: "M5 3l14 9-14 9V3z",
    pause: "M6 4h4v16H6zM14 4h4v16h-4z",
    skipForward: "M5 4l10 8-10 8V4zM19 5v14",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8h.01M11 12h1v4h1",
    package:
      "M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12",
    users:
      "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    search: "M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM21 21l-4.35-4.35",
    lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4",
    menu: "M4 6h16M4 12h16M4 18h16",
    close: "M18 6 6 18M6 6l12 12",
    home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
    creditCard:
      "M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 10h20M6 15h4",
    history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3",
    message: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    arrowRight: "M5 12h14M13 6l6 6-6 6",
    key: "M15.5 7.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM12 11v10M12 17h3M12 20h2",
    compass:
      "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36z",
    repeat:
      "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={paths[name] || ""} />
    </svg>
  );
};

export function Logo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="var(--ink)" />
      <path
        d="M7 7v10h7"
        stroke="var(--bg)"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="square"
      />
      <circle cx="17" cy="9" r="2.4" fill="var(--signal)" />
    </svg>
  );
}

export const Spinner = () => (
  <span className="spinner" role="status" aria-label="Loading" />
);

// Small status label. Tones: ok, warn, bad, info, muted.
export function Badge({ type = "muted", children, className = "", style }) {
  return (
    <span className={`badge badge-${type} ${className}`} style={style}>
      {children}
    </span>
  );
}

export function Empty({ message = "Nothing here yet.", children }) {
  return (
    <div className="empty">
      <p>{message}</p>
      {children}
    </div>
  );
}

// Page title, one sentence of explanation, and optional buttons on the right.
export function PageHeader({ title, children, actions }) {
  return (
    <header className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {children && <p className="page-lede">{children}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

// A small uppercase label above a group of content.
export function Eyebrow({ children, right }) {
  return (
    <div className="eyebrow">
      <span>{children}</span>
      {right}
    </div>
  );
}

// One numbered step in a flow (Licence Advisor, Renewals).
export function Step({ number, title, explain, tag, children, disabled }) {
  return (
    <section className={`step ${disabled ? "is-disabled" : ""}`}>
      <div className="step-num">{String(number).padStart(2, "0")}</div>
      <div className="step-main">
        <div className="step-head">
          <h2 className="step-title">{title}</h2>
          {tag}
        </div>
        {explain && <p className="step-explain">{explain}</p>}
        <div className="step-body">{children}</div>
      </div>
    </section>
  );
}

// Who makes this decision? Keeps the AI suggestion, the policy check and the
// human approval visibly separate.
const DECISION = {
  suggestion: "Suggestion",
  ai: "AI suggestion",
  rules: "Rule-based suggestion",
  policy: "Policy check",
  approval: "Your approval",
};
export function DecisionTag({ kind }) {
  return <span className={`decision decision-${kind}`}>{DECISION[kind]}</span>;
}

// Shows whether a payment went to PayPal's sandbox or was simulated locally.
export function MoneyLabel({ mock }) {
  return mock ? (
    <Badge type="warn">Simulated</Badge>
  ) : (
    <Badge type="info">PayPal sandbox</Badge>
  );
}
