"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useDialog } from "../useDialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "../Avatar";
import { useToast, looksLikeSessionExpired } from "../Toast";
import { selectAllMatching } from "./actions";

export type Row = {
  id: string;
  name: string;
  photo?: string | null;
  photoSeed?: string | null;
  job_title: string;
  company: string;
  edition: string;
  stage: string;          // raw stage value (editable inline)
  stageLabel: string;
  stageClass: string;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
};
type Campaign = { id: string; name: string; active: boolean };
type SortKey = "name" | "job_title" | "company" | "edition" | "stage";
type Dir = "asc" | "desc";

const STAGES: { value: string; label: string }[] = [
  { value: "identified", label: "Identified" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "invited", label: "Invited" },
  { value: "applied", label: "Applied" },
  { value: "registered", label: "Registered" },
  { value: "confirmed", label: "Confirmed" },
  { value: "attended", label: "Attended" },
  { value: "cancelled", label: "Cancelled" },
  { value: "declined", label: "Declined" },
  { value: "no_show", label: "No Show" },
];
const stageLabelOf = (v: string) => STAGES.find((s) => s.value === v)?.label ?? v;
// Tone of the inline stage select (colours come from globals.css .stage-select)
const STAGE_TONE: Record<string, "is-positive" | "is-negative"> = {
  registered: "is-positive", confirmed: "is-positive", attended: "is-positive",
  cancelled: "is-negative", declined: "is-negative", no_show: "is-negative",
};

// Optional columns (Email · Phone · LinkedIn) — persisted in localStorage.
type OptCol = "email" | "phone" | "linkedin";
const OPT_COLS: { k: OptCol; label: string }[] = [
  { k: "email", label: "Email" },
  { k: "phone", label: "Phone" },
  { k: "linkedin", label: "LinkedIn" },
];
const COLS_KEY = "pmg-delegates-cols";
const PAGE_SIZES = [50, 100, 250];

function linkedinSlug(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.pathname.replace(/\/+$/, "").replace(/^\/+/, "") || u.hostname;
  } catch { return url; }
}

