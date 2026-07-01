"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export type Row = {
  id: string;
  name: string;
  job_title: string;
  company: string;
  edition: string;
  stage: string;          // raw stage value (sortable + editable)
  stageLabel: string;
  stageClass: string;
};
type Campaign = { id: string; name: string; active: boolean };

const STAGES: { value: string; label: string }[] = [
  { value: "identified", label: "Identified" },
  { value: "invited", label: "Invited" },
  { value: "registered", label: "Registered" },
  { value: "confirmed", label: "Confirmed" },
  { value: "attended", label: "Attended" },
  { value: "cancelled", label: "Cancelled" },
  { value: "declined", label: "Declined" },
  { value: "no_show", label: "No Show" },
];
const STAGE_COLOR: Record<string, string> = {
  registered: "#0f6e56", confirmed: "#0f6e56", attended: "#0f6e56",
  cancelled: "#9b2c2c", declined: "#9b2c2c", no_show: "#9b2c2c",
};
type SortKey = "name" | "job_title" | "company" | "edition" | "stage";
const PAGE_SIZE = 100;

export default function DelegatesList({ rows, ret }: { rows: Row[]; ret: string }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState(false);
  const [data, setData] = useState<Row[]>(rows);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [saving, setSaving] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => { setData(rows); setPage(1); }, [rows]);

  const detailHref = (id: string) => (ret ? `/delegates/${id}?return=${encodeURIComponent(ret)}` : `/delegates/${id}`);
  const toggle = (id: string) =>
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = data.length > 0 && data.every((r) => sel.has(r.id));
  const toggleAll = () => setSel(allOn ? new Set() : new Set(data.map((r) => r.id)));

  const STAGE_ORDER = new Map(STAGES.map((s, i) => [s.value, i]));
  const sorted = [...data].sort((a, b) => {
    let av: string | number = a[sort.key], bv: string | number = b[sort.key];
    if (sort.key === "stage") { av = STAGE_ORDER.get(a.stage) ?? 99; bv = STAGE_ORDER.get(b.stage) ?? 99; }
    if (av < bv) return -1 * sort.dir;
    if (av > bv) return 1 * sort.dir;
    return 0;
  });
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const clickSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: 1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "");

  const changeStage = async (id: string, stage: string) => {
    const prev = data.find((r) => r.id === id)?.stage;
    setData((d) => d.map((r) => (r.id === id ? { ...r, stage } : r)));
    setSaving(id);
    try {
      const r = await fetch("/api/delegates/status", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delegate_id: id, stage }),
      });
      if (!r.ok && prev) setData((d) => d.map((x) => (x.id === id ? { ...x, stage: prev } : x)));
    } catch {
      if (prev) setData((d) => d.map((x) => (x.id === id ? { ...x, stage: prev } : x)));
    } finally { setSaving(null); }
  };

  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th onClick={() => clickSort(k)} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
      {children}{arrow(k)}
    </th>
  );

  return (
    <>
      {/* Mobile-only sort control (the table headers do the sorting on desktop) */}
      <div className="sp-sort-mobile">
        <select aria-label="Sort by" value={sort.key} onChange={(e) => setSort((s) => ({ key: e.target.value as SortKey, dir: s.dir }))}>
          <option value="name">Sort: Name</option>
          <option value="job_title">Sort: Job title</option>
          <option value="company">Sort: Company</option>
          <option value="edition">Sort: Edition</option>
          <option value="stage">Sort: Status</option>
        </select>
        <button type="button" className="btn" aria-label="Toggle sort direction" onClick={() => setSort((s) => ({ key: s.key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 }))}>{sort.dir === 1 ? "▲" : "▼"}</button>
      </div>

      <div className="card sp-table">
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                <input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Select all" style={{ width: "auto" }} />
              </th>
              <Th k="name">Name</Th><Th k="job_title">Job title</Th><Th k="company">Company</Th>
              <Th k="edition">Edition</Th><Th k="stage">Status</Th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} style={sel.has(r.id) ? { background: "var(--hover, #f1efe8)" } : undefined}>
                <td><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} style={{ width: "auto" }} /></td>
                <td><Link href={detailHref(r.id)}>{r.name}</Link></td>
                <td className="muted">{r.job_title}</td>
                <td className="muted">{r.company}</td>
                <td className="muted">{r.edition}</td>
                <td>
                  <select
                    value={r.stage}
                    disabled={saving === r.id}
                    onChange={(e) => changeStage(r.id, e.target.value)}
                    style={{ width: "auto", padding: "3px 8px", fontSize: 13, fontWeight: 600, color: STAGE_COLOR[r.stage] ?? "var(--text)", border: "1px solid var(--border)", borderRadius: 6, background: "#fff" }}
                  >
                    {STAGES.map((s) => <option key={s.value} value={s.value} style={{ color: "var(--text)" }}>{s.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>No delegates match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile-only card list (the table above is hidden under 640px) */}
      <div className="sp-cards">
        {pageRows.map((r) => (
          <div key={r.id} className="card sp-card" style={sel.has(r.id) ? { borderColor: "var(--info)" } : undefined}>
            <div className="sp-top">
              <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} style={{ width: "auto", marginTop: 3 }} aria-label={`Select ${r.name}`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link href={detailHref(r.id)} className="sp-name">{r.name}</Link>
                <div className="sp-sub">{r.job_title}{r.company && r.company !== "—" ? ` · ${r.company}` : ""}</div>
                <div className="sp-edition">{r.edition}</div>
              </div>
            </div>
            <div className="sp-foot">
              <select
                value={r.stage}
                disabled={saving === r.id}
                onChange={(e) => changeStage(r.id, e.target.value)}
                style={{ width: "auto", padding: "5px 10px", fontSize: 13, fontWeight: 600, color: STAGE_COLOR[r.stage] ?? "var(--text)", border: "1px solid var(--border)", borderRadius: 6, background: "#fff" }}
              >
                {STAGES.map((s) => <option key={s.value} value={s.value} style={{ color: "var(--text)" }}>{s.label}</option>)}
              </select>
              <Link href={detailHref(r.id)} className="muted" style={{ fontSize: 13 }}>Open ›</Link>
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="card sp-card muted" style={{ textAlign: "center", padding: 20 }}>No delegates match these filters.</div>
        )}
      </div>

      {pageCount > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 12 }}>
          <button className="btn" type="button" disabled={current <= 1} onClick={() => setPage(current - 1)}>‹ Prev</button>
          <span className="muted" style={{ fontSize: 13 }}>Page {current} of {pageCount}</span>
          <button className="btn" type="button" disabled={current >= pageCount} onClick={() => setPage(current + 1)}>Next ›</button>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Click a column to sort · change status inline</p>

      {sel.size > 0 && (
        <div style={{ position: "sticky", bottom: 12, display: "flex", justifyContent: "center", marginTop: 12, zIndex: 30 }}>
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px", boxShadow: "0 6px 24px rgba(0,0,0,0.15)" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{sel.size} selected</span>
            <button className="btn" type="button" onClick={() => setSel(new Set())}>Clear</button>
            <button className="btn btn-primary" type="button" onClick={() => setModal(true)}>Push to Instantly</button>
          </div>
        </div>
      )}

      {modal && (
        <PushModal
          contactIds={[...sel]}
          onClose={() => setModal(false)}
          onDone={() => { setModal(false); setSel(new Set()); location.reload(); }}
        />
      )}
    </>
  );
}

