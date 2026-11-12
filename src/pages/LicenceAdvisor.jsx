// src/pages/LicenceAdvisor.jsx — "Which licence do I need?" plus "Check a project".
//
// The suggestion logic runs in the browser (no server call needed).
// Payment goes through the server: POST /api/orders, then /api/orders/:id/capture.

import { useEffect, useMemo, useRef, useState } from "react";
import { api, findPaidPackages } from "../lib/api.js";
import {
  DecisionTag,
  Empty,
  Icon,
  PageHeader,
  Spinner,
  Step,
} from "../components/ui.jsx";

const PRICING_URL = "https://www.ag-grid.com/license-pricing/";
const TEST_AMOUNT = 1; // PayPal sandbox test charge. NOT a licence price.

export default function LicenceAdvisor({ cfg }) {
  const [tab, setTab] = useState("buy");
  return (
    <div className="page">
      <PageHeader title="Licence Advisor">
        Paste a project's package.json and find out which AG Grid licence it
        needs. Small internal teams can buy straight away; everyone else is
        pointed to sales.
      </PageHeader>

      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "buy"}
          className={`tab ${tab === "buy" ? "is-active" : ""}`}
          onClick={() => setTab("buy")}
        >
          Get a licence
        </button>
        <button
          role="tab"
          aria-selected={tab === "check"}
          className={`tab ${tab === "check" ? "is-active" : ""}`}
          onClick={() => setTab("check")}
        >
          Check an existing project
        </button>
      </div>

      {tab === "buy" ? <BuyFlow cfg={cfg} /> : <ProjectCheck />}
    </div>
  );
}