export default function DelegatesList({
  rows,
  filterQs,
  hasFilters,
  page,
  pageCount,
  pageSize,
  total,
  sort,
  dir,
}: {
  rows: Row[];
  filterQs: string;
  hasFilters: boolean;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  sort: SortKey;
  dir: Dir;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [selAllNote, setSelAllNote] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [modal, setModal] = useState(false);
  const [data, setData] = useState<Row[]>(rows);
  const [saving, setSaving] = useState<string | null>(null);
  const [cols, setCols] = useState<Set<OptCol>>(new Set());
  // rows change when the server sends a new page → reset local edits + selection.
  useEffect(() => { setData(rows); setSel(new Set()); setSelAllNote(null); }, [rows]);
  // Optional columns: restore from localStorage once.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLS_KEY);
      if (raw) setCols(new Set((JSON.parse(raw) as string[]).filter((k): k is OptCol => ["email", "phone", "linkedin"].includes(k))));
    } catch {}
  }, []);
  const toggleCol = (k: OptCol) =>
    setCols((c) => {
      const n = new Set(c); n.has(k) ? n.delete(k) : n.add(k);
      try { window.localStorage.setItem(COLS_KEY, JSON.stringify([...n])); } catch {}
      return n;
    });

  // Sorting + paging are server-side: they navigate with updated query params.
  const buildUrl = (over: { sort?: SortKey; dir?: Dir; page?: number; pageSize?: number }) => {
    const p = new URLSearchParams(filterQs);
    p.set("sort", over.sort ?? sort);
    p.set("dir", over.dir ?? dir);
    p.set("page", String(over.page ?? 1));
    const ps = over.pageSize ?? pageSize;
    if (ps !== 100) p.set("pageSize", String(ps));
    return `/delegates?${p.toString()}`;
  };
  const go = (over: { sort?: SortKey; dir?: Dir; page?: number; pageSize?: number }) =>
    startTransition(() => router.push(buildUrl(over)));

  const clickSort = (key: SortKey) =>
    go({ sort: key, dir: sort === key && dir === "asc" ? "desc" : "asc", page: 1 });
  const arrow = (key: SortKey) => (sort === key ? (dir === "asc" ? " ▲" : " ▼") : "");

  // Return target preserves page + sort so the detail "back" lands where you were.
  const retFull = (() => {
    const p = new URLSearchParams(filterQs);
    p.set("page", String(page)); p.set("sort", sort); p.set("dir", dir);
    if (pageSize !== 100) p.set("pageSize", String(pageSize));
    return p.toString();
  })();
  const detailHref = (id: string) => `/delegates/${id}?return=${encodeURIComponent(retFull)}`;

  const toggle = (id: string) =>
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = data.length > 0 && data.every((r) => sel.has(r.id));
  const toggleAll = () => { setSelAllNote(null); setSel(allOn ? new Set() : new Set(data.map((r) => r.id))); };

  // "Select all N matching" — every id in the current filter set (server action, capped).
  const selectAll = async () => {
    setSelecting(true);
    try {
      const r = await selectAllMatching(filterQs);
      setSel(new Set(r.ids));
      setSelAllNote(r.capped ? `Selected the first ${r.cap.toLocaleString()} of ${total.toLocaleString()} (cap)` : `All ${r.ids.length.toLocaleString()} matching selected`);
    } catch {
      toast.push({ message: "Couldn’t select all — try again.", tone: "warn" });
    } finally { setSelecting(false); }
  };

  // Inline stage change → POST; toast with Undo (which calls the same endpoint
  // with the previous stage). Queued/denied responses revert the optimistic
  // value and explain why. HTML/redirect responses mean the session expired.
  const postStage = async (id: string, stage: string): Promise<{ ok: boolean; queued?: boolean; message?: string; expired?: boolean }> => {
    const r = await fetch("/api/delegates/status", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delegate_id: id, stage }),
    });
    if (looksLikeSessionExpired(r)) return { ok: false, expired: true };
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, message: d.error ?? `HTTP ${r.status}` };
    return { ok: true, queued: !!d.queued, message: d.message };
  };

  const changeStage = async (id: string, stage: string) => {
    const row = data.find((r) => r.id === id);
    const prev = row?.stage;
    setData((d) => d.map((r) => (r.id === id ? { ...r, stage } : r)));
    setSaving(id);
    const revert = () => { if (prev) setData((d) => d.map((x) => (x.id === id ? { ...x, stage: prev } : x))); };
    try {
      const res = await postStage(id, stage);
      if (res.expired) {
        revert();
        toast.push({ message: "Session expired — sign in again", tone: "warn", link: { label: "Sign in", href: "/login" } });
      } else if (!res.ok) {
        revert();
        toast.push({ message: res.message ?? "Couldn’t update the stage", tone: "warn" });
      } else if (res.queued) {
        revert();
        toast.push({ message: res.message ?? "Held for review", tone: "warn" });
      } else {
        toast.push({
          message: `Moved ${row?.name ?? "delegate"} to ${stageLabelOf(stage)}`,
          action: prev ? {
            label: "Undo",
            onClick: async () => {
              setData((d) => d.map((x) => (x.id === id ? { ...x, stage: prev } : x)));
              const u = await postStage(id, prev);
              if (u.expired) toast.push({ message: "Session expired — sign in again", tone: "warn", link: { label: "Sign in", href: "/login" } });
              else if (!u.ok || u.queued) {
                setData((d) => d.map((x) => (x.id === id ? { ...x, stage } : x)));
                toast.push({ message: u.message ?? "Couldn’t undo", tone: "warn" });
              } else toast.push({ message: `Restored ${row?.name ?? "delegate"} to ${stageLabelOf(prev)}` });
            },
          } : undefined,
        });
      }
    } catch {
      revert();
      toast.push({ message: "Network error — stage not saved", tone: "warn" });
    } finally { setSaving(null); }
  };

  const StageSelect = ({ r }: { r: Row }) => (
    <select
      className={`stage-select ${STAGE_TONE[r.stage] ?? ""}`}
      value={r.stage}
      disabled={saving === r.id}
      onChange={(e) => changeStage(r.id, e.target.value)}
      aria-label={`Stage for ${r.name}`}
    >
      {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
  );

  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => {
    const sorted = sort === k;
    return (
      <th aria-sort={sorted ? (dir === "asc" ? "ascending" : "descending") : "none"} style={{ whiteSpace: "nowrap" }}>
        <button type="button" className="th-sort" onClick={() => clickSort(k)}>
          {children}{arrow(k)}
        </button>
      </th>
    );
  };

  const Pager = () => (
    <nav className="pager" aria-label="Pagination" style={{ opacity: pending ? 0.5 : 1 }}>
      <button className="btn" type="button" disabled={page <= 1 || pending} onClick={() => go({ page: 1 })} aria-label="First page">«</button>
      <button className="btn" type="button" disabled={page <= 1 || pending} onClick={() => go({ page: page - 1 })}>‹ Prev</button>
      <span className="muted" style={{ fontSize: 13 }}>Page {page} of {pageCount}</span>
      <button className="btn" type="button" disabled={page >= pageCount || pending} onClick={() => go({ page: page + 1 })}>Next ›</button>
      <button className="btn" type="button" disabled={page >= pageCount || pending} onClick={() => go({ page: pageCount })} aria-label="Last page">»</button>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, margin: "0 0 0 8px", fontSize: 13 }}>
        <span className="muted">Per page</span>
        <select value={pageSize} onChange={(e) => go({ pageSize: Number(e.target.value), page: 1 })} style={{ width: "auto", padding: "4px 8px" }} aria-label="Rows per page">
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </nav>
  );

  const Empty = () => (
    <>
      No delegates match these filters.
      {hasFilters && <> <Link href="/delegates">Clear filters</Link></>}
    </>
  );

  const showEmail = cols.has("email"), showPhone = cols.has("phone"), showLinkedin = cols.has("linkedin");
  const colCount = 6 + (showEmail ? 1 : 0) + (showPhone ? 1 : 0) + (showLinkedin ? 1 : 0);

  return (
    <>
      {/* Mobile-only sort control (the table headers do the sorting on desktop) */}
      <div className="sp-sort-mobile">
        <select aria-label="Sort by" value={sort} onChange={(e) => go({ sort: e.target.value as SortKey, page: 1 })}>
          <option value="name">Sort: Name</option>
          <option value="job_title">Sort: Job title</option>
          <option value="company">Sort: Company</option>
          <option value="edition">Sort: Edition</option>
          <option value="stage">Sort: Status</option>
        </select>
        <button type="button" className="btn" aria-label="Toggle sort direction" onClick={() => go({ dir: dir === "asc" ? "desc" : "asc", page: 1 })}>{dir === "asc" ? "▲" : "▼"}</button>
      </div>

      {/* Columns menu (desktop table) */}
      <div className="sp-table" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <details className="cols-menu">
          <summary className="btn btn-sm" style={{ cursor: "pointer" }}>Columns{cols.size ? ` · ${cols.size}` : ""}</summary>
          <div className="card">
            {OPT_COLS.map((c) => (
              <label key={c.k}>
                <input type="checkbox" checked={cols.has(c.k)} onChange={() => toggleCol(c.k)} /> {c.label}
              </label>
            ))}
          </div>
        </details>
      </div>

      <div className="card sp-table" style={{ opacity: pending ? 0.6 : 1, transition: "opacity .15s", overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                <input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Select all on page" style={{ width: "auto" }} />
              </th>
              <Th k="name">Name</Th><Th k="job_title">Job title</Th><Th k="company">Company</Th>
              <Th k="edition">Edition</Th>
              {showEmail && <th>Email</th>}
              {showPhone && <th>Phone</th>}
              {showLinkedin && <th>LinkedIn</th>}
              <Th k="stage">Status</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id} style={sel.has(r.id) ? { background: "var(--hover)" } : undefined}>
                <td><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} style={{ width: "auto" }} aria-label={`Select ${r.name}`} /></td>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Avatar name={r.name} photo={r.photo} seed={r.photoSeed} size={28} />
                    <Link href={detailHref(r.id)}>{r.name}</Link>
                  </span>
                </td>
                <td className="muted">{r.job_title}</td>
                <td className="muted">{r.company}</td>
                <td className="muted">{r.edition}</td>
                {showEmail && <td className="muted" style={{ fontSize: 13, overflowWrap: "anywhere" }}>{r.email ?? "—"}</td>}
                {showPhone && <td className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>{r.phone ?? "—"}</td>}
                {showLinkedin && (
                  <td className="muted" style={{ fontSize: 13 }}>
                    {r.linkedin ? <a href={r.linkedin} target="_blank" rel="noreferrer" title={r.linkedin}>{linkedinSlug(r.linkedin)}</a> : "—"}
                  </td>
                )}
                <td>
                  <StageSelect r={r} />
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={colCount} className="muted" style={{ textAlign: "center", padding: 24 }}><Empty /></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile-only card list (the table above is hidden under 640px) */}
      <div className="sp-cards" style={{ opacity: pending ? 0.6 : 1 }}>
        {data.map((r) => (
          <div key={r.id} className="card sp-card" style={sel.has(r.id) ? { borderColor: "var(--info)" } : undefined}>
            <div className="sp-top">
              <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} style={{ width: "auto", marginTop: 3 }} aria-label={`Select ${r.name}`} />
              <Avatar name={r.name} photo={r.photo} seed={r.photoSeed} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link href={detailHref(r.id)} className="sp-name">{r.name}</Link>
                <div className="sp-sub">{r.job_title}{r.company && r.company !== "—" ? ` · ${r.company}` : ""}</div>
                <div className="sp-edition">{r.edition}</div>
                <div className="sp-glyphs" aria-label="Contact data available">
                  <span className={r.email ? "on" : undefined} title={r.email ? "Has email" : "No email"}>{r.email ? "✓" : "–"} email</span>
                  <span className={r.phone ? "on" : undefined} title={r.phone ? "Has phone" : "No phone"}>{r.phone ? "✓" : "–"} phone</span>
                  <span className={r.linkedin ? "on" : undefined} title={r.linkedin ? "Has LinkedIn" : "No LinkedIn"}>{r.linkedin ? "✓" : "–"} LinkedIn</span>
                </div>
              </div>
            </div>
            <div className="sp-foot">
              <StageSelect r={r} />
              <Link href={detailHref(r.id)} className="muted" style={{ fontSize: 13 }}>Open ›</Link>
            </div>
          </div>
        ))}
        {data.length === 0 && (
          <div className="card sp-card muted" style={{ textAlign: "center", padding: 20 }}><Empty /></div>
        )}
      </div>

      {(pageCount > 1 || total > 50) && <Pager />}

      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        {total.toLocaleString()} total · click a column to sort · change status inline
        {sel.size > 0 ? ` · ${sel.size.toLocaleString()} selected` : ""}
        {selAllNote ? ` · ${selAllNote}` : ""}
      </p>

      {sel.size > 0 && (
        <div className="bulk-bar">
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px", boxShadow: "0 6px 24px rgba(0,0,0,0.15)", flexWrap: "wrap", justifyContent: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{sel.size.toLocaleString()} selected</span>
            {sel.size < total && (
              <button className="btn" type="button" onClick={selectAll} disabled={selecting}>
                {selecting ? "Selecting…" : `Select all ${total.toLocaleString()} matching`}
              </button>
            )}
            <button className="btn" type="button" onClick={() => { setSel(new Set()); setSelAllNote(null); }}>Clear</button>
            <button className="btn btn-primary" type="button" onClick={() => setModal(true)}>Push to Instantly</button>
          </div>
        </div>
      )}

      {modal && (
        <PushModal
          contactIds={[...sel]}
          onClose={() => setModal(false)}
          onDone={() => { setModal(false); setSel(new Set()); router.refresh(); }}
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
  const ref = useDialog(onClose);

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
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="card modal"
        style={{ maxWidth: 460 }}
      >
        <h3 id="push-modal-title" style={{ marginTop: 0 }}>Push {contactIds.length.toLocaleString()} delegate{contactIds.length === 1 ? "" : "s"} to Instantly</h3>

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
            <label htmlFor="push-campaign">Campaign</label>
            {campaigns === null ? (
              <p className="muted" style={{ fontSize: 13 }}>Loading campaigns…</p>
            ) : (
              <select id="push-campaign" value={chosen} onChange={(e) => setChosen(e.target.value)} style={{ width: "100%" }}>
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
            {err && <p style={{ color: "var(--danger)", fontSize: 13 }} role="alert">Error: {err}</p>}
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
