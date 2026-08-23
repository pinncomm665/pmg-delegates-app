"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ACTIVITY_TYPES,
  ACTIVITY_LIST_FALLBACK,
  SUMMARY_PERIODS,
  type ActivityFeedRow,
  type ActivityOwner,
  type ActivitySummary,
  type SummaryPeriod,
} from "@/lib/activityFeed";
import AttachmentChips from "../AttachmentChips";

// Activity Report — client half: the sticky filter bar (search · type chips ·
// owner · date range · sort), the owner × type summary matrix, the table
// (desktop) / cards (≤640px) and the pager. Every control writes the URL
// (router.replace) so the server re-queries; search is debounced 200 ms.

type Filters = { q: string; activity: string[]; owner: string; since: string; until: string; sort: "asc" | "desc" };

const TYPE_CLASS: Record<string, string> = {
  Email: "ar-t-email",
  Phone: "ar-t-phone",
  Meeting: "ar-t-meeting",
  LinkedIn: "ar-t-linkedin",
  WhatsApp: "ar-t-whatsapp",
  Note: "ar-t-note",
  Registration: "ar-t-registration",
  Stage: "ar-t-stage",
  Other: "ar-t-other",
};

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} d ago`;
  if (d < 60) return `${Math.round(d / 7)} wk ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} mo ago`;
  return `${Math.round(d / 365)} yr ago`;
}
function absTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function firstName(owner: { owner_name: string | null; owner_email: string | null }): string {
  if (owner.owner_name) return owner.owner_name.split(/\s+/)[0];
  if (owner.owner_email) return owner.owner_email.split("@")[0];
  return "—";
}
function ownerLabel(o: ActivityOwner): string {
  return o.name ? `${o.name} (${o.email})` : o.email;
}

export default function ActivityReport({
  rows,
  total,
  available,
  error,
  owners,
  summary,
  period,
  filters,
  page,
  pageCount,
  pageSize,
}: {
  rows: ActivityFeedRow[];
  total: number;
  available: boolean;
  error: string | null;
  owners: ActivityOwner[];
  summary: ActivitySummary;
  period: SummaryPeriod;
  filters: Filters;
  page: number;
  pageCount: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const typed = useRef(false);

  // Build the URL for a filter delta; `page` resets to 1 unless given.
  const hrefFor = useCallback(
    (over: Partial<Filters & { page: number; period: SummaryPeriod }>) => {
      const f = { ...filters, ...over };
      const p = new URLSearchParams();
      if (f.q) p.set("q", f.q);
      if (f.activity.length) p.set("activity", f.activity.join(","));
      if (f.owner) p.set("owner", f.owner);
      if (f.since) p.set("since", f.since);
      if (f.until) p.set("until", f.until);
      if (f.sort === "asc") p.set("sort", "asc");
      const per = over.period ?? period;
      if (per !== "7d") p.set("period", per);
      const pg = over.page ?? 1;
      if (pg > 1) p.set("page", String(pg));
      const qs = p.toString();
      return `${pathname}${qs ? `?${qs}` : ""}`;
    },
    [filters, pathname, period]
  );
  const apply = useCallback(
    (over: Partial<Filters & { page: number; period: SummaryPeriod }>) => {
      startTransition(() => router.replace(hrefFor(over), { scroll: false }));
    },
    [router, hrefFor]
  );

  // Instant type-ahead search → ?q= (200 ms debounce; only after the user types).
  useEffect(() => {
    if (!typed.current) return;
    const t = setTimeout(() => {
      if (q.trim() !== filters.q) apply({ q: q.trim() });
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  // Server-side q changed (back/forward, chip removal) → mirror it into the box.
  useEffect(() => { setQ(filters.q); }, [filters.q]);

  const toggleType = (t: string) => {
    const set = new Set(filters.activity);
    set.has(t) ? set.delete(t) : set.add(t);
    apply({ activity: ACTIVITY_TYPES.filter((x) => set.has(x)) });
  };
  const anyFilter = !!(filters.q || filters.activity.length || filters.owner || filters.until || filters.sort === "asc");
  const toggleExpand = (id: string) =>
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const contactCell = (r: ActivityFeedRow) => {
    const name = r.contact_name ?? "—";
    if (r.detail_href) return <Link href={r.detail_href}>{name}</Link>;
    if (r.contact_name) return <Link href={ACTIVITY_LIST_FALLBACK(r.contact_name)} title="Search the list for this contact">{name}</Link>;
    return <span className="muted">{name}</span>;
  };
  const typeChip = (t: string) => <span className={`chip ar-type ${TYPE_CLASS[t] ?? "ar-t-other"}`}>{t}</span>;
  const summaryCell = (r: ActivityFeedRow, clamp: boolean) => {
    const text = r.summary ?? r.title ?? "";
    if (!text) return <span className="muted">—</span>;
    const open = expanded.has(r.id);
    return (
      <button
        type="button"
        className={`ar-sum${clamp && !open ? " is-clamped" : ""}`}
        title={clamp && !open ? text : undefined}
        onClick={() => toggleExpand(r.id)}
        aria-expanded={open}
      >
        {r.title && r.summary && r.title !== r.summary ? <strong>{r.title} · </strong> : null}
        {text}
      </button>
    );
  };

  const Pager = () => (
    <nav className="pager" aria-label="Pagination" style={{ opacity: pending ? 0.5 : 1 }}>
      <button className="btn" type="button" disabled={page <= 1 || pending} onClick={() => apply({ page: 1 })} aria-label="First page">«</button>
      <button className="btn" type="button" disabled={page <= 1 || pending} onClick={() => apply({ page: page - 1 })}>‹ Prev</button>
      <span className="muted" style={{ fontSize: 13 }}>Page {page} of {pageCount}</span>
      <button className="btn" type="button" disabled={page >= pageCount || pending} onClick={() => apply({ page: page + 1 })}>Next ›</button>
      <button className="btn" type="button" disabled={page >= pageCount || pending} onClick={() => apply({ page: pageCount })} aria-label="Last page">»</button>
    </nav>
  );

  // ── Summary matrix ──────────────────────────────────────────────────────
  const heat = (n: number) => {
    if (!n || !summary.max) return undefined;
    const pct = Math.max(8, Math.round((n / summary.max) * 55));
    return { background: `color-mix(in srgb, var(--accent) ${pct}%, var(--card))` } as React.CSSProperties;
  };
  const periodLabel = useMemo(() => SUMMARY_PERIODS.find((p) => p.k === period)?.label ?? "Last 7 days", [period]);

  return (
    <>
      {/* ── Activity summary (owner × type) ─────────────────────────────── */}
      <section className="card section fieldset ar-summary" aria-labelledby="ar-sum-title" style={{ marginBottom: 16 }}>
        <div className="section-head">
          <div>
            <p id="ar-sum-title" className="section-title">Activity summary</p>
            <p className="section-sub">Touches per account owner · {periodLabel}. Click a cell to filter the feed below.</p>
          </div>
          <div className="ar-periods" role="group" aria-label="Summary period">
            {SUMMARY_PERIODS.map((p) => (
              <button
                key={p.k}
                type="button"
                className={`chip ar-chip${period === p.k ? " is-on" : ""}`}
                aria-pressed={period === p.k}
                onClick={() => apply({ period: p.k, page })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {!summary.available ? (
          <p className="help">Activity feed not available yet.</p>
        ) : summary.rows.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No activity recorded {periodLabel.toLowerCase()}.</p>
        ) : (
          <div className="ar-matrix-wrap">
            <table className="ar-matrix">
              <thead>
                <tr>
                  <th scope="col">Account owner</th>
                  {ACTIVITY_TYPES.map((t) => <th key={t} scope="col">{t}</th>)}
                  <th scope="col" className="ar-total">Total</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((o) => {
                  const key = o.owner_email ?? "__system__";
                  const label = o.owner_email ? (o.owner_name ?? o.owner_email) : "Unassigned / System";
                  const onOwner = !!o.owner_email && filters.owner === o.owner_email;
                  return (
                    <tr key={key} className={onOwner ? "is-on" : undefined}>
                      <th scope="row" title={o.owner_email ?? "Automated sources (Luma, Webflow, Instantly…) and rows without a known owner"}>
                        {o.owner_email ? (
                          <button type="button" className="ar-cell-btn ar-owner-btn" onClick={() => apply({ owner: onOwner ? "" : o.owner_email!, activity: [] })}>
                            {label}
                          </button>
                        ) : (
                          <span className="muted">{label}</span>
                        )}
                      </th>
                      {ACTIVITY_TYPES.map((t) => {
                        const n = o.counts[t] ?? 0;
                        const on = onOwner && filters.activity.length === 1 && filters.activity[0] === t;
                        return (
                          <td key={t} className={`ar-cell${n ? "" : " is-zero"}${on ? " is-on" : ""}`} style={heat(n)}>
                            {n ? (
                              <button
                                type="button"
                                className="ar-cell-btn"
                                title={`${label} · ${t}: ${n}`}
                                onClick={() => apply(o.owner_email ? { owner: on ? "" : o.owner_email, activity: on ? [] : [t] } : { owner: "", activity: [t] })}
                              >
                                {n.toLocaleString()}
                              </button>
                            ) : (
                              <span aria-label="0">·</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="ar-total">{o.total.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Totals</th>
                  {ACTIVITY_TYPES.map((t) => {
                    const n = summary.totals[t] ?? 0;
                    return (
                      <td key={t} className={`ar-total${n ? "" : " is-zero"}`}>
                        {n ? (
                          <button type="button" className="ar-cell-btn" onClick={() => apply({ owner: "", activity: [t] })}>{n.toLocaleString()}</button>
                        ) : "·"}
                      </td>
                    );
                  })}
                  <td className="ar-total ar-grand">{summary.grandTotal.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ── Sticky filter bar ───────────────────────────────────────────── */}
      <div className="card section ar-bar" role="search" aria-label="Filter activity">
        <div className="ar-bar-row">
          <input
            value={q}
            onChange={(e) => { typed.current = true; setQ(e.target.value); }}
            placeholder="Search by contact or company"
            aria-label="Search activity by contact or company"
            autoComplete="off"
            className="ar-search"
          />
          <select value={filters.owner} onChange={(e) => apply({ owner: e.target.value })} aria-label="Owner" className="ar-owner">
            <option value="">All owners</option>
            {owners.map((o) => <option key={o.email} value={o.email}>{ownerLabel(o)}</option>)}
            {filters.owner && !owners.some((o) => o.email === filters.owner) && <option value={filters.owner}>{filters.owner}</option>}
          </select>
          <label className="ar-date">
            <span className="muted">From</span>
            <input type="date" value={filters.since} max={filters.until || undefined} onChange={(e) => apply({ since: e.target.value })} aria-label="From date" />
          </label>
          <label className="ar-date">
            <span className="muted">To</span>
            <input type="date" value={filters.until} min={filters.since || undefined} onChange={(e) => apply({ until: e.target.value })} aria-label="To date" />
          </label>
          <button
            type="button"
            className="btn ar-sort"
            onClick={() => apply({ sort: filters.sort === "asc" ? "desc" : "asc", page })}
            aria-label={`Sort by date, currently ${filters.sort === "asc" ? "oldest first" : "newest first"}`}
            title="Toggle date order"
          >
            {filters.sort === "asc" ? "Oldest first ▲" : "Newest first ▼"}
          </button>
          {anyFilter && (
            <Link href={pathname} className="btn btn-ghost btn-sm ar-reset" onClick={() => { typed.current = false; setQ(""); }}>Reset</Link>
          )}
        </div>
        <div className="ar-bar-row ar-types" role="group" aria-label="Activity type">
          {ACTIVITY_TYPES.map((t) => {
            const on = filters.activity.includes(t);
            return (
              <button
                key={t}
                type="button"
                className={`chip ar-chip ${TYPE_CLASS[t]}${on ? " is-on" : ""}`}
                aria-pressed={on}
                onClick={() => toggleType(t)}
              >
                {t}
              </button>
            );
          })}
          {pending && <span className="chip chip-queued ar-state"><span className="btn-spin" aria-hidden="true" />Loading</span>}
        </div>
      </div>

      {!available ? (
        <div className="card section"><p className="help" style={{ margin: 0 }}>Activity feed not available yet.</p></div>
      ) : error ? (
        <div className="card section"><p className="help" style={{ margin: 0, color: "var(--danger)" }}>Couldn’t load the activity feed — {error}</p></div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card sp-table ar-table" style={{ opacity: pending ? 0.6 : 1, transition: "opacity .15s", overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="th-sort" onClick={() => apply({ sort: filters.sort === "asc" ? "desc" : "asc", page })}>
                      Date{filters.sort === "asc" ? " ▲" : " ▼"}
                    </button>
                  </th>
                  <th>Contact</th>
                  <th>Company</th>
                  <th>Activity</th>
                  <th>Owner</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="muted ar-date-cell"><time dateTime={r.at} title={absTime(r.at)}>{relTime(r.at)}</time></td>
                    <td className="ar-contact">{contactCell(r)}</td>
                    <td className="muted ar-company">{r.company_name ?? "—"}</td>
                    <td>{typeChip(r.activity)}</td>
                    <td className="muted ar-owner-cell" title={r.owner_email ?? undefined}>{firstName(r)}</td>
                    <td className="ar-summary-cell">{summaryCell(r, true)}{r.attachments.length > 0 && <AttachmentChips items={r.attachments} compact />}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                    No activity matches these filters.{anyFilter && <> <Link href={pathname}>Clear filters</Link></>}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sp-cards ar-cards" style={{ opacity: pending ? 0.6 : 1 }}>
            {rows.map((r) => (
              <div key={r.id} className="card sp-card ar-card">
                <div className="ar-card-top">
                  {typeChip(r.activity)}
                  <time className="muted" dateTime={r.at} title={absTime(r.at)}>{relTime(r.at)}</time>
                  <span className="muted ar-card-owner" title={r.owner_email ?? undefined}>{firstName(r)}</span>
                </div>
                <div className="ar-card-who">
                  <span className="sp-name">{contactCell(r)}</span>
                  {r.company_name && <span className="sp-sub"> · {r.company_name}</span>}
                </div>
                <div className="ar-card-sum">{summaryCell(r, true)}{r.attachments.length > 0 && <AttachmentChips items={r.attachments} compact />}</div>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="card sp-card muted" style={{ textAlign: "center", padding: 20 }}>
                No activity matches these filters.{anyFilter && <> <Link href={pathname}>Clear filters</Link></>}
              </div>
            )}
          </div>

          {(pageCount > 1 || total > pageSize) && <Pager />}
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            {total.toLocaleString()} total · {pageSize} per page · click a summary to expand it
          </p>
        </>
      )}
    </>
  );
}
