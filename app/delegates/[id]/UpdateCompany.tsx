"use client";

import { useEffect, useState } from "react";
import { updateCompany, requestNewCompany, type CompanyWriteResult } from "./actions";
import { Spinner } from "./FieldEditor";

type Company = { id: string; name: string; domain: string | null };

// Inline editor for the Company row (ContactDetails): typeahead over CRM
// companies → pick → confirm "old → new (domain)" → apply + log (Tier B).
// A company that isn't in the CRM can't be created here (Tier C) — "Request a
// new company" files a change request for the admin queue instead.
// Esc cancels at any step; Enter confirms the current step.
export default function UpdateCompany({
  delegateId,
  current,
  onDone,
  onCancel,
}: {
  delegateId: string;
  current: string | null;
  // Called after a write (applied or queued) — the parent collapses + toasts.
  onDone: (r: CompanyWriteResult & { name?: string }) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (picked || requesting) return;
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
    return () => { ctrl.abort(); clearTimeout(t); };
  }, [q, picked, requesting]);

  async function confirm() {
    if (!picked) return;
    setSaving(true); setError(null);
    try {
      const r = await updateCompany(delegateId, picked.id);
      if (!r.ok) { setError(r.message); return; }
      onDone({ ...r, name: picked.name });
    } catch {
      setError("Couldn’t update the company — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function request() {
    setSaving(true); setError(null);
    try {
      const r = await requestNewCompany(delegateId, q);
      if (!r.ok) { setError(r.message); return; }
      onDone(r);
    } finally {
      setSaving(false);
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); if (!saving) onCancel(); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (saving) return;
      if (picked) confirm();
      else if (requesting && q.trim().length >= 2) request();
    }
  };

  return (
    <div className="fieldset-stack" style={{ gap: 10 }} onKeyDown={onKey}>
      {picked ? (
        <>
          <p style={{ margin: 0, fontSize: "var(--fs-base)" }}>
            Change company: <span className="muted">{current ?? "—"}</span> →{" "}
            <strong>{picked.name}</strong>
            {picked.domain ? <span className="muted"> ({picked.domain})</span> : null}
          </p>
          <p className="help">Re-links this contact to the existing CRM company. Logged to the activity trail.</p>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="form-actions">
            <button className="btn btn-primary btn-sm" type="button" onClick={confirm} disabled={saving}>
              {saving ? <Spinner /> : null}{saving ? "Saving…" : "Confirm"}
            </button>
            <button className="btn btn-sm" type="button" onClick={() => setPicked(null)} disabled={saving}>Back</button>
          </div>
        </>
      ) : requesting ? (
        <>
          <div className="field">
            <label htmlFor="newco">Company name (as it should appear in the CRM)</label>
            <input id="newco" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Bank of Somewhere" autoFocus />
          </div>
          <p className="help">New companies are created by the CRM (domain-verified), not here. This sends a request to the review queue.</p>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="form-actions">
            <button className="btn btn-primary btn-sm" type="button" onClick={request} disabled={saving || q.trim().length < 2}>
              {saving ? <Spinner /> : null}{saving ? "Sending…" : "Send request"}
            </button>
            <button className="btn btn-sm" type="button" onClick={() => setRequesting(false)} disabled={saving}>Back</button>
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="co-q">Search companies in the CRM</label>
            <input id="co-q" className="input" autoFocus value={q} placeholder="Start typing…" onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="co-results" role="listbox" aria-label="Matching companies">
            {loading && <div className="muted co-empty">Searching…</div>}
            {!loading && results.length === 0 && <div className="muted co-empty">No matches.</div>}
            {!loading && results.map((c) => (
              <button key={c.id} type="button" role="option" aria-selected={false} className="co-option" onClick={() => setPicked(c)} disabled={saving}>
                {c.name}
                {c.domain ? <span className="muted" style={{ fontSize: 12 }}> · {c.domain}</span> : null}
              </button>
            ))}
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="form-actions">
            <button className="btn btn-sm" type="button" onClick={onCancel}>Cancel</button>
            <button type="button" className="linklike" onClick={() => setRequesting(true)}>
              Can’t find it? Request a new company
            </button>
          </div>
        </>
      )}
    </div>
  );
}
