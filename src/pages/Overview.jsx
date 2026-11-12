// src/pages/Overview.jsx — the home page.
// Data comes from three server routes: /api/stats, /api/pipeline, /api/analytics.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AgCharts } from "ag-charts-react";
import { api, money, useLiveEvents } from "../lib/api.js";
import { Badge, Empty, Eyebrow, Icon, PageHeader } from "../components/ui.jsx";

// Renewal stages, in the order a renewal moves through them.
const STAGES = [
  { id: "due", label: "Not billed yet", tone: "muted" },
  { id: "invoiced", label: "Bill sent", tone: "info" },
  { id: "paid", label: "Paid", tone: "ok" },
  { id: "held", label: "Needs a person", tone: "warn" },
];

const today = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export default function Overview({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [pipeline, setPipeline] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    Promise.all([api("/stats"), api("/pipeline"), api("/analytics")])
      .then(([nextStats, nextPipeline, nextAnalytics]) => {
        setStats(nextStats);
        setPipeline(nextPipeline);
        setAnalytics(nextAnalytics);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useLiveEvents((event) => event.type !== "hello" && load());

  const upcoming = pipeline.filter((row) => row.renewalInDays >= 0);
  const upcomingValue = upcoming.reduce(
    (sum, row) => sum + (row.estimatedAmount || 0),
    0,
  );
  const stageCount = (id) => pipeline.filter((r) => r.status === id).length;

  // Customers a person should look at first: held by the rules, then soonest.
  const attention = [...pipeline]
    .filter((r) => r.status === "held" || r.status === "due")
    .sort(
      (a, b) =>
        (a.status === "held" ? -1 : 0) - (b.status === "held" ? -1 : 0) ||
        a.renewalInDays - b.renewalInDays,
    )
    .slice(0, 6);

  const chartOptions = useMemo(() => {
    const regions = [...new Set(analytics.map((e) => e.region))];
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--ink").trim() || "#16181d";
    const muted = css.getPropertyValue("--muted").trim() || "#7b808a";
    const signal = css.getPropertyValue("--signal").trim() || "#d9512c";
    return {
      data: regions.map((region) => ({
        region,
        paid: analytics.find((e) => e.region === region && e.paid)?.value || 0,
        unpaid:
          analytics.find((e) => e.region === region && !e.paid)?.value || 0,
      })),
      background: { visible: false },
      padding: { top: 8, right: 12, bottom: 0, left: 12 },
      series: [
        {
          type: "bar",
          direction: "horizontal",
          xKey: "region",
          yKey: "paid",
          yName: "Paid up",
          stacked: true,
          fill: ink,
          cornerRadius: 2,
        },
        {
          type: "bar",
          direction: "horizontal",
          xKey: "region",
          yKey: "unpaid",
          yName: "Still owed",
          stacked: true,
          fill: signal,
          cornerRadius: 2,
        },
      ],
      axes: [
        {
          type: "category",
          position: "left",
          label: { color: muted, fontFamily: "IBM Plex Sans", fontSize: 13 },
          line: { enabled: false },
        },
        {
          type: "number",
          position: "bottom",
          label: {
            color: muted,
            fontFamily: "IBM Plex Mono",
            fontSize: 11,
            formatter: (p) => "$" + (p.value / 1_000_000).toFixed(1) + "M",
          },
          gridLine: { style: [{ stroke: "rgba(127,127,127,.15)" }] },
        },
      ],
      legend: {
        position: "top",
        item: {
          label: { color: muted, fontFamily: "IBM Plex Sans", fontSize: 13 },
          marker: { shape: "square", size: 10 },
        },
      },
    };
  }, [analytics]);

  return (
    <div className="page">
      <PageHeader title="Overview">{today}</PageHeader>

      {error && (
        <div className="notice notice-bad" role="alert">
          {error}
        </div>
      )}

      <p className="summary">
        {stats ? (
          <>
            <strong>{upcoming.length}</strong> licences renew in the next 30
            days, worth about <strong>{money(upcomingValue)}</strong>.{" "}
            <strong>{stats.leakCount}</strong> customers have more developers
            than seats
            {stats.unpaid > 0 ? (
              <>
                , and <strong>{money(stats.unpaid)}</strong> is still unpaid.
              </>
            ) : (
              ", and no balances are overdue."
            )}
          </>
        ) : (
          "Loading the latest numbers…"
        )}
      </p>

      <div className="figures">
        <Figure label="Customers" value={stats?.total?.toLocaleString()} />
        <Figure
          label="Over their seat count"
          value={stats?.leakCount}
          note="Sales should offer more seats"
          tone="warn"
        />
        <Figure
          label="Renewing within 30 days"
          value={stats?.soonCount}
          note="Their year of support and updates ends"
        />
        <Figure
          label="Unpaid"
          value={stats ? money(stats.unpaid) : undefined}
          note="Across all customers"
          tone={stats?.unpaid > 0 ? "bad" : ""}
        />
      </div>

      <section className="block">
        <Eyebrow
          right={
            <button className="link-btn" onClick={() => onNavigate("renewals")}>
              Open renewals <Icon name="arrowRight" size={14} />
            </button>
          }
        >
          Renewals · next 30 days
        </Eyebrow>
        <div className="stage-bar" aria-hidden="true">
          {STAGES.map((s) => (
            <span
              key={s.id}
              className={`stage-seg seg-${s.tone}`}
              style={{ flexGrow: stageCount(s.id) || 0 }}
            />
          ))}
        </div>
        <ul className="stage-legend">
          {STAGES.map((s) => (
            <li key={s.id}>
              <span className={`dot seg-${s.tone}`} />
              <span className="stage-name">{s.label}</span>
              <span className="num">{stageCount(s.id)}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="split">
        <section className="block">
          <Eyebrow
            right={
              <button
                className="link-btn"
                onClick={() => onNavigate("customers")}
              >
                All customers <Icon name="arrowRight" size={14} />
              </button>
            }
          >
            Needs attention
          </Eyebrow>
          {attention.length === 0 ? (
            <Empty message="Nothing needs attention right now." />
          ) : (
            <ul className="rows">
              {attention.map((row) => (
                <li key={row.id}>
                  <div className="row-main">
                    <span className="row-title">{row.company}</span>
                    <span className="row-sub">
                      {row.status === "held"
                        ? "Stopped by a policy rule. Check before billing."
                        : row.renewalInDays < 0
                          ? `Licence ended ${-row.renewalInDays} days ago`
                          : `Renews in ${row.renewalInDays} days`}
                    </span>
                  </div>
                  <span className="num muted">
                    {money(row.estimatedAmount)}
                  </span>
                  <Badge type={row.status === "held" ? "warn" : "muted"}>
                    {row.status === "held" ? "Needs a person" : "Not billed"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="block">
          <Eyebrow>Licence value by region</Eyebrow>
          <div style={{ height: 260 }}>
            <AgCharts options={chartOptions} style={{ height: "100%" }} />
          </div>
          <p className="fine">Sample data · AG Charts</p>
        </section>
      </div>
    </div>
  );
}

function Figure({ label, value, note, tone = "" }) {
  return (
    <div className={`figure ${tone}`}>
      <div className="figure-label">{label}</div>
      <div className="figure-value">{value ?? "—"}</div>
      {note && <div className="figure-note">{note}</div>}
    </div>
  );
}
