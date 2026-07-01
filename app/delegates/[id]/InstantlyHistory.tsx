"use client";

import { useEffect, useState } from "react";
import type { Enrolment } from "@/lib/data";

type Lead = {
  campaign_id: string | null;
  added_at: string | null;
  contacted_at: string | null;
  status: string;
  opens: number;
  replies: number;
};

function fmt(d: string | null) {
  if (!d) return "";
  const t = new Date(d);
  if (isNaN(t.getTime())) return d;
  return t.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statusColors(s: string): { bg: string; fg: string } {
  switch (s) {
    case "Sequence Completed": return { bg: "#e1f3ed", fg: "#0f6e56" };
    case "Contacted": return { bg: "#e8eef9", fg: "#2a4d8f" };
    case "Queued": return { bg: "#f1efe8", fg: "#5f5e5a" };
    case "Stopped": return { bg: "#fbeaea", fg: "#9b2c2c" };
    default: return { bg: "#f1efe8", fg: "#5f5e5a" };
  }
}

export default function InstantlyHistory({
  email,
  enrolments,
}: {
  email: string | null;
  enrolments: Enrolment[];
}) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error" } | { kind: "ok"; leads: Lead[] }
  >({ kind: "loading" });

  useEffect(() => {
    if (!email) {
      setState({ kind: "ok", leads: [] });
      return;
    }
    let alive = true;
    fetch(`/api/instantly-status?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.error && !d.leads?.length) setState({ kind: "error" });
        else setState({ kind: "ok", leads: d.leads ?? [] });
      })
      .catch(() => alive && setState({ kind: "error" }));
    return () => { alive = false; };
  }, [email]);

  // campaign_id → name from our push log (best-effort label for live leads)
  const nameById = new Map<string, string>();
  for (const e of enrolments) {
    if (e.campaign_id && e.campaign_name) nameById.set(e.campaign_id, e.campaign_name);
  }

  const Row = ({
    label,
    added,
    status,
    extra,
  }: {
    label: string;
    added: string | null;
    status: string | null;
    extra?: string;
  }) => {
    const c = status ? statusColors(status) : null;
    return (
      <div style={{ borderLeft: "3px solid #c9c6bd", paddingLeft: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 2, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {added ? <span>Added {fmt(added)}</span> : null}
          {status && c ? (
            <span style={{ background: c.bg, color: c.fg, fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 999 }}>
              {status}
            </span>
          ) : null}
          {extra ? <span>{extra}</span> : null}
        </div>
      </div>
    );
  };

  // Live leads are the source of truth for status; fall back to push-log enrolments.
  if (state.kind === "ok" && state.leads.length > 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {state.leads.map((l, i) => (
          <Row
            key={i}
            label={(l.campaign_id && nameById.get(l.campaign_id)) || "Instantly campaign"}
            added={l.added_at}
            status={l.status}
            extra={l.replies > 0 ? `${l.replies} repl${l.replies === 1 ? "y" : "ies"}` : l.opens > 0 ? `${l.opens} opens` : undefined}
          />
        ))}
      </div>
    );
  }

  // No live leads (or Instantly unreachable) → show what we logged at push time.
  if (enrolments.length > 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {state.kind === "loading" && (
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>Checking live status…</p>
        )}
        {enrolments.map((e, i) => (
          <Row
            key={i}
            label={e.campaign_name ?? e.event_brand ?? "Campaign"}
            added={e.pushed_at}
            status={null}
            extra={e.status ?? "pushed"}
          />
        ))}
      </div>
    );
  }

  if (state.kind === "loading")
    return <p className="muted" style={{ fontSize: 13 }}>Checking Instantly…</p>;

  return <p className="muted" style={{ fontSize: 13 }}>Not enrolled in any campaign.</p>;
}
