"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ContactSummary } from "@/lib/contactSummary";

// AI summary card — sits directly under the detail-page header, above the tabs.
// Server passes the current contact_summaries row (or null); this component
// owns the request/poll lifecycle:
//   none     → POST /api/contact-summary (auto) → "Generating a heads-up…" + 10 s poller
//   pending/generating → poller (max ~2 min, then "Still working — check back")
//   ready    → paragraphs + facts chips + "Updated {rel} · Refresh"
//   error    → "Couldn't generate" + Retry
//   skipped  → renders nothing
// If the agent endpoint is not deployed yet (404 / not_configured) the card says so
// instead of spinning. Collapsible on ≤760 px (CSS), remembered in localStorage.

const POLL_MS = 10_000;
const POLL_MAX_TICKS = 12; // ~2 minutes
const LS_KEY = "pmg.aiSummary.open";

type Phase = "idle" | "requesting" | "polling" | "timeout" | "unavailable";

function relTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Light inline markdown: **bold** only (dates / names). Everything else is text.
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<strong key={i++}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function paragraphs(md: string | null): string[] {
  if (!md) return [];
  return md
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

function Sparkle() {
  return (
    <svg className="ai-sum-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zM5 15.5l.9 2.6 2.6.9-2.6.9L5 22.5l-.9-2.6-2.6-.9 2.6-.9.9-2.6zM19 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z"
      />
    </svg>
  );
}

export default function AISummary({ contactId, initial }: { contactId: string; initial: ContactSummary | null }) {
  const [row, setRow] = useState<ContactSummary | null>(initial);
  const [phase, setPhase] = useState<Phase>("idle");
  const [open, setOpen] = useState(true);
  const [, setNow] = useState(0); // re-render so "Updated x ago" stays fresh
  const ticks = useRef(0);
  const requested = useRef(false);

  // Collapse memory (only matters on mobile — CSS ignores it on desktop).
  useEffect(() => {
    try {
      const v = localStorage.getItem(LS_KEY);
      if (v === "0") setOpen(false);
    } catch {}
  }, []);
  const toggle = () => {
    setOpen((o) => {
      try { localStorage.setItem(LS_KEY, o ? "0" : "1"); } catch {}
      return !o;
    });
  };

  const request = useCallback(async (force: boolean) => {
    setPhase("requesting");
    ticks.current = 0;
    try {
      const r = await fetch("/api/contact-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contactId, force }),
        cache: "no-store",
      });
      if (r.status === 404 || r.status === 502) { setPhase("unavailable"); return; }
      let data: any = null;
      try { data = await r.json(); } catch {}
      if (r.status === 200 && data && data.contact_id && data.status) {
        setRow(data as ContactSummary);
        setPhase("idle");
        return;
      }
      if (!r.ok && r.status !== 202) { setPhase("unavailable"); return; }
      // 202 (or anything else that isn't a full row) → generation in flight.
      setRow((prev) => ({
        contact_id: contactId,
        summary_md: prev?.summary_md ?? null,
        facts: prev?.facts ?? {},
        status: "pending",
        error: null,
        generated_at: prev?.generated_at ?? null,
        updated_at: prev?.updated_at ?? null,
      }));
      setPhase("polling");
    } catch {
      setPhase("unavailable");
    }
  }, [contactId]);

  // First view with no row → request automatically (once).
  useEffect(() => {
    if (initial === null && !requested.current) {
      requested.current = true;
      void request(false);
    } else if (initial && (initial.status === "pending" || initial.status === "generating")) {
      setPhase("polling");
    }
  }, [initial, request]);

  // Poller — 10 s, bounded.
  const inflight = row?.status === "pending" || row?.status === "generating";
  useEffect(() => {
    if (phase !== "polling" || !inflight) return;
    let stopped = false;
    const tick = async () => {
      ticks.current += 1;
      try {
        const r = await fetch(`/api/contact-summary/status?contact_id=${encodeURIComponent(contactId)}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as Partial<ContactSummary> & { status: string | null };
        if (stopped) return;
        if (d.status && d.status !== "pending" && d.status !== "generating") {
          setRow(d as ContactSummary);
          setPhase("idle");
          return;
        }
      } catch {}
      if (!stopped && ticks.current >= POLL_MAX_TICKS) setPhase("timeout");
    };
    const t = setInterval(tick, POLL_MS);
    return () => { stopped = true; clearInterval(t); };
  }, [phase, inflight, contactId]);

  // Keep the relative timestamp honest without a refetch.
  useEffect(() => {
    const t = setInterval(() => setNow((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  if (row?.status === "skipped") return null;

  const paras = paragraphs(row?.summary_md ?? null);
  const facts = row?.facts ?? {};
  const cautions = Array.isArray(facts.cautions) ? facts.cautions.filter(Boolean).slice(0, 3) : [];
  // Split view: last thing WE sent vs last thing THEY sent. Older rows (facts v1)
  // only carry last_contact_*; fall back to that so nothing renders blank.
  const hasSplit = "last_outbound_at" in facts || "last_inbound_at" in facts;
  const wroteBits = hasSplit
    ? ([fmtDate(facts.last_outbound_at), facts.last_outbound_by ?? null, facts.last_outbound_subject ?? null].filter(Boolean) as string[])
    : facts.last_contact_direction === "outbound"
      ? ([fmtDate(facts.last_contact_at), facts.last_contact_by ?? null, facts.last_subject ?? null].filter(Boolean) as string[])
      : [];
  const repliedBits = hasSplit
    ? ([fmtDate(facts.last_inbound_at), facts.last_inbound_subject ?? null].filter(Boolean) as string[])
    : facts.last_contact_direction === "inbound"
      ? ([fmtDate(facts.last_contact_at), facts.last_subject ?? null].filter(Boolean) as string[])
      : [];
  const lastBits = [...wroteBits, ...repliedBits];
  const busy = phase === "requesting" || (phase === "polling" && inflight);
  const showBody = row?.status === "ready" && paras.length > 0;
  const updated = relTime(row?.generated_at ?? row?.updated_at);

  return (
    <section className={`section ai-sum${open ? "" : " is-collapsed"}`} aria-labelledby="ai-summary-title">
      <div className="ai-sum-head">
        <div className="ai-sum-title">
          <Sparkle />
          <p id="ai-summary-title" className="section-title">AI summary</p>
          {busy && <span className="chip chip-queued ai-sum-state"><span className="btn-spin" aria-hidden="true" />Generating</span>}
        </div>
        <div className="ai-sum-actions">
          {updated && !busy && <span className="muted ai-sum-updated">Updated {updated}</span>}
          {!busy && phase !== "unavailable" && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void request(true)}>
              {row?.status === "error" ? "Retry" : "Refresh"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm ai-sum-toggle"
            aria-expanded={open}
            aria-controls="ai-summary-body"
            onClick={toggle}
          >
            {open ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div id="ai-summary-body" className="ai-sum-body">
        {phase === "unavailable" && (
          <p className="help">Summary service not available yet.</p>
        )}

        {phase !== "unavailable" && busy && !showBody && (
          <div className="ai-sum-skel" aria-live="polite">
            <p className="help">Generating a heads-up…</p>
            <span className="skel ai-sum-skel-line" />
            <span className="skel ai-sum-skel-line" />
            <span className="skel ai-sum-skel-line short" />
          </div>
        )}

        {phase === "timeout" && !showBody && (
          <p className="help">Still working — check back in a minute.</p>
        )}

        {row?.status === "error" && !busy && (
          <p className="help ai-sum-error">
            Couldn&apos;t generate{row.error ? ` — ${row.error}` : ""}. Use Retry to try again.
          </p>
        )}

        {showBody && (
          <div className="ai-sum-text">
            {paras.map((p, i) => (
              <p key={i}>{inline(p)}</p>
            ))}
          </div>
        )}

        {(lastBits.length > 0 || facts.next_step || cautions.length > 0) && !busy && (
          <div className="ai-sum-facts">
            {wroteBits.length > 0 && (
              <span className="chip chip-neutral">
                <span className="ai-sum-k">Last we wrote</span> {wroteBits.join(" · ")}
              </span>
            )}
            {(repliedBits.length > 0 || wroteBits.length > 0) && (
              <span className={`chip ${repliedBits.length > 0 ? "chip-ok" : "chip-neutral"}`}>
                <span className="ai-sum-k">Last they replied</span> {repliedBits.length > 0 ? repliedBits.join(" · ") : "no reply yet"}
              </span>
            )}
            {facts.next_step && (
              <span className="chip chip-queued">
                <span className="ai-sum-k">Next step</span> {facts.next_step}
              </span>
            )}
            {cautions.map((c, i) => (
              <span key={i} className="chip chip-warn">{c}</span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