function PushModal({ contactIds, onClose, onDone }: { contactIds: string[]; onClose: () => void; onDone: () => void }) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [chosen, setChosen] = useState<string>("");
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ pushed: number; failed: number; held_back: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; ran.current = true;
    fetch("/api/instantly-campaigns").then((r) => r.json()).then((d) => setCampaigns(d.campaigns ?? [])).catch(() => setCampaigns([]));
  }, []);

  const doPush = async () => {
    if (!chosen) return;
    setPushing(true); setErr(null);
    try {
      const r = await fetch("/api/push-delegates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_ids: contactIds, campaign_id: chosen }),
      });
      const d = await r.json();
      if (d.error) setErr(d.error);
      else setResult({ pushed: d.pushed ?? 0, failed: d.failed ?? 0, held_back: d.held_back ?? 0 });
    } catch { setErr("Push failed."); }
    finally { setPushing(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 460, maxWidth: "100%", padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>Push {contactIds.length} delegate{contactIds.length === 1 ? "" : "s"} to Instantly</h3>

        {result ? (
          <div>
            <p style={{ fontSize: 14 }}>✅ Pushed <strong>{result.pushed}</strong>. Their stage advances to <strong>invited</strong>.</p>
            {result.held_back > 0 && (
              <p className="muted" style={{ fontSize: 13 }}>⏸ {result.held_back} skipped — no verified email yet (held by the deliverability gate, not bounced). They'll be pushable once their email is verified.</p>
            )}
            {result.failed > 0 && <p className="muted" style={{ fontSize: 13 }}>{result.failed} failed.</p>}
            <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn btn-primary" onClick={onDone}>Done</button></div>
          </div>
        ) : (
          <>
            <label>Campaign</label>
            {campaigns === null ? (
              <p className="muted" style={{ fontSize: 13 }}>Loading campaigns…</p>
            ) : (
              <select value={chosen} onChange={(e) => setChosen(e.target.value)} style={{ width: "100%" }}>
                <option value="">Select a campaign…</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.active ? "● " : "○ "}{c.name}{c.active ? "" : " (draft — won't send)"}</option>
                ))}
              </select>
            )}
            <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
              ● active · ○ draft. Event date/location injected automatically. Already-pushed delegates are skipped.
              <strong> Only delegates with a verified email (Findymail / MillionVerifier / Scrubby) are enrolled</strong> — the rest are held, never bounced. (Tip: use the “Has valid email” filter to pre-select.)
            </p>
            {err && <p style={{ color: "#9b2c2c", fontSize: 13 }}>Error: {err}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={onClose} disabled={pushing}>Cancel</button>
              <button className="btn btn-primary" onClick={doPush} disabled={!chosen || pushing}>{pushing ? "Pushing…" : "Confirm push"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
