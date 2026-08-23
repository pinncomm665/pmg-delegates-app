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
  // Gmail thread id (passed through the /api/email-history proxy) → deep link.
  thread_id?: string | null;
};

const gmailThreadUrl = (id: string) => `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(id)}`;

// "Name <a@b.com>" → "a@b.com"; bare address passes through.
function addressOf(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/<([^>]+)>/);
  const a = (m ? m[1] : v).trim();
  return a.includes("@") ? a : null;
}

// "Name <a@b.com>" → "Name"; bare address → its local part.
function displayNameOf(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>/);
  if (m && m[1].trim()) return m[1].trim();
  const a = addressOf(v);
  return a ? a.split("@")[0] : v.trim() || null;
}

function firstNameOf(v: string | null): string | null {
  const n = displayNameOf(v);
  if (!n) return null;
  return n.split(/[\s._]+/).filter(Boolean)[0] ?? n;
}

// Per-row attribution. Outbound (from a grouppmg.com mailbox) → SENT by <first
// name>. Inbound from one of the CONTACT's addresses → REPLIED. Inbound from
// anyone else (another recipient on a group thread) → THREAD · <name>, muted —
// it is NOT this contact replying.
type Kind = "sent" | "replied" | "thread";
function classify(m: Msg, contactAddrs: Set<string>): { kind: Kind; who: string | null } {
  const from = addressOf(m.from)?.toLowerCase() ?? null;
  if (m.direction === "outbound" || (from && from.endsWith("@grouppmg.com"))) {
    return { kind: "sent", who: firstNameOf(m.from) };
  }
  if (from && contactAddrs.has(from)) return { kind: "replied", who: null };
  return { kind: "thread", who: displayNameOf(m.from) };
}

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

// Searches EVERY address on file (work + personal) — the proxy fans out per
// address and merges. Pass both; nulls are dropped here.
export default function EmailHistory({ emails }: { emails: Array<string | null | undefined> }) {
  const list = Array.from(new Set(emails.map((e) => (e ?? "").trim().toLowerCase()).filter((e) => e.includes("@"))));
  const key = list.join(",");
  const contactAddrs = new Set(list);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; reason: string }
    | { kind: "ok"; messages: Msg[] }
  >({ kind: "loading" });

  useEffect(() => {
    if (!key) {
      setState({ kind: "ok", messages: [] });
      return;
    }
    let alive = true;
    fetch(`/api/email-history?emails=${encodeURIComponent(key)}`)
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
  }, [key]);

  if (!key)
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
    return <p className="muted" style={{ fontSize: 13 }}>No emails found for this contact’s addresses.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {state.messages.map((m, i) => {
        const { kind, who } = classify(m, contactAddrs);
        const inbound = kind !== "sent";
        const accent = kind === "replied" ? "var(--accent)" : kind === "sent" ? "#7a776f" : "#a8a49b";
        const bar = kind === "replied" ? "var(--accent)" : kind === "sent" ? "#c9c6bd" : "#e3e1da";
        const label =
          kind === "sent"
            ? `↗ Sent${who ? ` by ${who}` : ""}`
            : kind === "replied"
            ? "↘ Replied"
            : `Thread · ${who ?? "other recipient"}`;
        return (
          <div
            key={i}
            style={{
              borderLeft: `3px solid ${bar}`,
              paddingLeft: 10,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                  color: accent,
                }}
              >
                {label}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>{fmt(m.date)}</span>
              {kind === "thread" && (
                <span className="muted" style={{ fontSize: 11, fontStyle: "italic" }}>
                  another recipient on this thread
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
              {m.thread_id ? (
                <a
                  href={gmailThreadUrl(m.thread_id)}
                  target="_blank"
                  rel="noreferrer"
                  title="Open this thread in Gmail"
                >
                  {m.subject ?? "(no subject)"}
                </a>
              ) : (
                m.subject ?? "(no subject)"
              )}
            </div>
            {(() => {
              const addr = addressOf(inbound ? m.from : m.to);
              return addr ? (
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {inbound ? "From " : "To "}
                  <a href={`mailto:${addr}`} title={`Email ${addr}`}>{addr}</a>
                </div>
              ) : null;
            })()}
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
