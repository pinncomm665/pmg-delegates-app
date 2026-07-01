"use client";

import { useEffect, useState } from "react";

type Msg = {
  date: string | null;
  subject: string | null;
  from: string | null;
  to: string | null;
  snippet: string | null;
  inbox: string | null;
  direction: "inbound" | "outbound";
};

function fmt(d: string | null) {
  if (!d) return "";
  const t = new Date(d);
  if (isNaN(t.getTime())) return d;
  return t.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function EmailHistory({ email }: { email: string | null }) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; reason: string }
    | { kind: "ok"; messages: Msg[] }
  >({ kind: "loading" });

  useEffect(() => {
    if (!email) {
      setState({ kind: "ok", messages: [] });
      return;
    }
    let alive = true;
    fetch(`/api/email-history?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.error) setState({ kind: "error", reason: d.error });
        else setState({ kind: "ok", messages: d.messages ?? [] });
      })
      .catch(() => alive && setState({ kind: "error", reason: "fetch_failed" }));
    return () => {
      alive = false;
    };
  }, [email]);

  if (!email)
    return <p className="muted" style={{ fontSize: 13 }}>No email on file.</p>;

  if (state.kind === "loading")
    return <p className="muted" style={{ fontSize: 13 }}>Loading email history…</p>;

  if (state.kind === "error") {
    const friendly =
      state.reason === "gmail_not_connected"
        ? "Gmail not connected."
        : state.reason === "not_configured"
        ? "Email history not configured yet."
        : "Couldn’t load email history.";
    return <p className="muted" style={{ fontSize: 13 }}>{friendly}</p>;
  }

  if (state.messages.length === 0)
    return <p className="muted" style={{ fontSize: 13 }}>No emails found with this address.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {state.messages.map((m, i) => {
        const inbound = m.direction === "inbound";
        return (
          <div
            key={i}
            style={{
              borderLeft: `3px solid ${inbound ? "#0f6e56" : "#c9c6bd"}`,
              paddingLeft: 10,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                  color: inbound ? "#0f6e56" : "#7a776f",
                }}
              >
                {inbound ? "↘ Replied" : "↗ Sent"}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>{fmt(m.date)}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
              {m.subject ?? "(no subject)"}
            </div>
            {m.snippet && (
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {m.snippet.slice(0, 140)}
                {m.snippet.length > 140 ? "…" : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