// ─── Tab 1: work out the licence, check the policy, then pay ────────────────
function BuyFlow({ cfg }) {
  const [pkg, setPkg] = useState(
    '{\n  "dependencies": {\n    "ag-grid-enterprise": "^34.0.0",\n    "ag-charts-enterprise": "^12.0.0"\n  }\n}',
  );
  const [devs, setDevs] = useState(6);
  const [audience, setAudience] = useState("internal");
  const [spendLimit, setSpendLimit] = useState(8000);
  const [paid, setPaid] = useState(null);
  const [managerApproved, setManagerApproved] = useState(false);
  const [explain, setExplain] = useState(null);
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState("");
  const paypalRef = useRef(null);

  // Step 2: the suggestion, following AG Grid's published rules
  // (ag-grid.com/license-pricing, checked Nov 2026): online purchase covers
  // 1–10 developers on internal apps; customer-facing apps or bigger teams
  // go through sales; every front-end developer on the project counts.
  const rec = useMemo(() => {
    let detected;
    try {
      detected = findPaidPackages(pkg).detected.map((p) => p.pkg);
    } catch (error) {
      return { route: "unreadable", why: error.message };
    }
    const grid = detected.includes("ag-grid-enterprise");
    const charts = detected.includes("ag-charts-enterprise");
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
            ? "Apps used by outside customers are quoted by the sales team."
            : "Teams of more than 10 developers are quoted by the sales team.",
      };
    }
    return { route: "online", product, total: TEST_AMOUNT };
  }, [pkg, devs, audience]);

  // Step 3: the policy. Over the limit means a manager must approve.
  const buyable = rec.route === "online";
  const needsApproval = buyable && rec.total > spendLimit;
  const canPay = buyable && (!needsApproval || managerApproved);

  const reset = () => {
    setPaid(null);
    setManagerApproved(false);
    setExplain(null);
    setPayError("");
  };

  // Draw the real PayPal button (sandbox) once the buyer is allowed to pay.
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
            color: "black",
            shape: "rect",
            label: "pay",
            height: 44,
            tagline: false,
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
              "PayPal couldn't finish the payment. Please try again.",
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
        setPayError("The PayPal button couldn't load. Check your connection.");
      document.body.appendChild(s);
    }
    return () => {
      alive = false;
    };
  }, [cfg.paypalClientId, canPay, paid, rec.total, rec.product, devs]);

  const askExplain = async () => {
    setBusy(true);
    try {
      setExplain(
        await api("/explain", {
          product: rec.product,
          devs,
          audience,
          route: rec.route,
          sandboxTestAmount: TEST_AMOUNT,
        }),
      );
    } catch (error) {
      setPayError(error.message);
    } finally {
      setBusy(false);
    }
  };

  // Without PayPal keys, record a simulated payment instead.
  const simulatePayment = async () => {
    setPayError("");
    try {
      const order = await api("/orders", {
        amount: TEST_AMOUNT,
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

  return (
    <div className="steps">
      <Step
        number={1}
        title="Your project"
        explain="Copy the package.json from your project folder and paste it below."
      >
        <label className="field">
          <span className="label">package.json</span>
          <textarea
            id="pkg"
            className="input code"
            rows={7}
            value={pkg}
            onChange={(e) => {
              setPkg(e.target.value);
              reset();
            }}
            spellCheck={false}
          />
        </label>
        <div className="field-pair">
          <label className="field">
            <span className="label">Front-end developers</span>
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
            <span className="help">
              Everyone who works on the app's screens, not only people who use
              the grid.
            </span>
          </label>
          <label className="field">
            <span className="label">Who uses the app?</span>
            <select
              id="audience"
              className="input"
              value={audience}
              onChange={(e) => {
                setAudience(e.target.value);
                reset();
              }}
            >
              <option value="internal">Only our own staff</option>
              <option value="external">Our customers (outside users)</option>
            </select>
          </label>
        </div>
      </Step>

      <Step
        number={2}
        title="What you need"
        explain="Worked out from the packages in your file."
        tag={<DecisionTag kind="suggestion" />}
      >
        {rec.route === "unreadable" && (
          <div className="result result-warn">
            <p className="result-title">We can't read that file yet</p>
            <p>{rec.why}</p>
          </div>
        )}
        {rec.route === "free" && (
          <div className="result result-ok">
            <p className="result-title">
              Community edition — no licence needed
            </p>
            <p>
              The project doesn't use ag-grid-enterprise or
              ag-charts-enterprise, so the free edition covers it.
            </p>
          </div>
        )}
        {rec.route === "sales" && (
          <div className="result">
            <p className="result-title">{rec.product}</p>
            <p>
              Talk to AG Grid's sales team (sales-assisted). {rec.why}{" "}
              <a
                className="link"
                href={PRICING_URL}
                target="_blank"
                rel="noreferrer"
              >
                AG Grid pricing
              </a>
            </p>
          </div>
        )}
        {buyable && (
          <div className="result">
            <p className="result-title">
              {rec.product}, {devs} developer{devs > 1 ? "s" : ""}
            </p>
            <p>
              Available to buy online. AG Grid sets the real price —{" "}
              <a
                className="link"
                href={PRICING_URL}
                target="_blank"
                rel="noreferrer"
              >
                see pricing
              </a>
              .
            </p>
          </div>
        )}
        {(buyable || rec.route === "sales") && (
          <div className="explain">
            <button className="btn btn-sm" onClick={askExplain} disabled={busy}>
              {busy ? <Spinner /> : <Icon name="message" size={14} />}
              {busy ? "Thinking…" : "Why this licence?"}
            </button>
            {explain && (
              <div className="explain-text">
                <DecisionTag kind={explain.ai ? "ai" : "rules"} />
                <p>{explain.text}</p>
              </div>
            )}
          </div>
        )}
        <p className="fine">
          Based on AG Grid's published licensing rules (checked November 2026).
          Prices and final terms come from AG Grid.
        </p>
      </Step>

      <Step
        number={3}
        title="Spending policy"
        explain="Checked by the app's code. The AI can't change or skip it."
        tag={<DecisionTag kind="policy" />}
        disabled={!buyable}
      >
        {!buyable ? (
          <p className="muted">
            Nothing to check — there's nothing to buy online.
          </p>
        ) : (
          <>
            <label className="field field-narrow">
              <span className="label">Buy without approval up to</span>
              <span className="input-prefix">
                <span>$</span>
                <input
                  id="limit"
                  type="number"
                  min="0"
                  className="input"
                  value={spendLimit}
                  onChange={(e) => setSpendLimit(Number(e.target.value) || 0)}
                />
              </span>
            </label>
            {needsApproval && !managerApproved ? (
              <div className="result result-warn">
                <p className="result-title">Manager approval needed</p>
                <p>This is over your limit, so a manager has to sign off.</p>
                <button
                  className="btn btn-primary"
                  onClick={() => setManagerApproved(true)}
                >
                  <Icon name="check" size={15} /> Approve as manager
                </button>
              </div>
            ) : (
              <div className="result result-ok">
                <p className="result-title">
                  {needsApproval
                    ? "Approved by a manager"
                    : "Within your limit — no approval needed"}
                </p>
              </div>
            )}
          </>
        )}
      </Step>

      <Step
        number={4}
        title="Pay"
        explain="Nothing is charged until you press the button. This is a $1.00 sandbox test payment, not the licence price."
        tag={<DecisionTag kind="approval" />}
        disabled={!canPay && !paid}
      >
        {payError && (
          <div className="notice notice-bad" role="alert">
            {payError}
          </div>
        )}
        {paid ? (
          <div className="result result-ok">
            <p className="result-title">Payment complete. Your licence key:</p>
            <code className="licence-key">{paid.key}</code>
            <p className="fine">Sandbox test payment, no real money</p>
          </div>
        ) : !buyable ? (
          <p className="muted">Nothing to pay for.</p>
        ) : !canPay ? (
          <p className="muted">Waiting for manager approval in step 3.</p>
        ) : cfg.paypalClientId ? (
          <div className="paypal">
            <p className="fine" style={{ marginTop: 0 }}>
              Sandbox test payment, no real money — ${TEST_AMOUNT.toFixed(2)}.
              Sign in with a PayPal sandbox buyer account.
            </p>
            <div ref={paypalRef} />
          </div>
        ) : (
          <button className="btn btn-primary btn-lg" onClick={simulatePayment}>
            Simulate $1 sandbox test payment — no real money
          </button>
        )}
      </Step>
    </div>
  );
}

// ─── Tab 2: compare a project with the licences on record ───────────────────
function ProjectCheck() {
  const [text, setText] = useState("");
  const [results, setResults] = useState(null);
  const [licences, setLicences] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/licences")
      .then(setLicences)
      .catch((e) => setError(e.message));
  }, []);

  const check = (content = text) => {
    try {
      setError("");
      const { total, detected } = findPaidPackages(content);
      setResults({
        total,
        detected: detected.map((p) => ({
          ...p,
          owned: licences.some((l) =>
            l.product
              .toLowerCase()
              .includes(p.pkg.startsWith("ag-grid") ? "grid" : "charts"),
          ),
        })),
      });
    } catch (e) {
      setResults(null);
      setError(e.message || "We couldn't read that file.");
    }
  };

  return (
    <div className="steps">
      <Step
        number={1}
        title="Project file"
        explain="Paste a package.json, or upload package.json, package-lock.json, yarn.lock or pnpm-lock.yaml."
      >
        <textarea
          className="input code"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Project file"
          placeholder='{ "dependencies": { "ag-grid-enterprise": "^34.0.0" } }'
        />
        <div className="row-actions">
          <button
            className="btn btn-primary"
            onClick={() => check()}
            disabled={!text.trim()}
          >
            Check project
          </button>
          <label className="btn file-btn">
            <Icon name="fileSearch" size={15} /> Upload a file
            <input
              type="file"
              accept=".json,.lock,.yaml,yarn.lock,pnpm-lock.yaml,package-lock.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const content = await file.text();
                setText(content);
                check(content);
              }}
            />
          </label>
        </div>
        {error && (
          <div className="notice notice-bad" role="alert">
            {error}
          </div>
        )}
      </Step>

      <Step
        number={2}
        title="Result"
        explain="Which paid packages the project uses, and whether a licence is on record."
      >
        {!results ? (
          <Empty message="Results appear here after you check a file." />
        ) : results.detected.length === 0 ? (
          <div className="result result-ok">
            <p className="result-title">No paid packages</p>
            <p>All {results.total} packages are free to use.</p>
          </div>
        ) : (
          <>
            <p className="muted">Checked {results.total} packages.</p>
            {results.detected.map((p) => (
              <div
                key={p.pkg}
                className={`result ${p.owned ? "result-ok" : "result-warn"}`}
              >
                <p className="result-title">{p.product}</p>
                <p>
                  <code>{p.pkg}</code> —{" "}
                  {p.owned
                    ? "a licence is on record."
                    : "no licence on record. One may be needed."}
                </p>
              </div>
            ))}
            <p className="fine">
              Compared against this demo's sample licence records only.
            </p>
          </>
        )}
      </Step>
    </div>
  );
}
