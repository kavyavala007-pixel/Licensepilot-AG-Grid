import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AgCharts } from "ag-charts-react";
import {
  ClientSideRowModelModule,
  CsvExportModule,
  ModuleRegistry,
  NumberFilterModule,
  RowSelectionModule,
  TextFilterModule,
  ValidationModule,
  themeQuartz,
} from "ag-grid-community";
import "./styles.css";

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  CsvExportModule,
  NumberFilterModule,
  RowSelectionModule,
  TextFilterModule,
  ValidationModule,
]);

// ─── AG Grid Theme ───────────────────────────────────────────────────────────
const gridTheme = themeQuartz.withParams({
  accentColor: "#1b7fe0",
  headerBackgroundColor: "#0b1f33",
  headerTextColor: "#e0eaf4",
  fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
  fontSize: 13,
  cellHorizontalPaddingScale: 1.1,
  rowHeight: 40,
  headerHeight: 40,
});

// ─── API Helper ──────────────────────────────────────────────────────────────
const api = async (path, body, method) => {
  const r = await fetch("/api" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "API error");
  return d;
};

// ─── Formatting helpers ───────────────────────────────────────────────────────
const money = (n) => "$" + Number(n || 0).toLocaleString();
const relTime = (iso) => {
  const d = (Date.now() - new Date(iso)) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return Math.floor(d / 60) + "m ago";
  if (d < 86400) return Math.floor(d / 3600) + "h ago";
  return Math.floor(d / 86400) + "d ago";
};

// ─── Icons (Lucide-style inline SVG for minimal bundle) ──────────────────────
const Icon = ({ name, size = 16, className = "" }) => {
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
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={paths[name] || ""} />
    </svg>
  );
};

// ─── Logo ─────────────────────────────────────────────────────────────────────
function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1b7fe0" />
      <path
        d="M7 10h18M7 16h18M7 22h11"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="25" cy="22" r="4" fill="#19c3d6" />
    </svg>
  );
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
const Spinner = () => (
  <div className="spinner" role="status" aria-label="Loading" />
);

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ type = "muted", children, className = "", style }) {
  return (
    <span className={`badge badge-${type} ${className}`} style={style}>
      {children}
    </span>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function Empty({ icon = "package", message = "Nothing here yet." }) {
  return (
    <div className="empty">
      <Icon name={icon} size={36} className="empty-icon" />
      <span>{message}</span>
    </div>
  );
}

// ─── SSE Hook ────────────────────────────────────────────────────────────────
function useSSE(onEvent) {
  const callbackRef = useRef(onEvent);
  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = (m) => {
      try {
        callbackRef.current(JSON.parse(m.data));
      } catch (error) {
        console.error("Invalid live event:", error);
      }
    };
    es.onerror = () => {
      /* reconnects automatically */
    };
    return () => es.close();
  }, []);
}

