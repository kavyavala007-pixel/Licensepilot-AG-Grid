// src/pages/Payments.jsx — every payment, bill and auto-renewal in one table.
//
// GET /api/payments reads the Order, Invoice and Subscription tables.
// Rows with mock = true were simulated because PayPal keys were missing.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { api, money, useLiveEvents } from "../lib/api.js";
import {
  Badge,
  Empty,
  Eyebrow,
  Icon,
  MoneyLabel,
  PageHeader,
  Spinner,
  gridTheme,
} from "../components/ui.jsx";

// PayPal status codes → plain words.
const STATUS = {
  CREATED: ["Started", "muted"],
  APPROVED: ["Approved by buyer", "info"],
  COMPLETED: ["Paid", "ok"],
  FAILED: ["Failed", "bad"],
  SENT: ["Bill sent", "warn"],
  PAID: ["Paid", "ok"],
  CANCELLED: ["Cancelled", "muted"],
  PENDING: ["Awaiting customer", "warn"],
  ACTIVE: ["Active", "ok"],
  SUSPENDED: ["Paused", "warn"],
  EXPIRED: ["Ended", "muted"],
  PAYMENT_FAILED: ["Payment failed", "bad"],
};

export default function Payments({ cfg, onNavigate }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    return api("/payments")
      .then(setRows)
      .catch((e) => setNotice({ tone: "bad", text: e.message }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useLiveEvents((e) => {
    if (["payment", "invoice", "subscription", "webhook"].includes(e.type))
      load();
  });

  const columns = useMemo(
    () => [
      {
        field: "time",
        headerName: "Date",
        width: 175,
        sort: "desc",
        cellClass: "cell-num",
        valueFormatter: (p) =>
          new Date(p.value).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
      },
      { field: "kind", headerName: "Type", width: 135, filter: true },
      {
        field: "company",
        headerName: "Customer",
        flex: 1,
        minWidth: 160,
        filter: true,
        cellClass: "cell-strong",
      },
      {
        field: "description",
        headerName: "Description",
        flex: 1,
        minWidth: 180,
      },
      {
        field: "amount",
        headerName: "Amount",
        type: "numericColumn",
        width: 110,
        cellClass: "cell-num",
        valueFormatter: (p) => money(p.value),
      },
      {
        field: "status",
        headerName: "Status",
        width: 165,
        cellRenderer: (p) => {
          const [text, tone] = STATUS[p.value] || [p.value, "muted"];
          return <Badge type={tone}>{text}</Badge>;
        },
      },
      {
        field: "mock",
        headerName: "Source",
        width: 150,
        cellRenderer: (p) => <MoneyLabel mock={p.value} />,
      },
    ],
    [],
  );

  const practiceRun = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await api("/autopilot/run", { dryRun: true });
      setNotice({
        tone: "ok",
        text: `Practice run finished: ${r.processed} customers checked, no bills sent.`,
      });
    } catch (e) {
      setNotice({ tone: "bad", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const resetDemo = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await api("/demo/reset", {});
      setNotice({
        tone: "",
        text: "Demo activity cleared. Sample customers and rules are unchanged.",
      });
      load();
    } catch (e) {
      setNotice({ tone: "bad", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const collected = rows
    .filter((r) => ["COMPLETED", "PAID"].includes(r.status))
    .reduce((sum, r) => sum + (r.amount || 0), 0);
  const waiting = rows.filter((r) =>
    ["SENT", "PENDING", "CREATED", "APPROVED"].includes(r.status),
  ).length;

  return (
    <div className="page page-wide">
      <PageHeader title="Payments">
        Checkouts, renewal bills and automatic renewals, newest first. Every
        payment here uses PayPal's sandbox, so no real money moves.
      </PageHeader>

      <div className="env">
        <EnvLine
          ok={!cfg.demoMode}
          label="PayPal"
          text={
            cfg.demoMode
              ? "Not connected. Payments are simulated and saved locally."
              : "Connected to the sandbox (test accounts and test money)."
          }
        />
        {!cfg.demoMode && (
          <EnvLine
            ok={cfg.paypalWebhookConfigured}
            label="Payment updates"
            text={
              cfg.paypalWebhookConfigured ? (
                "PayPal tells the app when a bill is paid."
              ) : (
                <>
                  Off. Bills stay “Bill sent” here even after they're paid. Set{" "}
                  <code>PAYPAL_WEBHOOK_ID</code> in <code>.env</code> — see
                  SETUP.md.
                </>
              )
            }
          />
        )}
      </div>

      <div className="figures figures-tight">
        <div className="figure">
          <div className="figure-label">Records</div>
          <div className="figure-value">{rows.length}</div>
        </div>
        <div className="figure">
          <div className="figure-label">Collected (test money)</div>
          <div className="figure-value">{money(collected)}</div>
        </div>
        <div className="figure warn">
          <div className="figure-label">Waiting on the customer</div>
          <div className="figure-value">{waiting}</div>
        </div>
      </div>

      {notice && (
        <div className={`notice notice-${notice.tone}`} role="status">
          {notice.text}
        </div>
      )}

      <div className="grid-frame" style={{ height: 440 }}>
        {loading ? (
          <div className="empty">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <Empty message="No payments yet.">
            <button className="btn" onClick={() => onNavigate("advisor")}>
              Make a test purchase
            </button>
          </Empty>
        ) : (
          <AgGridReact
            theme={gridTheme}
            rowData={rows}
            columnDefs={columns}
            suppressMovableColumns
            enableCellTextSelection
          />
        )}
      </div>

      <section className="block">
        <Eyebrow>Walk through a test purchase</Eyebrow>
        <ol className="walkthrough">
          <li>
            <strong>Buy a licence</strong> on the Licence Advisor page with the
            $1.00 sandbox payment.
          </li>
          <li>
            <strong>Find it in the table above.</strong> It appears as soon as
            PayPal confirms it.
          </li>
          <li>
            <strong>Run a practice renewal.</strong> Each decision is logged in
            Activity History.
          </li>
        </ol>
        <div className="row-actions">
          <button
            className="btn btn-primary"
            onClick={() => onNavigate("advisor")}
          >
            <Icon name="shoppingCart" size={15} /> Buy a licence
          </button>
          <button className="btn" onClick={practiceRun} disabled={busy}>
            {busy ? <Spinner /> : <Icon name="play" size={15} />} Practice
            renewal run
          </button>
          <button className="btn" onClick={() => onNavigate("activity")}>
            Activity History
          </button>
          {cfg.demoMode && (
            <button
              className="btn btn-quiet"
              onClick={resetDemo}
              disabled={busy}
            >
              Clear demo activity
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function EnvLine({ ok, label, text }) {
  return (
    <div className="env-line">
      <span className={`dot ${ok ? "seg-ok" : "seg-warn"}`} />
      <span className="env-label">{label}</span>
      <span className="muted">{text}</span>
    </div>
  );
}
