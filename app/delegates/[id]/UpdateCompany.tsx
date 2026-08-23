"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateCompany, requestNewCompany } from "./actions";

type Company = { id: string; name: string; domain: string | null };

// Re-link the contact to an EXISTING CRM company (Tier B): search → pick →
// confirm card "Change company: old → new (domain)" → apply. A company that
// isn't in the CRM can't be created here (Tier C) — "Request a new company"
// files a change request for the admin queue instead.
export default function UpdateCompany({
  delegateId,
  current,
}: {
  delegateId: string;
  current: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [requesting, setRequesting] = useState(false);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || picked) return;
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/companies?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const d = (await r.json()) as Company[];
        setResults(Array.isArray(d) ? d : []);
      } catch {
        /* aborted or failed — keep previous results */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q, open, picked]);

  const reset = () => { setOpen(false); setQ(""); setPicked(null); setRequesting(false); };

  async function confirm() {
    if (!picked) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await updateCompany(delegateId, picked.id);
      setMsg({ tone: r.ok && !r.queued ? "ok" : "warn", text: r.message });
      if (r.ok) { reset(); router.refresh(); }
    } catch {
      setMsg({ tone: "warn", text: "Couldn’t update the company — try again." });
    } finally {
      setSaving(false);
    }
  }

  async function request() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await requestNewCompany(delegateId, q);
      setMsg({ tone: r.ok ? "ok" : "warn", text: r.message });
      if (r.ok) reset();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={boxRef} style={{ marginBottom: 18 }}>
      {msg && (
        <div className={`flash ${msg.tone === "ok" ? "flash-ok" : "flash-warn"}`} role="status">{msg.text}</div>
      )}
      {!open ? (
        <button className="btn" type="button" onClick={() => setOpen(true)} disabled={saving}>
          Update company
        </button>
      ) : picked ? (
        <div className="card confirm-card" role="group" aria-label="Confirm company change">
          <div style={{ fontSize: 14, marginBottom: 10 }}>
            <strong>Change company:</strong>{" "}
            <span className="muted">{current ?? "—"}</span> →{" "}
            <strong>{picked.name}</strong>
            {picked.domain ? <span className="muted"> ({picked.domain})</span> : null}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" type="button" onClick={confirm} disabled={saving}>
              {saving ? "Saving…" : "Confirm"}
            </button>
            <button className="btn" type="button" onClick={() => setPicked(null)} disabled={saving}>Cancel</button>
          </div>
        </div>
      ) : requesting ? (
        <div className="card confirm-card" role="group" aria-label="Request a new company">
          <label htmlFor="newco">Company name (as it should appear in the CRM)</label>
          <input id="newco" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Bank of Somewhere" autoFocus />
          <p className="muted" style={{ fontSize: 12, margin: "6px 0 10px" }}>
            New companies are created by the CRM (domain-verified), not here. This sends a request to the review queue.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" type="button" onClick={request} disabled={saving || q.trim().length < 2}>
              {saving ? "Sending…" : "Send request"}
            </button>
            <button className="btn" type="button" onClick={() => setRequesting(false)} disabled={saving}>Back</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 10 }}>
          <label htmlFor="co-q">Search companies in the CRM</label>
          <input
            id="co-q"
            autoFocus
            value={q}
            placeholder="Start typing…"
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="co-results" role="listbox" aria-label="Matching companies">
            {loading && (
              <div className="muted" style={{ padding: 10, fontSize: 13 }}>
                Searching…
              </div>
            )}
            {!loading && results.length === 0 && (
              <div className="muted" style={{ padding: 10, fontSize: 13 }}>
                No matches.
              </div>
            )}
            {!loading &&
              results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="co-option"
                  onClick={() => setPicked(c)}
                  disabled={saving}
                >
                  {c.name}
                  {c.domain ? <span className="muted" style={{ fontSize: 12 }}> · {c.domain}</span> : null}
                </button>
              ))}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn" type="button" onClick={reset} style={{ padding: "6px 10px" }}>
              Cancel
            </button>
            <button type="button" className="linklike" onClick={() => setRequesting(true)}>
              Can’t find it? Request a new company
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
