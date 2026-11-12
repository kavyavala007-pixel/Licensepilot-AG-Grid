// src/pages/Renewals.jsx — the renewal autopilot and its policy rules.
//
// "Run now" calls POST /api/autopilot/run. On the server, server/policy.js
// checks every customer FIRST. Only if all rules pass does the AI (or the
// rule-based fallback) send a bill. Editable limits live in the database
// (Policy table) and are saved with PATCH /api/policies/:key.

import { useCallback, useEffect, useState } from "react";
import { api, money, relTime, useLiveEvents } from "../lib/api.js";
import {
  Badge,
  DecisionTag,
  Empty,
  Eyebrow,
  Icon,
  PageHeader,
  Spinner,
} from "../components/ui.jsx";

// Plain names for the settings stored in the Policy table.
const SETTING_TEXT = {
  auto_invoice_limit: {
    name: "Largest bill sent without a person",
    help: "Anything bigger waits for review.",
    unit: "$",
  },
  renewal_pct: {
    name: "Renewal estimate",
    help: "Percent of the licence value. An estimate, not AG Grid's price.",
    unit: "%",
  },
  renewal_window_days: {
    name: "Look-ahead",
    help: "Only customers renewing within this many days are checked.",
    unit: "days",
  },
  max_devs_online: {
    name: "Largest team that can buy online",
    help: "Bigger teams are sent to sales.",
    unit: "devs",
  },
  excluded_regions: {
    name: "Regions to skip",
    help: "Never billed automatically. Separate names with commas, e.g. Europe, Asia Pacific.",
    unit: "",
  },
};

// The fixed rules in server/policy.js, in plain words.
const FIXED_RULES = [
  ["The customer still owes money", "Skip and tell sales"],
  ["The bill is over the limit", "Wait for a person"],
  ["More developers than seats", "Wait for sales to offer seats"],
  ["The region is on the skip list", "Skip"],
  ["The bill would be $0 or less", "Skip"],
];

// Turn the server's action names into plain words.
export function describeAction(action = "", type) {
  if (type === "webhook") return { text: `PayPal: ${action}`, tone: "info" };
  if (action === "Invoice sent") return { text: "Bill sent", tone: "ok" };
  if (action.startsWith("Dry run"))
    return { text: "Would send bill", tone: "info" };
  if (action === "Held") return { text: "Waiting for a person", tone: "warn" };
  if (action === "Skipped") return { text: "Skipped", tone: "bad" };
  if (action === "Escalated") return { text: "Sent to sales", tone: "bad" };
  return { text: action || type, tone: "muted" };
}