// ─── Buyer Screen ─────────────────────────────────────────────────────────────
function Buyer({ cfg }) {
  const sandboxTestAmount = 1;
  const [pkg, setPkg] = useState(
    '{\n  "dependencies": {\n    "ag-grid-enterprise": "^34.0.0",\n    "ag-charts-enterprise": "^12.0.0"\n  }\n}',
  );
  const [devs, setDevs] = useState(6);
  const [audience, setAudience] = useState("internal");
  const [spendLimit, setSpendLimit] = useState(8000);
  const [paid, setPaid] = useState(null);
  const [managerApproved, setManagerApproved] = useState(false);
  const [explain, setExplain] = useState("");
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState("");
  const paypalRef = useRef(null);

  const rec = useMemo(() => {
    const grid = pkg.includes("ag-grid-enterprise");
    const charts = pkg.includes("ag-charts-enterprise");
    if (!grid && !charts) return { route: "free" };
    const product =
      grid && charts
        ? "Enterprise Bundle"
        : grid
          ? "AG Grid Enterprise"
          : "AG Charts Enterprise";
    if (audience === "external" || devs > 10) {
      return {
        route: "sales",
        product,
        why:
          audience === "external"
            ? "Customer-facing apps are priced by the sales team."
            : "More than 10 developer licences are quoted by the sales team.",
      };
    }
    return { route: "online", product, total: sandboxTestAmount };
  }, [pkg, devs, audience]);

  const needsApproval = rec.route === "online" && rec.total > spendLimit;
  const canPay = rec.route === "online" && (!needsApproval || managerApproved);

  const reset = () => {
    setPaid(null);
    setManagerApproved(false);
    setExplain("");
    setPayError("");
  };

  // PayPal button
  useEffect(() => {
    if (!cfg.paypalClientId || !canPay || paid || !paypalRef.current) return;
    let alive = true;
    const draw = () => {
      if (!alive || !window.paypal || !paypalRef.current) return;
      paypalRef.current.innerHTML = "";
      window.paypal
        .Buttons({
          style: {
            layout: "horizontal",
            color: "gold",
            shape: "rect",
            label: "pay",
            height: 40,
          },
          createOrder: async () =>
            (
              await api("/orders", {
                amount: rec.total,
                desc: `${rec.product} × ${devs}`,
                product: rec.product,
                seats: devs,
              })
            ).id,
          onApprove: async (d) => {
            try {
              const result = await api(`/orders/${d.orderID}/capture`, {});
              if (result.status === "COMPLETED") setPaid(result);
            } catch (error) {
              setPayError(error.message);
            }
          },
          onError: () =>
            setPayError(
              "PayPal checkout could not be completed. Please try again.",
            ),
        })
        .render(paypalRef.current);
    };
    if (window.paypal) draw();
    else {
      const s = document.createElement("script");
      s.src = `https://www.paypal.com/sdk/js?client-id=${cfg.paypalClientId}&currency=USD`;
      s.onload = draw;
      s.onerror = () =>
        setPayError(
          "PayPal checkout could not load. Check your connection and sandbox app.",
        );
      document.body.appendChild(s);
    }
    return () => {
      alive = false;
    };
  }, [cfg.paypalClientId, canPay, paid, rec.total]);

  const askExplain = async () => {
    setBusy(true);
    try {
      const d = await api("/explain", {
        product: rec.product,
        devs,
        audience,
        route: rec.route,
        sandboxTestAmount,
      });
      setExplain(
        `${d.ai ? "AI recommendation" : "Rules-based recommendation"}: ${d.text}`,
      );
    } catch (error) {
      setPayError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const simulatePayment = async () => {
    setPayError("");
    try {
      const order = await api("/orders", {
        amount: sandboxTestAmount,
        desc: `${rec.product} × ${devs}`,
        product: rec.product,
        seats: devs,
      });
      const result = await api(`/orders/${order.id}/capture`, {});
      if (result.status === "COMPLETED") setPaid(result);
    } catch (error) {
      setPayError(error.message);
    }
  };

  const step = paid ? 4 : managerApproved || !needsApproval ? 3 : 2;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Buy the right licence</div>
          <div className="page-sub">
            Paste your package.json. LicensePilot detects paid packages and
            routes your use case to online checkout or vendor sales.
          </div>
        </div>
      </div>
      <div className="page-body">
        {/* Step indicator */}
        <div className="steps" style={{ marginBottom: 20 }}>
          {["Your project", "Recommendation", "Approval", "Pay"].map((s, i) => (
            <div
              key={s}
              className={`step ${i + 1 < step ? "done" : i + 1 === step ? "active" : ""}`}
            >
              <span className="step-num">{i + 1 < step ? "✓" : i + 1}</span>
              {s}
            </div>
          ))}
        </div>

        <div className="grid-2">
          {/* Left: inputs */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">1. Your project</div>
                <div className="card-sub">
                  Paste your package.json and tell us about your team
                </div>
              </div>
              <Icon
                name="fileSearch"
                size={18}
                style={{ color: "var(--muted)" }}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="pkg">
                package.json
              </label>
              <textarea
                id="pkg"
                className="textarea"
                value={pkg}
                onChange={(e) => {
                  setPkg(e.target.value);
                  reset();
                }}
                spellCheck={false}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="devs">
                Front-end developers on this project
              </label>
              <input
                id="devs"
                type="number"
                min="1"
                max="1000"
                className="input"
                value={devs}
                onChange={(e) => {
                  setDevs(Math.max(1, parseInt(e.target.value) || 1));
                  reset();
                }}
              />
              <span className="hint">
                Count every developer who touches the front end, even if they
                don't use the grid directly.
              </span>
            </div>
            <div className="field">
              <label className="label" htmlFor="audience">
                Who uses this application?
              </label>
              <select
                id="audience"
                className="select"
                value={audience}
                onChange={(e) => {
                  setAudience(e.target.value);
                  reset();
                }}
              >
                <option value="internal">Our own staff (internal app)</option>
                <option value="external">
                  External customers (customer-facing app)
                </option>
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="limit">
                Spending limit — auto-approve up to ($)
              </label>
              <input
                id="limit"
                type="number"
                min="0"
                className="input"
                value={spendLimit}
                onChange={(e) => setSpendLimit(Number(e.target.value) || 0)}
              />
              <span className="hint">
                Orders above this amount need manager approval.
              </span>
            </div>
          </div>

          {/* Right: recommendation + payment */}
          <div className="stack">
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">2. Recommendation</div>
                  <div className="card-sub">
                    Detected from your package.json
                  </div>
                </div>
                {rec.route !== "free" && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={askExplain}
                    disabled={busy}
                  >
                    {busy ? <Spinner /> : <Icon name="bot" />}
                    {busy
                      ? "Thinking…"
                      : cfg.aiEnabled
                        ? "Explain with AI"
                        : "Explain"}
                  </button>
                )}
                {!cfg.demoMode && !cfg.paypalWebhookConfigured && (
                  <div className="sandbox-bar">
                    <Icon name="alertTriangle" size={13} />
                    Webhook verification is unavailable until PAYPAL_WEBHOOK_ID
                    is configured. Checkout works; payment events will be
                    rejected.
                  </div>
                )}
              </div>

              {rec.route === "free" && (
                <div className="rec">
                  <div style={{ fontWeight: 700 }}>
                    Community edition — no licence needed
                  </div>
                  <div className="rec-desc">
                    No ag-grid-enterprise or ag-charts-enterprise packages
                    detected. The free Community edition covers your use case.
                  </div>
                </div>
              )}
              {rec.route === "sales" && (
                <div className="rec">
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    {rec.product} — Sales-assisted
                  </div>
                  <div className="rec-desc">{rec.why}</div>
                  <div className="rec-desc" style={{ marginTop: 6 }}>
                    Price set by the vendor. See AG Grid&apos;s own pricing
                    configurator.
                  </div>
                  <a
                    className="text-link"
                    href="https://www.ag-grid.com/license-pricing/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open pricing configurator
                  </a>
                </div>
              )}
              {rec.route === "online" && (
                <div className="rec">
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    {rec.product} × {devs} developer{devs > 1 ? "s" : ""}
                  </div>
                  <div className="rec-desc">
                    Price set by the vendor. See AG Grid&apos;s own pricing
                    configurator.
                  </div>
                  <a
                    className="text-link"
                    href="https://www.ag-grid.com/license-pricing/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open pricing configurator
                  </a>
                  <div className="sandbox-test-label">
                    Sandbox test payment, no real money: $
                    {sandboxTestAmount.toFixed(2)}. This test amount is not a
                    licence price or quote.
                  </div>
                </div>
              )}

              {explain && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    background: "var(--surface-2)",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "var(--ink-2)",
                    borderLeft: "3px solid var(--blue)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--muted)",
                      marginBottom: 4,
                    }}
                  >
                    {cfg.aiEnabled
                      ? "AI explanation"
                      : "Rules-based explanation"}
                  </div>
                  {explain}
                </div>
              )}
            </div>

            {rec.route === "online" && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>
                  3. Approval
                </div>
                {needsApproval && !managerApproved ? (
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <Badge type="amber">
                      <Icon name="alertTriangle" size={11} /> Manager approval
                      needed
                    </Badge>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setManagerApproved(true)}
                    >
                      <Icon name="check" size={12} /> Approve as manager
                    </button>
                  </div>
                ) : (
                  <Badge type="green">
                    <Icon name="check" size={11} />
                    {needsApproval
                      ? "Approved by manager"
                      : "Auto-approved by policy"}
                  </Badge>
                )}
              </div>
            )}

            {rec.route === "online" && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>
                  4. Payment
                </div>
                {payError && (
                  <div className="form-error" role="alert">
                    {payError}
                  </div>
                )}
                {paid ? (
                  <div>
                    <Badge type="green">
                      <Icon name="check" size={11} /> Sandbox test payment, no
                      real money
                    </Badge>
                    <div className="sandbox-test-label">
                      ${sandboxTestAmount.toFixed(2)} test amount; not the
                      licence price or an official quote.
                    </div>
                    <div
                      style={{
                        marginTop: 10,
                        padding: "10px 12px",
                        background: "var(--surface-2)",
                        borderRadius: 8,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--muted)",
                          fontWeight: 700,
                          marginBottom: 4,
                        }}
                      >
                        Licence key
                      </div>
                      <code
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                        }}
                      >
                        {paid.key}
                      </code>
                    </div>
                  </div>
                ) : !canPay ? (
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>
                    Waiting for manager approval above.
                  </div>
                ) : cfg.paypalClientId ? (
                  <div>
                    <div
                      className="sandbox-test-label"
                      style={{ marginBottom: 10 }}
                    >
                      Sandbox test payment, no real money — $
                      {sandboxTestAmount.toFixed(2)}.
                    </div>
                    <div ref={paypalRef} />
                  </div>
                ) : (
                  <button className="btn btn-primary" onClick={simulatePayment}>
                    <Icon name="zap" /> Simulate $1 sandbox test payment — no
                    real money
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LivePaymentDemo({ cfg, onNavigate }) {
  const [events, setEvents] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useSSE((event) => {
    if (event.type !== "hello")
      setEvents((current) => [event, ...current].slice(0, 40));
  });

  useEffect(() => {
    api("/log")
      .then(setEvents)
      .catch((error) => setMessage(error.message));
  }, []);

  const runAgent = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await api("/autopilot/run", { dryRun: true });
      setMessage(
        `${result.processed} policy decision(s) recorded. Dry run: no invoices were sent.`,
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setMessage("");
    try {
      await api("/demo/reset", {});
      setEvents([]);
      setMessage(
        "Demo activity cleared. Seeded sample customers and policies are unchanged.",
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    {
      title: "Buyer approves checkout",
      detail:
        "PayPal sandbox approval and server-side capture issue a licence key.",
      done: events.some(
        (event) =>
          event.type === "payment" ||
          event.action === "PAYMENT.CAPTURE.COMPLETED",
      ),
    },
    {
      title: "PayPal confirms the event",
      detail:
        "A verified webhook is stored once and pushed to connected dashboards.",
      done: events.some((event) => event.type === "webhook"),
    },
    {
      title: "Dashboard reflects activity",
      detail: "The vendor feed updates over the live event stream.",
      done: events.length > 0,
    },
    {
      title: "Agent decision is audited",
      detail:
        "Run the policy-only dry run to record decisions without sending invoices.",
      done: events.some(
        (event) =>
          event.type === "autopilot" ||
          event.action === "Invoice sent" ||
          event.action === "Held",
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Live payment demo</div>
          <div className="page-sub">
            A repeatable walkthrough from sandbox checkout to a policy-audited
            vendor view.
          </div>
        </div>
        <Badge type={cfg.demoMode ? "amber" : "green"}>
          {cfg.demoMode
            ? "Simulation mode — demo data"
            : "PayPal sandbox — test money only"}
        </Badge>
      </div>
      <div className="page-body">
        <div className="grid-2">
          <section className="card">
            <div className="card-title">Demo sequence</div>
            <div className="card-sub">
              Checkout and webhook steps require configured sandbox credentials
              and a reachable webhook URL.
            </div>
            <ol className="demo-steps">
              {steps.map((step, index) => (
                <li key={step.title} className={step.done ? "complete" : ""}>
                  <span className="demo-step-number">
                    {step.done ? <Icon name="check" size={13} /> : index + 1}
                  </span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            {message && (
              <div className="inline-message" role="status">
                {message}
              </div>
            )}
            <div className="flex" style={{ flexWrap: "wrap", marginTop: 16 }}>
              <button
                className="btn btn-primary"
                onClick={() => onNavigate("buyer")}
              >
                <Icon name="shoppingCart" size={14} /> Open checkout
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => onNavigate("vendor")}
              >
                <Icon name="layoutDashboard" size={14} /> Open vendor dashboard
              </button>
              <button
                className="btn btn-secondary"
                onClick={runAgent}
                disabled={busy}
              >
                {busy ? <Spinner /> : <Icon name="play" size={14} />} Run agent
                dry run
              </button>
              <button
                className="btn btn-secondary"
                onClick={reset}
                disabled={busy || !cfg.demoMode}
              >
                <Icon name="refreshCw" size={14} /> Reset demo activity
              </button>
            </div>
            {!cfg.demoMode && (
              <div className="card-sub" style={{ marginTop: 10 }}>
                Reset is disabled in PayPal sandbox mode to preserve payment and
                webhook records.
              </div>
            )}
          </section>
          <section className="card" aria-live="polite">
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <div>
                <div className="card-title">Live event stream</div>
                <div className="card-sub">
                  Newest database-backed events first
                </div>
              </div>
              <Badge type="blue">{events.length} events</Badge>
            </div>
            {events.length === 0 ? (
              <Empty
                icon="zap"
                message="Waiting for checkout, webhook, or agent activity."
              />
            ) : (
              <div className="feed">
                {events.slice(0, 10).map((event, index) => (
                  <div
                    className="feed-item"
                    key={`${event.time || "event"}-${index}`}
                  >
                    <Badge type={event.type === "webhook" ? "green" : "blue"}>
                      {event.action || event.type}
                    </Badge>
                    <div className="feed-meta">
                      {event.company || "LicensePilot"}
                      {event.reason ? ` · ${event.reason}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Vendor Dashboard ─────────────────────────────────────────────────────────
function Vendor({ cfg }) {
  const gridRef = useRef(null);
  const [quickFilter, setQuickFilter] = useState("");
  const [invMsg, setInvMsg] = useState("");
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [assistantError, setAssistantError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invBusy, setInvBusy] = useState(false);
  const [stats, setStats] = useState(null);
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [analytics, setAnalytics] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [renewalPct, setRenewalPct] = useState(30);
  const PAGE_SIZE = 100;

  useEffect(() => {
    setLoading(true);
    api(
      `/customers?page=${page}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(quickFilter)}`,
    )
      .then((d) => {
        setRowData(d.rows);
        setTotal(d.total);
      })
      .finally(() => setLoading(false));
  }, [page, quickFilter]);

  useEffect(() => {
    api("/stats")
      .then(setStats)
      .catch((error) => setInvMsg(error.message));
  }, []);

  const refreshPipeline = useCallback(() => {
    api("/pipeline")
      .then(setPipeline)
      .catch((error) => setInvMsg(error.message));
  }, []);

  useEffect(() => {
    api("/analytics")
      .then(setAnalytics)
      .catch((error) => setInvMsg(error.message));
    api("/policies")
      .then((policies) => {
        const renewalPolicy = policies.find(
          (policy) => policy.key === "renewal_pct",
        );
        if (renewalPolicy) setRenewalPct(Number(renewalPolicy.value));
      })
      .catch((error) => setInvMsg(error.message));
    refreshPipeline();
  }, [refreshPipeline]);

  useSSE((event) => {
    if (event.type === "hello") return;
    refreshPipeline();
    if (["webhook", "payment", "subscription"].includes(event.type)) {
      Promise.all([api("/stats"), api("/analytics")])
        .then(([nextStats, nextAnalytics]) => {
          setStats(nextStats);
          setAnalytics(nextAnalytics);
        })
        .catch((error) => setInvMsg(error.message));
      api(
        `/customers?page=${page}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(quickFilter)}`,
      )
        .then((result) => {
          setRowData(result.rows);
          setTotal(result.total);
        })
        .catch((error) => setInvMsg(error.message));
      if (selectedCustomerId) {
        api(`/customers/${selectedCustomerId}`)
          .then(setSelectedCustomer)
          .catch((error) => setInvMsg(error.message));
      }
    }
  });

  useEffect(() => {
    if (!selectedCustomerId) {
      setSelectedCustomer(null);
      return;
    }
    api(`/customers/${selectedCustomerId}`)
      .then(setSelectedCustomer)
      .catch((error) => setInvMsg(error.message));
  }, [selectedCustomerId]);

  const cols = useMemo(
    () => [
      {
        field: "company",
        flex: 2,
        filter: true,
        checkboxSelection: true,
        headerCheckboxSelection: true,
        headerName: "Company",
      },
      { field: "region", filter: true, width: 140 },
      { field: "plan", filter: true, width: 130 },
      {
        field: "seats",
        type: "numericColumn",
        width: 90,
        headerName: "Seats",
        cellRenderer: (p) => (
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{p.value}</span>
        ),
      },
      {
        field: "devsDetected",
        headerName: "Devs",
        type: "numericColumn",
        width: 90,
        cellStyle: (p) =>
          p.value > p.data.seats
            ? { color: "var(--red)", fontWeight: 700 }
            : null,
        cellRenderer: (p) => (
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {p.value > p.data.seats ? "Over · " : ""}
            {p.value}
          </span>
        ),
      },
      {
        field: "renewalInDays",
        headerName: "Renewal",
        type: "numericColumn",
        width: 110,
        cellRenderer: (p) => {
          const d = p.value;
          if (d < 0) return <Badge type="muted">Expired {-d}d</Badge>;
          if (d <= 7) return <Badge type="red">{d}d</Badge>;
          if (d <= 30) return <Badge type="amber">{d}d</Badge>;
          return <span style={{ color: "var(--muted)" }}>{d}d</span>;
        },
      },
      {
        field: "value",
        headerName: "Value",
        type: "numericColumn",
        width: 110,
        valueFormatter: (p) => money(p.value),
        cellStyle: { fontVariantNumeric: "tabular-nums" },
      },
      {
        field: "balanceDue",
        headerName: "Balance due",
        type: "numericColumn",
        width: 125,
        valueFormatter: (p) => money(p.value),
        cellStyle: { fontVariantNumeric: "tabular-nums" },
      },
      {
        field: "paid",
        width: 100,
        cellRenderer: (p) => (
          <Badge type={p.value ? "green" : "amber"}>
            {p.value ? "Current" : "Unpaid"}
          </Badge>
        ),
      },
    ],
    [],
  );

  const byRegion = useMemo(() => {
    const regions = [
      "North America",
      "Europe",
      "Asia Pacific",
      "Latin America",
    ];
    return regions.map((region) => ({
      region,
      paid:
        analytics.find((entry) => entry.region === region && entry.paid)
          ?.value || 0,
      unpaid:
        analytics.find((entry) => entry.region === region && !entry.paid)
          ?.value || 0,
    }));
  }, [analytics]);

  const chartOptions = useMemo(
    () => ({
      data: byRegion,
      title: {
        text: "Licensed value and outstanding balances by region",
        fontSize: 13,
        fontWeight: 700,
      },
      background: { fill: "transparent" },
      series: [
        {
          type: "bar",
          xKey: "region",
          yKey: "paid",
          yName: "Current",
          stacked: true,
          fill: "#1b7fe0",
        },
        {
          type: "bar",
          xKey: "region",
          yKey: "unpaid",
          yName: "Unpaid",
          stacked: true,
          fill: "#d98a00",
        },
      ],
      axes: [
        { type: "category", position: "bottom", label: { fontSize: 12 } },
        {
          type: "number",
          position: "left",
          label: {
            formatter: (p) => "$" + (p.value / 1000).toFixed(0) + "k",
            fontSize: 11,
          },
        },
      ],
      legend: { position: "top", item: { label: { fontSize: 12 } } },
    }),
    [byRegion],
  );

  const invoiceSelected = async () => {
    const rows = gridRef.current?.api.getSelectedRows().slice(0, 5) || [];
    if (!rows.length) return setInvMsg("Select at least one customer first.");
    setInvBusy(true);
    try {
      for (const c of rows) {
        await api("/invoices", {
          name: `Renewal: ${c.company}`,
          amount: Math.round((c.value * renewalPct) / 100),
          email: c.billingEmail || "billing@customer.example",
          customerId: c.id,
          note: `Estimated renewal (${renewalPct}% of licence value — this is an assumption). Actual price may vary.`,
        });
      }
      setInvMsg(
        `${rows.length} invoice(s) created and sent. Check the Activity tab.`,
      );
      refreshPipeline();
    } catch (error) {
      setInvMsg(error.message);
    } finally {
      setInvBusy(false);
    }
  };

  const askAI = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setAssistantError("");
    try {
      const d = await api("/ask", { question: q });
      setAnswer(
        `${d.ai ? "AI assistant" : "Rules-only assistant"}: ${d.answer}`,
      );
    } catch (error) {
      setAssistantError(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Vendor dashboard</div>
          <div className="page-sub">
            Every customer, seat and renewal in one place.{" "}
            <strong>Demo data.</strong>
          </div>
        </div>
        <div className="flex">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() =>
              gridRef.current?.api.exportDataAsCsv({
                fileName: "licensepilot-customers.csv",
              })
            }
          >
            <Icon name="download" size={13} /> Export CSV
          </button>
        </div>
      </div>

      <div className="page-body">
        <section className="card pipeline-section">
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <div>
              <div className="card-title">Renewal pipeline</div>
              <div className="card-sub">
                Due, invoiced, paid, and held customers. PayPal webhook events
                refresh this board live.
              </div>
            </div>
            <Badge type="muted">{pipeline.length} records</Badge>
          </div>
          <div className="pipeline">
            {[
              ["due", "Due"],
              ["invoiced", "Invoiced"],
              ["paid", "Paid"],
              ["held", "Held"],
            ].map(([status, label]) => {
              const rows = pipeline.filter(
                (customer) => customer.status === status,
              );
              return (
                <div className="pipeline-col" key={status}>
                  <div className="pipeline-col-header">
                    {label}
                    <span className="pipeline-col-count">{rows.length}</span>
                  </div>
                  <div className="pipeline-items">
                    {rows.length === 0 && (
                      <span className="pipeline-empty">No customers</span>
                    )}
                    {rows.slice(0, 8).map((customer) => (
                      <button
                        className="pipeline-card"
                        key={customer.id}
                        onClick={() => setSelectedCustomerId(customer.id)}
                      >
                        <span className="pipeline-card-company">
                          {customer.company}
                        </span>
                        <span className="pipeline-card-meta">
                          <span>
                            {customer.renewalInDays < 0
                              ? `Overdue ${-customer.renewalInDays}d`
                              : `Due in ${customer.renewalInDays}d`}
                          </span>
                          <span>{money(customer.estimatedAmount)} est.</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Stats */}
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Total customers</div>
            <div className="stat-value">
              {stats?.total?.toLocaleString() ?? "—"}
            </div>
          </div>
          <div className="stat-card warn">
            <div className="stat-label">Over seat limit</div>
            <div className="stat-value">{stats?.leakCount ?? "—"}</div>
            <div className="stat-delta">Using more devs than paid seats</div>
          </div>
          <div className="stat-card warn">
            <div className="stat-label">Renewals in 30 days</div>
            <div className="stat-value">{stats?.soonCount ?? "—"}</div>
          </div>
          <div className="stat-card bad">
            <div className="stat-label">Unpaid balance</div>
            <div
              className="stat-value"
              style={{ fontSize: stats?.unpaid > 999999 ? 20 : 28 }}
            >
              {stats ? money(stats.unpaid) : "—"}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="card" style={{ marginBottom: 16, height: 300 }}>
          <AgCharts options={chartOptions} style={{ height: "100%" }} />
        </div>

        {/* AI Q&A */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>
            <Icon
              name="bot"
              size={14}
              style={{ verticalAlign: "middle", marginRight: 6 }}
            />
            Ask the AI assistant
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <input
              className="input"
              placeholder="Which customers are due for renewal this month?"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && askAI()}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={askAI} disabled={busy}>
              {busy ? <Spinner /> : <Icon name="send" size={13} />}
              {busy ? "Thinking…" : "Ask"}
            </button>
          </div>
          {answer && (
            <div
              style={{
                marginTop: 10,
                fontSize: 13,
                color: "var(--ink-2)",
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
              }}
            >
              {answer}
            </div>
          )}
          {assistantError && (
            <div className="form-error" role="alert" style={{ marginTop: 10 }}>
              {assistantError}
            </div>
          )}
        </div>

        {/* Grid */}
        <div className="card">
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <div className="flex" style={{ gap: 8, flex: 1 }}>
              <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
                <Icon
                  name="search"
                  size={14}
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--muted)",
                  }}
                />
                <input
                  className="input"
                  placeholder="Search companies, regions…"
                  value={quickFilter}
                  onChange={(e) => {
                    setQuickFilter(e.target.value);
                    setPage(1);
                  }}
                  style={{ paddingLeft: 32 }}
                />
              </div>
            </div>
            <div className="flex" style={{ gap: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={invoiceSelected}
                disabled={invBusy}
              >
                {invBusy ? <Spinner /> : <Icon name="send" size={13} />}
                Invoice selected (est. {renewalPct}%)
              </button>
            </div>
          </div>
          {invMsg && (
            <div
              style={{
                marginBottom: 10,
                fontSize: 12,
                color: "var(--green)",
                fontWeight: 600,
              }}
            >
              {invMsg}
            </div>
          )}
          <div style={{ height: 520 }}>
            {loading ? (
              <div className="empty">
                <Spinner />
                <span>Loading customers…</span>
              </div>
            ) : (
              <AgGridReact
                ref={gridRef}
                theme={gridTheme}
                rowData={rowData}
                columnDefs={cols}
                rowSelection={{ mode: "multiRow" }}
                onCellClicked={(event) => {
                  if (event.colDef.field === "company")
                    setSelectedCustomerId(event.data.id);
                }}
                suppressMovableColumns
                enableCellTextSelection
              />
            )}
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: "var(--muted)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              Showing {rowData.length} of {total} customers
            </span>
            <div className="flex" style={{ gap: 6 }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Prev
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        </div>

        {/* Attribution */}
        <div className="attribution">
          <strong>Built with</strong>
          <span>AG Grid Community 34</span>
          <span>·</span>
          <span>AG Charts 12</span>
          <span>·</span>
          <span>PayPal Sandbox</span>
          <span>·</span>
          <span>Anthropic Claude</span>
        </div>
      </div>
      {selectedCustomer && (
        <CustomerDrawer
          key={selectedCustomer.id}
          customer={selectedCustomer}
          cfg={cfg}
          onClose={() => setSelectedCustomerId(null)}
        />
      )}
    </div>
  );
}

function CustomerDrawer({ customer, cfg, onClose }) {
  const [autoRenewRequested, setAutoRenewRequested] = useState(
    customer.autoRenewRequested,
  );
  const [subscription, setSubscription] = useState(null);
  const [subscriptionError, setSubscriptionError] = useState("");
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const updateAutoRenew = async (requested) => {
    setSubscriptionError("");
    try {
      const result = await api(
        `/customers/${customer.id}/auto-renew`,
        { requested },
        "PATCH",
      );
      setAutoRenewRequested(result.autoRenewRequested);
      setSubscription(null);
    } catch (error) {
      setSubscriptionError(error.message);
    }
  };

  const createSubscription = async () => {
    setSubscriptionBusy(true);
    setSubscriptionError("");
    try {
      setSubscription(await api("/subscriptions", { customerId: customer.id }));
    } catch (error) {
      setSubscriptionError(error.message);
    } finally {
      setSubscriptionBusy(false);
    }
  };

  const timeline = [
    ...customer.invoices.map((item) => ({
      kind: "Invoice",
      title: item.status,
      date: item.createdAt,
      amount: item.amount,
    })),
    ...customer.orders.map((item) => ({
      kind: "Payment",
      title: item.status,
      date: item.createdAt,
      amount: item.amount,
    })),
    ...customer.subscriptions.map((item) => ({
      kind: "Subscription",
      title: item.status,
      date: item.createdAt,
      amount: item.amount,
    })),
    ...customer.agentDecisions.map((item) => ({
      kind: "Agent decision",
      title: item.action,
      date: item.createdAt,
      amount: JSON.parse(item.inputs || "{}").amount,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside
        className="customer-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-drawer-title"
      >
        <div className="flex-between">
          <div>
            <h2 id="customer-drawer-title">{customer.company}</h2>
            <div className="card-sub">
              {customer.region} · {customer.plan}
            </div>
          </div>
          <button
            className="btn btn-secondary btn-icon"
            onClick={onClose}
            aria-label="Close customer details"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="drawer-metrics">
          <span>
            <strong>{customer.seats}</strong> paid seats
          </span>
          <span>
            <strong>{customer.devsDetected}</strong> detected developers
          </span>
          <span>
            <strong>{customer.renewalInDays}d</strong> until renewal
          </span>
          <span>
            <strong>{money(customer.balanceDue || 0)}</strong> outstanding
          </span>
        </div>
        <section className="subscription-consent">
          <label>
            <input
              type="checkbox"
              checked={autoRenewRequested}
              onChange={(event) => updateAutoRenew(event.target.checked)}
            />
            Customer has requested automatic renewal
          </label>
          <div className="card-sub">
            PayPal charges only after the customer approves the recurring plan.
            Renewal amount is an estimate based on policy, not a vendor quote.
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={createSubscription}
            disabled={!autoRenewRequested || subscriptionBusy}
          >
            {subscriptionBusy ? (
              <Spinner />
            ) : (
              <Icon name="refreshCw" size={13} />
            )}
            {cfg.paypalClientId
              ? "Create sandbox subscription link"
              : "Simulate subscription setup"}
          </button>
          {subscriptionError && (
            <div className="form-error" role="alert">
              {subscriptionError}
            </div>
          )}
          {subscription && (
            <div className="inline-message" role="status">
              {subscription.mock
                ? "Demo subscription setup saved; no recurring charge is active."
                : `Approval required for the $${Number(subscription.amount).toFixed(2)} renewal estimate.`}
              {subscription.approvalUrl && (
                <a
                  className="text-link"
                  href={subscription.approvalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Continue to PayPal to approve
                </a>
              )}
            </div>
          )}
        </section>
        <h3>Invoices, payments and decisions</h3>
        {timeline.length === 0 ? (
          <Empty message="No timeline activity yet." />
        ) : (
          <ol className="timeline">
            {timeline.map((item, index) => (
              <li key={`${item.kind}-${item.date}-${index}`}>
                <span className="timeline-dot" />
                <div>
                  <strong>
                    {item.kind}: {item.title}
                  </strong>
                  <div className="feed-meta">
                    {new Date(item.date).toLocaleString()}
                    {item.amount ? ` · ${money(item.amount)}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}

// ─── Autopilot Screen ─────────────────────────────────────────────────────────
function Autopilot({ cfg }) {
  const [events, setEvents] = useState([]);
  const [dryRun, setDryRun] = useState(false);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState("");
  const [logFilter, setLogFilter] = useState("all");
  const [logSearch, setLogSearch] = useState("");

  useSSE((e) => {
    if (e.type !== "hello") setEvents((p) => [e, ...p].slice(0, 80));
  });

  useEffect(() => {
    api("/log")
      .then(setEvents)
      .catch((error) => setRunError(error.message));
  }, []);

  const run = useCallback(async () => {
    setBusy(true);
    setRunError("");
    try {
      await api("/autopilot/run", { dryRun });
    } catch (error) {
      setRunError(error.message);
    } finally {
      setBusy(false);
    }
  }, [dryRun]);

  const sent = events.filter((e) => e.action === "Invoice sent");
  const held = events.filter((e) => e.action === "Held");
  const skipped = events.filter((e) => e.action === "Skipped");
  const webhooks = events.filter((e) => e.type === "webhook");
  const visibleEvents = events.filter((event) => {
    const typeMatches = logFilter === "all" || event.type === logFilter;
    const text =
      `${event.action || ""} ${event.company || ""} ${event.reason || ""}`.toLowerCase();
    return typeMatches && text.includes(logSearch.toLowerCase());
  });

  const exportLog = () => {
    const columns = ["time", "type", "company", "action", "amount", "reason"];
    const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      columns.join(","),
      ...visibleEvents.map((event) =>
        columns.map((column) => quote(event[column])).join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "licensepilot-audit-log.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const badgeFor = (action) => {
    if (!action) return "muted";
    if (action === "Invoice sent") return "green";
    if (action === "Held") return "amber";
    if (action === "Skipped" || action === "Escalated") return "red";
    if (
      action.includes("COMPLETED") ||
      action.includes("PAID") ||
      action.includes("Payment")
    )
      return "green";
    return "blue";
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Renewal autopilot</div>
          <div className="page-sub">
            The agent reviews eligible renewals and acts within your policy
            rules. Every decision is audited.
          </div>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          {!cfg.aiEnabled && (
            <Badge type="amber">
              <Icon name="alertTriangle" size={11} /> Rules-only (no AI key)
            </Badge>
          )}
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stat-grid">
          <div className="stat-card good">
            <div className="stat-label">Invoices sent</div>
            <div className="stat-value">{sent.length}</div>
            <div className="stat-delta">
              {money(sent.reduce((s, e) => s + (e.amount || 0), 0))} total
            </div>
          </div>
          <div className="stat-card warn">
            <div className="stat-label">Held for human</div>
            <div className="stat-value">{held.length}</div>
            <div className="stat-delta">Over limit or seat gap</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Skipped / escalated</div>
            <div className="stat-value">{skipped.length}</div>
            <div className="stat-delta">Unpaid balance or excluded</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Webhook events</div>
            <div className="stat-value">{webhooks.length}</div>
            <div className="stat-delta">From PayPal in real-time</div>
          </div>
        </div>

        <div className="grid-2">
          {/* Controls */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Policy controls</div>
                <div className="card-sub">
                  These rules are enforced in code — the AI cannot override them
                </div>
              </div>
              <Icon name="lock" size={16} style={{ color: "var(--muted)" }} />
            </div>

            <div className="policy-summary">
              Auto-invoice limits are managed in{" "}
              <strong>Policy settings</strong>. Renewals above the saved limit
              are held for human review.
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 14,
                padding: "10px 12px",
                background: "var(--surface-2)",
                borderRadius: 8,
              }}
            >
              <input
                type="checkbox"
                id="dryrun"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <label
                htmlFor="dryrun"
                style={{ fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Dry run (simulate without creating invoices)
              </label>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 16,
                flexWrap: "wrap",
              }}
            >
              <button className="btn btn-primary" onClick={run} disabled={busy}>
                {busy ? <Spinner /> : <Icon name="play" size={13} />}
                {busy ? "Running…" : "Run now"}
              </button>
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    await api("/autopilot/reset", {});
                    setEvents([]);
                    setRunError("");
                  } catch (error) {
                    setRunError(error.message);
                  }
                }}
              >
                <Icon name="refreshCw" size={13} /> Reset
              </button>
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    await api("/demo/reset", {});
                    setEvents([]);
                    setRunError("");
                  } catch (error) {
                    setRunError(error.message);
                  }
                }}
              >
                <Icon name="refreshCw" size={13} /> Reset demo data
              </button>
            </div>
            <div className="hint" style={{ marginTop: 12 }}>
              The production scheduler runs daily at 09:00 UTC. “Run now”
              processes up to five eligible customers.
            </div>
            {runError && (
              <div
                className="form-error"
                role="alert"
                style={{ marginTop: 12 }}
              >
                {runError}
              </div>
            )}

            {/* Policy guardrails summary */}
            <div style={{ marginTop: 20 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--muted)",
                  marginBottom: 8,
                }}
              >
                Hard policy guardrails
              </div>
              {[
                ["Unpaid balance", "Skip — escalate to sales"],
                ["Amount > limit", "Hold for human review"],
                ["Devs > paid seats", "Hold — sales top-up needed"],
                ["Excluded region", "Skip"],
                ["AI risk flag", "Hold for human review"],
              ].map(([rule, action]) => (
                <div
                  key={rule}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    borderBottom: "1px solid var(--border)",
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "var(--ink-2)" }}>{rule}</span>
                  <span style={{ color: "var(--muted)" }}>{action}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Live feed */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Live activity</div>
                <div className="card-sub">
                  Agent decisions and PayPal webhook events in real-time
                </div>
              </div>
              <div className="flex" style={{ gap: 4, alignItems: "center" }}>
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "var(--green)",
                    boxShadow: "0 0 0 3px rgba(26,154,107,.2)",
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--green)",
                    fontWeight: 600,
                  }}
                >
                  Live
                </span>
              </div>
            </div>
            <div className="audit-controls">
              <input
                className="input"
                aria-label="Filter audit events"
                placeholder="Search events…"
                value={logSearch}
                onChange={(event) => setLogSearch(event.target.value)}
              />
              <select
                className="select"
                aria-label="Filter by event type"
                value={logFilter}
                onChange={(event) => setLogFilter(event.target.value)}
              >
                <option value="all">All activity</option>
                <option value="autopilot">Agent decisions</option>
                <option value="webhook">PayPal webhooks</option>
                <option value="payment">Checkout payments</option>
              </select>
              <button className="btn btn-secondary btn-sm" onClick={exportLog}>
                <Icon name="download" size={13} /> Export CSV
              </button>
            </div>
            <div className="feed">
              {visibleEvents.length === 0 && (
                <Empty
                  icon="zap"
                  message={
                    events.length === 0
                      ? "No activity yet. Run the autopilot."
                      : "No events match these filters."
                  }
                />
              )}
              {visibleEvents.map((e, i) => (
                <div key={i} className="feed-item">
                  <Badge type={badgeFor(e.action)}>{e.action || e.type}</Badge>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="feed-company"
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "baseline",
                      }}
                    >
                      {e.company}
                      {e.amount && (
                        <span
                          className="feed-amount"
                          style={{
                            fontWeight: 400,
                            color: "var(--muted)",
                            fontSize: 12,
                          }}
                        >
                          {money(e.amount)}
                        </span>
                      )}
                      {e.dryRun && (
                        <Badge type="muted" style={{ fontSize: 10 }}>
                          dry run
                        </Badge>
                      )}
                      {e.mock && (
                        <Badge type="muted" style={{ fontSize: 10 }}>
                          demo
                        </Badge>
                      )}
                    </div>
                    <div className="feed-meta">
                      {e.reason}
                      {e.invoiceId ? ` · ${e.invoiceId}` : ""}
                    </div>
                    {e.approvalUrl && (
                      <a
                        className="text-link"
                        href={e.approvalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Approve recurring renewal
                      </a>
                    )}
                  </div>
                  <span className="feed-time">{relTime(e.time)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Compliance Scan Screen ───────────────────────────────────────────────────
function ComplianceScan() {
  const [pkgText, setPkgText] = useState("");
  const [results, setResults] = useState(null);
  const [licences, setLicences] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/licences")
      .then(setLicences)
      .catch((e) => setError(e.message));
  }, []);

  const scan = (content = pkgText) => {
    try {
      setError("");
      let deps = {};
      try {
        const lock = JSON.parse(content);
        if (lock.packages) {
          deps = Object.fromEntries(
            Object.keys(lock.packages)
              .filter((name) => name.startsWith("node_modules/"))
              .map((name) => [name.slice("node_modules/".length), true]),
          );
        } else if (
          lock.dependencies ||
          lock.devDependencies ||
          lock.peerDependencies
        ) {
          deps = {
            ...lock.dependencies,
            ...lock.devDependencies,
            ...lock.peerDependencies,
          };
        } else throw new Error("No package dependency list was found.");
      } catch {
        const entries = content.matchAll(
          /^\s{0,2}("?)(@[^/\s]+\/[^@\s]+|[a-zA-Z0-9._/-]+)@\S+("?):?\s*$/gm,
        );
        deps = Object.fromEntries(
          [...entries].map((match) => [match[2], true]),
        );
        if (!Object.keys(deps).length)
          throw new Error("Unrecognized package or lock file.");
      }
      if (!deps || typeof deps !== "object" || Array.isArray(deps)) {
        throw new Error(
          "The selected file does not contain a dependency list.",
        );
      }
      const paidPkgs = [
        { pkg: "ag-grid-enterprise", product: "AG Grid Enterprise" },
        { pkg: "ag-charts-enterprise", product: "AG Charts Enterprise" },
      ];
      const detected = paidPkgs
        .filter((p) => deps[p.pkg])
        .map((product) => ({
          ...product,
          owned: licences.some((licence) =>
            licence.product
              .toLowerCase()
              .includes(product.pkg.startsWith("ag-grid") ? "grid" : "charts"),
          ),
        }));
      setResults({ detected, totalPackages: Object.keys(deps).length });
    } catch (scanError) {
      setResults(null);
      setError(
        scanError.message || "Could not read the selected dependency file.",
      );
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Compliance scan</div>
          <div className="page-sub">
            Upload a package.json to detect paid packages and check for licence
            gaps.
          </div>
        </div>
      </div>
      <div className="page-body">
        <div className="grid-2">
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>
              Paste package.json
            </div>
            <textarea
              className="textarea"
              style={{ minHeight: 200 }}
              value={pkgText}
              onChange={(e) => setPkgText(e.target.value)}
              placeholder='{ "dependencies": { "ag-grid-enterprise": "^34.0.0" } }'
            />
            <label
              className="label"
              htmlFor="lock-file"
              style={{ marginTop: 12 }}
            >
              Or upload package.json / lock file
            </label>
            <input
              id="lock-file"
              className="input file-input"
              type="file"
              accept=".json,.lock,yarn.lock,pnpm-lock.yaml,package-lock.json"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const content = await file.text();
                setPkgText(content);
                scan(content);
              }}
            />
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button
              className="btn btn-primary"
              style={{ marginTop: 12 }}
              onClick={scan}
              disabled={!pkgText.trim()}
            >
              <Icon name="search" /> Scan for paid packages
            </button>
          </div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>
              Scan results
            </div>
            {!results && (
              <Empty
                icon="fileSearch"
                message="Paste a package.json and scan."
              />
            )}
            {results && (
              <div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--muted)",
                    marginBottom: 12,
                  }}
                >
                  Scanned {results.totalPackages} packages
                </div>
                {results.detected.length === 0 ? (
                  <div style={{ color: "var(--green)", fontWeight: 600 }}>
                    No paid enterprise packages found.
                  </div>
                ) : (
                  results.detected.map((p) => (
                    <div
                      key={p.pkg}
                      style={{
                        padding: "12px 0",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{p.product}</div>
                      <code style={{ fontSize: 12, color: "var(--muted)" }}>
                        {p.pkg}
                      </code>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          color: p.owned ? "var(--green)" : "var(--amber)",
                        }}
                      >
                        {p.owned ? (
                          <strong>Matching licence record found.</strong>
                        ) : (
                          <strong>
                            No matching owned licence record found.
                          </strong>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {results.detected.length > 0 && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: "10px 12px",
                      background: "var(--amber-bg)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--amber)",
                    }}
                  >
                    <strong>Note:</strong> This scan checks seeded/demo licence
                    records. Ask the vendor for applicable pricing and contract
                    terms. This independent prototype is not affiliated with AG
                    Grid.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Policy Editor ────────────────────────────────────────────────────────────
function PolicyEditor() {
  const [policies, setPolicies] = useState([]);
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});

  useEffect(() => {
    api("/policies")
      .then(setPolicies)
      .catch(() => {});
  }, []);

  const save = async (key, value) => {
    setSaving((p) => ({ ...p, [key]: true }));
    try {
      await api(`/policies/${key}`, { value }, "PATCH");
      setSaved((p) => ({ ...p, [key]: true }));
      setTimeout(() => setSaved((p) => ({ ...p, [key]: false })), 2000);
    } finally {
      setSaving((p) => ({ ...p, [key]: false }));
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Policy settings</div>
          <div className="page-sub">
            Configure autopilot limits and rules. These are hard gates — the AI
            cannot exceed them.
          </div>
        </div>
      </div>
      <div className="page-body">
        <div className="card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
              padding: "10px 12px",
              background: "rgba(27,127,224,.06)",
              border: "1px solid rgba(27,127,224,.15)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--blue)",
            }}
          >
            <Icon name="lock" size={14} />
            Policy changes take effect on the next autopilot run. The policy
            engine is code-enforced and tested.
          </div>
          {policies.length === 0 && <Empty message="Loading policies…" />}
          {policies.map((p) => (
            <PolicyRow
              key={p.key}
              policy={p}
              onSave={save}
              saving={saving[p.key]}
              saved={saved[p.key]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PolicyRow({ policy, onSave, saving, saved }) {
  const [val, setVal] = useState(policy.value);
  return (
    <div className="policy-row">
      <div className="policy-label">
        <div className="policy-name">{policy.label}</div>
        {policy.description && (
          <div className="policy-desc">{policy.description}</div>
        )}
      </div>
      <input
        className="input policy-input"
        value={val}
        onChange={(e) => setVal(e.target.value)}
      />
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => onSave(policy.key, val)}
        disabled={saving}
      >
        {saving ? (
          <Spinner />
        ) : saved ? (
          <>
            <Icon name="check" size={12} /> Saved
          </>
        ) : (
          "Save"
        )}
      </button>
    </div>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────
const VIEWS = [
  { id: "buyer", label: "Buy a licence", icon: "shoppingCart" },
  { id: "live", label: "Live payment demo", icon: "play" },
  { id: "vendor", label: "Vendor dashboard", icon: "layoutDashboard" },
  { id: "autopilot", label: "Renewal autopilot", icon: "bot" },
  { id: "compliance", label: "Compliance scan", icon: "fileSearch" },
  { id: "policies", label: "Policy settings", icon: "settings" },
];

function CommandPalette({ open, onClose, onSelect }) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  if (!open) return null;

  const choices = VIEWS.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div
      className="command-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <input
          className="input"
          autoFocus
          aria-label="Search navigation"
          placeholder="Go to a screen…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "Enter" && choices[0]) onSelect(choices[0].id);
          }}
        />
        <div className="command-list">
          {choices.map((item) => (
            <button
              className="command-option"
              key={item.id}
              onClick={() => onSelect(item.id)}
            >
              <Icon name={item.icon} size={16} /> {item.label}
            </button>
          ))}
          {choices.length === 0 && <Empty message="No matching screens." />}
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("buyer");
  const [cfg, setCfg] = useState({
    paypalClientId: null,
    paypalWebhookConfigured: false,
    aiEnabled: false,
    demoMode: true,
  });
  const [theme, setTheme] = useState(
    () => localStorage.getItem("lp-theme") || "light",
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [configError, setConfigError] = useState("");

  useEffect(() => {
    api("/config")
      .then(setCfg)
      .catch((error) => setConfigError(error.message));
  }, []);

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("lp-theme", theme);
  }, [theme]);

  const renderView = () => {
    switch (view) {
      case "buyer":
        return <Buyer cfg={cfg} />;
      case "live":
        return <LivePaymentDemo cfg={cfg} onNavigate={setView} />;
      case "vendor":
        return <Vendor cfg={cfg} />;
      case "autopilot":
        return <Autopilot cfg={cfg} />;
      case "compliance":
        return <ComplianceScan />;
      case "policies":
        return <PolicyEditor />;
      default:
        return null;
    }
  };

  return (
    <div className="app">
      <button
        className="mobile-menu"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label={menuOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={menuOpen}
        aria-controls="main-navigation"
      >
        <Icon name={menuOpen ? "close" : "menu"} size={18} />
      </button>
      {menuOpen && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMenuOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <aside
        id="main-navigation"
        className={`sidebar ${menuOpen ? "open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="sidebar-brand">
          <Logo size={28} />
          LicensePilot
        </div>

        <div className="sidebar-section">Platform</div>
        <nav className="sidebar-nav">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={`nav-btn ${view === v.id ? "active" : ""}`}
              onClick={() => {
                setView(v.id);
                setMenuOpen(false);
              }}
              aria-current={view === v.id ? "page" : undefined}
            >
              <Icon name={v.icon} className="icon" />
              {v.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div>
            <div className={`mode-badge ${cfg.demoMode ? "demo" : "sandbox"}`}>
              <Icon name={cfg.demoMode ? "alertTriangle" : "check"} size={12} />
              {cfg.demoMode ? "Demo mode" : "PayPal Sandbox"}
            </div>
            <div>
              AI: {cfg.aiEnabled ? "Anthropic Claude" : "Rules-only fallback"}
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <button
              className="theme-btn"
              onClick={() =>
                setTheme((t) => (t === "light" ? "dark" : "light"))
              }
              aria-label="Toggle theme"
            >
              <Icon name={theme === "light" ? "moon" : "sun"} size={14} />
            </button>
          </div>
          <div style={{ marginTop: 12, lineHeight: 1.7 }}>
            <div>
              <strong>Built with</strong>
            </div>
            <div>AG Grid Community 34</div>
            <div>AG Charts 12</div>
            <div>PayPal Sandbox API</div>
            <div style={{ marginTop: 8, fontSize: 10, color: "#3a566e" }}>
              Independent project. Not affiliated with or endorsed by AG Grid or
              PayPal. All payments use sandbox test money only.
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        {cfg.demoMode && (
          <div className="sandbox-bar">
            <Icon name="alertTriangle" size={13} />
            Demo mode — no real PayPal credentials. Add PAYPAL_CLIENT_ID and
            PAYPAL_CLIENT_SECRET to .env for live sandbox payments.
          </div>
        )}
        {!cfg.demoMode && (
          <div
            className="sandbox-bar"
            style={{
              background: "rgba(26,154,107,.06)",
              borderColor: "rgba(26,154,107,.2)",
              color: "var(--green)",
            }}
          >
            <Icon name="check" size={13} />
            PayPal sandbox mode — all transactions use test money only. No real
            payments are processed.
          </div>
        )}
        {configError && (
          <div className="form-error" role="alert" style={{ margin: 12 }}>
            {configError}
          </div>
        )}
        {renderView()}
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={(nextView) => {
          setView(nextView);
          setPaletteOpen(false);
        }}
      />
    </div>
  );
}
