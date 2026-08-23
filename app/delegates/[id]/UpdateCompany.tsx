"use client";

import { useEffect, useState } from "react";
import { updateCompany, requestNewCompany, type CompanyWriteResult } from "./actions";
import { Spinner } from "./FieldEditor";

type Company = { id: string; name: string; domain: string | null };

// Inline editor body for the Company row (Tier B): typeahead over CRM
// companies → confirm card "old → new (domain)" → apply + log. A company that
// isn't in the CRM can't be created here (Tier C) — "Request a new company"
// files a change request (kind 'company_new') for the admin queue instead.
// Rendered INSIDE the Contact-details row by ContactDetails; the parent owns
// open/close and the success toast.
export default function UpdateCompany({
  delegateId,
  current,
  onDone,
  onCancel,
}: {
  delegateId: string;
  current: string | null;
  onDone: (r: CompanyWriteResult) => void;
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
    setSaving(true);
    setError(null);
    try {
      const r = await updateCompany(delegateId, picked.id);
      if (!r.ok) setError(r.message); else onDone(r);
    } catch {
      setError("Couldn’t update the company — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function request() {
    setSaving(true);
    setError(null);
    try {
      const r = await requestNewCompany(delegateId, q);
      if (!r.ok) setError(r.message); else onDone(r);
    } finally {
      setSaving(false);
    }
  }

  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onCancel(); } };

  if (picked) {
    return (
      <div className="cd-editor" role="group" aria-label="Confirm company change" onKeyDown={onKey}>
        <div className="card confirm-card">
          <strong>Change company:</strong>{" "}
          <span className="muted">{current ?? "—"}</span> →{" "}
          <strong>{picked.name}</strong>
          {picked.domain ? <span className="muted"> ({picked.domain})</span> : null}
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="cd-actions">
          <button className="btn btn-primary btn-sm" type="button" onClick={confirm} disabled={saving} autoFocus>
            {saving && <Spinner />}{saving ? "Saving…" : "Confirm"}
          </button>
          <button className="btn btn-sm" type="button" onClick={() => setPicked(null)} disabled={saving}>Back</button>
          <p className="help">Applied immediately and logged to Activity.</p>
        </div>
      </div>
    );
  }

  if (requesting) {
    return (
      <div className="cd-editor" role="group" aria-label="Request a new company" onKeyDown={onKey}>
        <div className="cd-editor-row">
          <input
            className="input"
            aria-label="Company name (as it should appear in the CRM)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Company name, e.g. Bank of Somewhere"
            autoFocus
            disabled={saving}
            onKeyDown={(e) => { if (e.key === "Enter" && q.trim().length >= 2) { e.preventDefault(); void request(); } }}
          />
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="cd-actions">
          <button className="btn btn-primary btn-sm" type="button" onClick={request} disabled={saving || q.trim().length < 2}>
            {saving && <Spinner />}{saving ? "Sending…" : "Send request"}
          </button>
          <button className="btn btn-sm" type="button" onClick={() => setRequesting(false)} disabled={saving}>Back</button>
          <p className="help">New companies are created by the CRM (domain-verified). This goes to the review queue.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cd-editor" role="group" aria-label="Change company" onKeyDown={onKey}>
      <div className="cd-editor-row">
        <input
          className="input"
          aria-label="Search companies in the CRM"
          autoFocus
          value={q}
          placeholder="Search companies in the CRM…"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="co-results" role="listbox" aria-label="Matching companies">
        {loading && <div className="muted" style={{ padding: 10, fontSize: 13 }}>Searching…</div>}
        {!loading && results.length === 0 && <div className="muted" style={{ padding: 10, fontSize: 13 }}>No matches.</div>}
        {!loading && results.map((c) => (
          <button key={c.id} type="button" role="option" aria-selected={false} className="co-option" onClick={() => setPicked(c)}>
            {c.name}
            {c.domain ? <span className="muted" style={{ fontSize: 12 }}> · {c.domain}</span> : null}
          </button>
        ))}
      </div>
      <div className="cd-actions">
        <button className="btn btn-sm" type="button" onClick={onCancel}>Cancel</button>
        <button type="button" className="linklike" onClick={() => setRequesting(true)}>
          Can’t find it? Request a new company
        </button>
      </div>
    </div>
  );
}