export default function Renewals({ cfg }) {
  const [events, setEvents] = useState([]);
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const loadLog = useCallback(() => {
    api("/log")
      .then(setEvents)
      .catch((e) => setNotice({ tone: "bad", text: e.message }));
  }, []);

  useEffect(() => {
    loadLog();
  }, [loadLog]);
  useLiveEvents((e) => {
    if (e.type !== "hello")
      setEvents((list) =>
        [{ time: new Date().toISOString(), ...e }, ...list].slice(0, 80),
      );
  });

  const run = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await api("/autopilot/run", { dryRun });
      const n = r.processed ?? 0;
      setNotice({
        tone: "ok",
        text: dryRun
          ? `Practice run finished. ${n} customer${n === 1 ? "" : "s"} checked, no bills sent.`
          : `Run finished. ${n} customer${n === 1 ? "" : "s"} checked.`,
      });
    } catch (e) {
      setNotice({ tone: "bad", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const clearResults = async () => {
    try {
      await api("/autopilot/reset", {});
      setEvents((list) => list.filter((e) => e.type !== "autopilot"));
      setNotice({ tone: "", text: "Autopilot results cleared." });
    } catch (e) {
      setNotice({ tone: "bad", text: e.message });
    }
  };

  const decisions = events.filter((e) => e.type === "autopilot");
  const count = (fn) => decisions.filter((e) => fn(e.action || "")).length;

  return (
    <div className="page">
      <PageHeader title="Renewals">
        AG Grid licences are perpetual and include one year of support and
        updates; renewing keeps that going. The autopilot finds customers who
        are due and sends their renewal bill, but only when every policy rule
        below allows it. Anything unusual waits for a person.
      </PageHeader>

      <section className="panel run-panel">
        <div className="run-copy">
          <div className="step-head">
            <h2 className="step-title">Run the autopilot</h2>
            <DecisionTag kind={cfg.aiEnabled ? "ai" : "rules"} />
          </div>
          <p className="step-explain">
            Checks up to five customers who are due. It also runs on its own
            every day at 09:00 UTC.
            {!cfg.aiEnabled &&
              " The AI is off, so decisions use fixed rules only."}
          </p>
          <label className="check" htmlFor="dryrun">
            <input
              type="checkbox"
              id="dryrun"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
            />
            <span>
              Practice run (dry run) — show what would happen without sending
              bills
            </span>
          </label>
          {!dryRun && (
            <p className="notice notice-warn">
              Practice run is off. Real PayPal sandbox invoices will be sent to
              test email addresses.
            </p>
          )}
        </div>
        <div className="run-actions">
          <button
            className="btn btn-primary btn-lg"
            onClick={run}
            disabled={busy}
          >
            {busy ? <Spinner /> : <Icon name="play" size={15} />}
            {busy ? "Running…" : "Run now"}
          </button>
          <button className="btn btn-sm btn-quiet" onClick={clearResults}>
            Clear results
          </button>
        </div>
      </section>
      {notice && (
        <div className={`notice notice-${notice.tone}`} role="status">
          {notice.text}
        </div>
      )}

      <div className="figures figures-tight">
        <Tally label="Bills sent" value={count((a) => a === "Invoice sent")} />
        <Tally
          label="Would send (practice)"
          value={count((a) => a.startsWith("Dry run"))}
        />
        <Tally
          label="Waiting for a person"
          value={count((a) => a === "Held")}
          tone="warn"
        />
        <Tally
          label="Skipped"
          value={count((a) => a === "Skipped" || a === "Escalated")}
          tone="bad"
        />
      </div>

      <section className="block">
        <Eyebrow>Latest decisions</Eyebrow>
        {decisions.length === 0 ? (
          <Empty message="No decisions yet. Press Run now to start." />
        ) : (
          <ul className="rows">
            {decisions.slice(0, 8).map((e, i) => {
              const d = describeAction(e.action, e.type);
              return (
                <li key={i}>
                  <div className="row-main">
                    <span className="row-title">
                      {e.company}{" "}
                      {e.dryRun && <Badge type="muted">dry run</Badge>}{" "}
                      {e.mock && <Badge type="warn">simulated</Badge>}
                    </span>
                    <span className="row-sub">{e.reason}</span>
                    {e.approvalUrl && (
                      <a
                        className="link small"
                        href={e.approvalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Customer's approval link
                      </a>
                    )}
                  </div>
                  {e.amount ? (
                    <span className="num muted">{money(e.amount)}</span>
                  ) : (
                    <span />
                  )}
                  <div className="row-end">
                    <Badge type={d.tone}>{d.text}</Badge>
                    {e.time && (
                      <span className="muted small">{relTime(e.time)}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <PolicyRules />
    </div>
  );
}

function Tally({ label, value, tone = "" }) {
  return (
    <div className={`figure ${tone}`}>
      <div className="figure-label">{label}</div>
      <div className="figure-value">{value}</div>
    </div>
  );
}

// ─── Policy controls ────────────────────────────────────────────────────────
function PolicyRules() {
  const [policies, setPolicies] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/policies")
      .then(setPolicies)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <section className="block">
      <Eyebrow right={<DecisionTag kind="policy" />}>Policy controls</Eyebrow>
      <p className="muted" style={{ marginBottom: 14 }}>
        These rules are written in the app's code (server/policy.js) and run
        before the AI is asked anything. The AI can't skip or change them.
      </p>

      <table className="rules">
        <thead>
          <tr>
            <th>If…</th>
            <th>Then</th>
          </tr>
        </thead>
        <tbody>
          {FIXED_RULES.map(([when, then]) => (
            <tr key={when}>
              <td>{when}</td>
              <td className="muted">{then}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="sub-head">Limits you can change</h3>
      <p className="muted small">Saved changes apply on the next run.</p>
      {error && (
        <div className="notice notice-bad" role="alert">
          {error}
        </div>
      )}
      {policies.length === 0 && !error && <Empty message="Loading…" />}
      <div className="settings">
        {policies.map((p) => (
          <SettingRow key={p.key} policy={p} />
        ))}
      </div>
    </section>
  );
}

// The region list is stored as JSON (["Europe"]) but typed as plain text.
const isList = (key) => key === "excluded_regions";
const toText = (key, stored) => {
  if (!isList(key)) return stored;
  try {
    return JSON.parse(stored).join(", ");
  } catch {
    return stored;
  }
};
const toStored = (key, text) =>
  isList(key)
    ? JSON.stringify(
        text
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      )
    : text;

function SettingRow({ policy }) {
  const [value, setValue] = useState(toText(policy.key, policy.value));
  const [savedValue, setSavedValue] = useState(value);
  const [state, setState] = useState("idle"); // idle | saving | saved
  const [error, setError] = useState("");
  const text = SETTING_TEXT[policy.key] || {
    name: policy.label,
    help: policy.description,
    unit: "",
  };
  const changed = value !== savedValue;

  const save = async () => {
    setState("saving");
    setError("");
    try {
      await api(
        `/policies/${policy.key}`,
        { value: toStored(policy.key, value) },
        "PATCH",
      );
      setSavedValue(value);
      setState("saved");
      setTimeout(() => setState("idle"), 2000);
    } catch (e) {
      setError(e.message);
      setState("idle");
    }
  };

  return (
    <div className="setting">
      <div className="setting-text">
        <div className="row-title">{text.name}</div>
        <div className="muted small">{text.help}</div>
        {error && <div className="error small">{error}</div>}
      </div>
      <span className="input-prefix">
        {text.unit && <span>{text.unit}</span>}
        <input
          className="input"
          aria-label={text.name}
          placeholder={isList(policy.key) ? "None" : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </span>
      <button
        className="btn btn-sm"
        onClick={save}
        disabled={state === "saving" || (!changed && state !== "saved")}
      >
        {state === "saving" ? (
          <Spinner />
        ) : state === "saved" ? (
          <>
            <Icon name="check" size={13} /> Saved
          </>
        ) : (
          "Save"
        )}
      </button>
    </div>
  );
}
