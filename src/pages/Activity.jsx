// src/pages/Activity.jsx — the audit log: everything that happened, and why.
//
// GET /api/log returns autopilot decisions (AgentDecision table) and PayPal
// updates (PaymentEvent table). New events arrive live over /api/events.

import { useEffect, useState } from "react";
import { api, downloadCsv, money, relTime, useLiveEvents } from "../lib/api.js";
import { Badge, Empty, Icon, PageHeader } from "../components/ui.jsx";
import { describeAction } from "./Renewals.jsx";

const FILTERS = [
  ["all", "All"],
  ["autopilot", "Autopilot"],
  ["webhook", "PayPal"],
  ["payment", "Checkouts"],
  ["invoice", "Bills"],
  ["subscription", "Auto-renewals"],
];

export default function Activity() {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/log")
      .then(setEvents)
      .catch((e) => setError(e.message));
  }, []);

  useLiveEvents((e) => {
    if (e.type !== "hello" && e.type !== "system")
      setEvents((list) =>
        [{ time: new Date().toISOString(), ...e }, ...list].slice(0, 200),
      );
  });

  const visible = events.filter((e) => {
    const text =
      `${e.action || ""} ${e.company || ""} ${e.reason || ""}`.toLowerCase();
    return (
      (filter === "all" || e.type === filter) &&
      text.includes(search.toLowerCase())
    );
  });

  return (
    <div className="page">
      <PageHeader
        title="Activity History"
        actions={
          <button
            className="btn"
            onClick={() =>
              downloadCsv("licensepilot-activity.csv", visible, [
                "time",
                "type",
                "company",
                "action",
                "amount",
                "reason",
              ])
            }
          >
            <Icon name="download" size={15} /> Export CSV
          </button>
        }
      >
        Every autopilot decision and PayPal update, with the reason behind it.
        Nothing is edited or removed, so it doubles as an audit trail.
      </PageHeader>

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Filter activity">
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "is-active" : ""}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search">
          <Icon name="search" size={15} />
          <input
            aria-label="Search activity"
            placeholder="Search company or reason"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {error && (
        <div className="notice notice-bad" role="alert">
          {error}
        </div>
      )}

      {visible.length === 0 ? (
        <Empty
          message={
            events.length === 0
              ? "Nothing has happened yet. A practice run on the Renewals page will add entries here."
              : "No entries match."
          }
        />
      ) : (
        <ol className="log">
          {visible.map((e, i) => {
            const d =
              e.type === "autopilot" || e.type === "webhook"
                ? describeAction(e.action, e.type)
                : { text: e.action || e.type, tone: "info" };
            return (
              <li key={i}>
                <time className="log-time">
                  {e.time ? relTime(e.time) : ""}
                </time>
                <div className="log-body">
                  <div className="log-line">
                    <Badge type={d.tone}>{d.text}</Badge>
                    <span className="row-title">
                      {e.company || "LicensePilot"}
                    </span>
                    {e.amount ? (
                      <span className="num muted">{money(e.amount)}</span>
                    ) : null}
                    {e.dryRun && <Badge type="muted">dry run</Badge>}
                    {e.mock && <Badge type="warn">simulated</Badge>}
                  </div>
                  {e.reason && <p className="log-reason">{e.reason}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
