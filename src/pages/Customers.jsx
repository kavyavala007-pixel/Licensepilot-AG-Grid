// src/pages/Customers.jsx — the customer list, built with AG Grid.
// Data: GET /api/customers (100 rows per page) and GET /api/customers/:id.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { api, money, useLiveEvents } from "../lib/api.js";
import {
  Badge,
  Empty,
  Icon,
  PageHeader,
  Spinner,
  gridTheme,
} from "../components/ui.jsx";

const PAGE_SIZE = 100;

export default function Customers({ cfg }) {
  const gridRef = useRef(null);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(0);
  const [renewalPct, setRenewalPct] = useState(30);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);

  const loadRows = useCallback(() => {
    return api(
      `/customers?page=${page}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(search)}`,
    ).then((d) => {
      setRows(d.rows);
      setTotal(d.total);
    });
  }, [page, search]);

  useEffect(() => {
    setLoading(true);
    loadRows()
      .catch((e) => setMessage({ tone: "bad", text: e.message }))
      .finally(() => setLoading(false));
  }, [loadRows]);

  useEffect(() => {
    api("/policies")
      .then((policies) => {
        const pct = policies.find((p) => p.key === "renewal_pct");
        if (pct) setRenewalPct(Number(pct.value));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    api(`/customers/${selectedId}`)
      .then(setSelected)
      .catch((e) => setMessage({ tone: "bad", text: e.message }));
  }, [selectedId]);

  // When PayPal reports a change, refresh what's on screen.
  useLiveEvents((event) => {
    if (
      ["webhook", "payment", "subscription", "invoice"].includes(event.type)
    ) {
      loadRows().catch(() => {});
      if (selectedId) api(`/customers/${selectedId}`).then(setSelected);
    }
  });

  const columns = useMemo(
    () => [
      {
        field: "company",
        headerName: "Company",
        flex: 2,
        minWidth: 200,
        filter: true,
        cellClass: "cell-strong",
      },
      { field: "region", headerName: "Region", filter: true, width: 140 },
      { field: "plan", headerName: "Licence", filter: true, width: 130 },
      {
        field: "seats",
        headerName: "Seats",
        type: "numericColumn",
        width: 95,
        cellClass: "cell-num",
      },
      {
        field: "devsDetected",
        headerName: "Developers",
        type: "numericColumn",
        width: 130,
        cellClass: "cell-num",
        cellRenderer: (p) =>
          p.value > p.data.seats ? (
            <span className="over">
              {p.value} <small>+{p.value - p.data.seats}</small>
            </span>
          ) : (
            p.value
          ),
      },
      {
        field: "renewalInDays",
        headerName: "Renews",
        width: 130,
        cellRenderer: (p) => {
          const d = p.value;
          if (d < 0) return <Badge type="muted">Ended {-d}d ago</Badge>;
          if (d <= 30) return <Badge type="warn">In {d} days</Badge>;
          return <span className="muted">In {d} days</span>;
        },
      },
      {
        field: "value",
        headerName: "Value",
        type: "numericColumn",
        width: 120,
        cellClass: "cell-num",
        valueFormatter: (p) => money(p.value),
      },
      {
        field: "paid",
        headerName: "Account",
        width: 120,
        cellRenderer: (p) =>
          p.value ? (
            <Badge type="ok">Paid up</Badge>
          ) : (
            <Badge type="bad">Unpaid</Badge>
          ),
      },
    ],
    [],
  );

  // A person ticks customers and presses the button. The app never does this alone.
  const billSelected = async () => {
    const chosen = gridRef.current?.api.getSelectedRows().slice(0, 5) || [];
    if (!chosen.length) return;
    setBusy(true);
    setMessage(null);
    try {
      for (const c of chosen) {
        await api("/invoices", {
          name: `Renewal: ${c.company}`,
          amount: Math.round((c.value * renewalPct) / 100),
          email: c.billingEmail || "billing@customer.example",
          customerId: c.id,
          note: `Estimated renewal (${renewalPct}% of licence value — this is an assumption). Actual price may vary.`,
        });
      }
      setMessage({
        tone: "ok",
        text: `${chosen.length} renewal bill${chosen.length > 1 ? "s" : ""} sent. They're listed on the Payments page.`,
      });
    } catch (e) {
      setMessage({ tone: "bad", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page-wide">
      <PageHeader
        title="Customers"
        actions={
          <button
            className="btn"
            onClick={() =>
              gridRef.current?.api.exportDataAsCsv({
                fileName: "licensepilot-customers.csv",
              })
            }
          >
            <Icon name="download" size={15} /> Export CSV
          </button>
        }
      >
        Every company with a licence. Click a name to see its seats, bills and
        payment history. All companies are sample data.
      </PageHeader>

      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={15} />
          <input
            placeholder="Search company or region"
            aria-label="Search customers"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <div className="toolbar-right">
          <span className="muted small">
            {picked
              ? `${picked} selected`
              : "Tick customers to bill them (up to 5)"}
          </span>
          <button
            className="btn btn-primary"
            onClick={billSelected}
            disabled={busy || picked === 0}
          >
            {busy ? <Spinner /> : <Icon name="send" size={15} />}
            Send renewal bill
          </button>
        </div>
      </div>
      {message && (
        <div className={`notice notice-${message.tone}`} role="status">
          {message.text}
        </div>
      )}

      <div className="grid-frame" style={{ height: 600 }}>
        {loading ? (
          <div className="empty">
            <Spinner />
          </div>
        ) : (
          <AgGridReact
            ref={gridRef}
            theme={gridTheme}
            rowData={rows}
            columnDefs={columns}
            rowSelection={{ mode: "multiRow" }}
            onSelectionChanged={(e) =>
              setPicked(e.api.getSelectedRows().length)
            }
            onCellClicked={(e) => {
              if (e.colDef.field === "company") setSelectedId(e.data.id);
            }}
            suppressMovableColumns
            enableCellTextSelection
          />
        )}
      </div>
      <div className="pager">
        <span className="muted small">
          {total
            ? `${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + rows.length} of ${total.toLocaleString()}`
            : ""}
          {" · "}Bills are estimated at {renewalPct}% of licence value
        </span>
        <div className="pager-btns">
          <button
            className="btn btn-sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <button
            className="btn btn-sm"
            disabled={page * PAGE_SIZE >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>

      {selected && (
        <CustomerPanel
          key={selected.id}
          customer={selected}
          cfg={cfg}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// The panel that slides in when you click a company.
function CustomerPanel({ customer, cfg, onClose }) {
  const [autoRenew, setAutoRenew] = useState(customer.autoRenewRequested);
  const [subscription, setSubscription] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const updateAutoRenew = async (requested) => {
    setError("");
    try {
      const result = await api(
        `/customers/${customer.id}/auto-renew`,
        { requested },
        "PATCH",
      );
      setAutoRenew(result.autoRenewRequested);
      setSubscription(null);
    } catch (e) {
      setError(e.message);
    }
  };

  const createSubscription = async () => {
    setBusy(true);
    setError("");
    try {
      setSubscription(await api("/subscriptions", { customerId: customer.id }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const history = [
    ...customer.invoices.map((i) => ({
      what: "Renewal bill",
      status: i.status,
      date: i.createdAt,
      amount: i.amount,
    })),
    ...customer.orders.map((o) => ({
      what: "Checkout",
      status: o.status,
      date: o.createdAt,
      amount: o.amount,
    })),
    ...customer.subscriptions.map((s) => ({
      what: "Auto-renewal",
      status: s.status,
      date: s.createdAt,
      amount: s.amount,
    })),
    ...customer.agentDecisions.map((d) => ({
      what: "Autopilot",
      status: d.action,
      date: d.createdAt,
      amount: JSON.parse(d.inputs || "{}").amount,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const extra = customer.devsDetected - customer.seats;

  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-title"
      >
        <div className="drawer-head">
          <div>
            <h2 id="customer-title">{customer.company}</h2>
            <p className="muted">
              {customer.region} · {customer.plan}
            </p>
          </div>
          <button className="btn btn-icon" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>

        <dl className="facts">
          <div>
            <dt>Seats paid for</dt>
            <dd>{customer.seats}</dd>
          </div>
          <div className={extra > 0 ? "is-bad" : ""}>
            <dt>Developers</dt>
            <dd>{customer.devsDetected}</dd>
          </div>
          <div>
            <dt>
              {customer.renewalInDays < 0 ? "Licence ended" : "Renews in"}
            </dt>
            <dd>
              {customer.renewalInDays < 0
                ? `${-customer.renewalInDays} days ago`
                : `${customer.renewalInDays} days`}
            </dd>
          </div>
          <div className={customer.balanceDue ? "is-bad" : ""}>
            <dt>Owed</dt>
            <dd>{money(customer.balanceDue || 0)}</dd>
          </div>
        </dl>
        {extra > 0 && (
          <div className="notice notice-warn">
            {extra} more developer{extra > 1 ? "s" : ""} than seats. The
            autopilot won't renew this account automatically. Sales should offer
            extra seats instead.
          </div>
        )}

        <section className="drawer-section">
          <h3>Automatic yearly renewal</h3>
          <p className="muted small">
            Only turn this on if the customer asked for it. PayPal takes nothing
            until the customer approves on PayPal's own page.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={autoRenew}
              onChange={(e) => updateAutoRenew(e.target.checked)}
            />
            Customer asked for automatic renewal
          </label>
          <button
            className="btn btn-sm"
            onClick={createSubscription}
            disabled={!autoRenew || busy}
          >
            {busy ? <Spinner /> : <Icon name="repeat" size={14} />}
            {cfg.paypalClientId
              ? "Create PayPal approval link"
              : "Set up (simulated)"}
          </button>
          {error && (
            <div className="notice notice-bad" role="alert">
              {error}
            </div>
          )}
          {subscription && (
            <div className="notice" role="status">
              {subscription.mock
                ? "Simulated set-up saved. No money will be taken."
                : `Waiting for the customer to approve $${Number(subscription.amount).toFixed(2)} a year on PayPal.`}{" "}
              {subscription.approvalUrl && (
                <a
                  className="link"
                  href={subscription.approvalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open approval page
                </a>
              )}
            </div>
          )}
        </section>

        <section className="drawer-section">
          <h3>History</h3>
          {history.length === 0 ? (
            <Empty message="No bills, payments or decisions yet." />
          ) : (
            <ol className="history">
              {history.map((item, i) => (
                <li key={`${item.date}-${i}`}>
                  <div>
                    <span className="row-title">{item.what}</span>{" "}
                    <span className="muted">· {item.status}</span>
                  </div>
                  <div className="muted small">
                    {new Date(item.date).toLocaleString()}
                    {item.amount ? ` · ${money(item.amount)}` : ""}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}
