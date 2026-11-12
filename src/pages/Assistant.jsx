// src/pages/Assistant.jsx — ask questions about the customers in plain English.
//
// POST /api/ask. The server counts things in the database, then either asks
// Anthropic's Claude (if ANTHROPIC_API_KEY is set) or answers with fixed
// rules. Either way it only READS data; it can't send bills.

import { useState } from "react";
import { api } from "../lib/api.js";
import { DecisionTag, Icon, PageHeader, Spinner } from "../components/ui.jsx";

const EXAMPLES = [
  "Which customers renew this month?",
  "Who still owes us money?",
  "Who has more developers than seats?",
  "Summarise the account base",
];

export default function Assistant({ cfg }) {
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ask = async (text = question) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const d = await api("/ask", { question: text });
      setChat((list) => [
        { question: text, answer: d.answer, ai: d.ai },
        ...list,
      ]);
      setQuestion("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page-narrow">
      <PageHeader title="AI Assistant">
        Ask about your customers in everyday words. The assistant can read the
        customer list, but it can't send bills, change rules or move money.
      </PageHeader>

      {!cfg.aiEnabled && (
        <div className="notice notice-warn">
          The AI is switched off, so answers come from fixed rules and only
          cover renewals, unpaid accounts and seat counts. To turn it on, add{" "}
          <code>ANTHROPIC_API_KEY</code> to <code>.env</code> and restart.
        </div>
      )}

      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <input
          className="input input-lg"
          aria-label="Your question"
          placeholder="Ask a question…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? <Spinner /> : <Icon name="send" size={15} />}
          {busy ? "Thinking…" : "Ask"}
        </button>
      </form>
      <div className="suggestions">
        <span className="muted small">Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            className="link-btn"
            onClick={() => ask(ex)}
            disabled={busy}
          >
            {ex}
          </button>
        ))}
      </div>
      {error && (
        <div className="notice notice-bad" role="alert">
          {error}
        </div>
      )}

      <div className="thread">
        {chat.map((item, i) => (
          <article key={i} className="exchange">
            <p className="exchange-q">{item.question}</p>
            <div className="exchange-a">
              <DecisionTag kind={item.ai ? "ai" : "rules"} />
              <p>{item.answer}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
