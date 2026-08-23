"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ContactSummary, TimelineItem } from "@/lib/contactSummary";
import { transcriptInFlight, type ContactNoteLite } from "@/lib/notes";
import AttachmentChips from "../../AttachmentChips";

// Activity timeline — the "Contact History" tab. Renders contact_summaries.timeline
// (newest first, ≤ 40 items) from the SAME row the AI summary card uses, so it shares
// that row's lifecycle:
//   no row            → POST /api/contact-summary (auto, once) → skeleton + 10 s poller
//   pending/generating → skeleton + poller (bounded, then "Still working")
//   ready, []          → "No activity recorded yet."
//   ready, items       → the list
//   error              → "Couldn't build the timeline — Retry"
//   skipped            → "No activity recorded yet."
// "Refresh" → POST {force:true} (the same summary job regenerates both).
// Mounted lazily by ProfileTabs (only once the tab is opened), so it re-reads
// the status route on mount to pick up anything generated since page load.

const POLL_MS = 10_000;
const POLL_MAX_TICKS = 12;
const STATUS_URL = (id: string) => `/api/contact-summary/status?contact_id=${encodeURIComponent(id)}`;
// Voice-note transcripts: light 15 s poll ONLY while a note on this page is
// pending/processing, capped at 10 min.
const TX_POLL_MS = 15_000;
const TX_POLL_MAX_TICKS = 40;
const TX_URL = (ids: string[]) => `/api/notes/transcript?ids=${encodeURIComponent(ids.join(","))}`;
// Rows are text only — no Gmail / JustCall / Granola deep links (Addendum 2).

type Phase = "idle" | "requesting" | "polling" | "timeout" | "unavailable";

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
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

// Badge text per item. Email direction decides SENT / REPLIED; a non-contact
// inbound party (another recipient on the thread) is THREAD.
function badgeOf(it: TimelineItem): { text: string; cls: string } {
  switch (it.channel) {
    case "call": return { text: "CALL", cls: "atl-b-call" };
    case "meeting": return { text: "MEETING", cls: "atl-b-meeting" };
    case "stage": return { text: "STAGE", cls: "atl-b-stage" };
    case "instantly": return { text: "INSTANTLY", cls: "atl-b-instantly" };
    case "note": return { text: "NOTE", cls: "atl-b-note" };
    case "linkedin": return { text: "LINKEDIN", cls: "atl-b-note" };
    case "email":
    default: {
      if (it.direction === "outbound") return { text: "SENT", cls: "atl-b-sent" };
      if (it.direction === "inbound") {
        const t = (it.title ?? "").toLowerCase();
        return t.includes("thread") || t.includes("other recipient")
          ? { text: "THREAD", cls: "atl-b-thread" }
          : { text: "REPLIED", cls: "atl-b-replied" };
      }
      return { text: "EMAIL", cls: "atl-b-thread" };
    }
  }
}

// Inline channel glyphs (currentColor, 16px).
function Icon({ channel }: { channel: TimelineItem["channel"] }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, focusable: "false" as const };
  switch (channel) {
    case "call":
      return <svg {...common}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>;
    case "meeting":
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>;
    case "instantly":
      return <svg {...common}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></svg>;
    case "stage":
      return <svg {...common}><path d="M5 21V4" /><path d="M5 4h13l-2.5 4L18 12H5" /></svg>;
    case "note":
      return <svg {...common}><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>;
    case "linkedin":
      return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 11v6M8 8v.01M12 17v-3.5a2 2 0 0 1 4 0V17M12 11v6" /></svg>;
    case "email":
    default:
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
  }
}

function Row({ it, note, canRetry }: { it: TimelineItem; note: ContactNoteLite | null; canRetry: boolean }) {
  const attachments = note?.attachments ?? [];
  const badge = badgeOf(it);
  const byLine = [it.by, it.participants && it.participants.length ? it.participants.join(", ") : null].filter(Boolean).join(" · ");
  return (
    <li className={`atl-row atl-${it.channel}`}>
      <span className="atl-icon"><Icon channel={it.channel} /></span>
      <div className="atl-body">
        <div className="atl-meta">
          <time className="atl-date" dateTime={it.at} title={absTime(it.at)}>{relTime(it.at)}</time>
          <span className={`atl-badge ${badge.cls}`}>{badge.text}</span>
          {byLine && <span className="atl-by muted">{byLine}</span>}
        </div>
        <div className="atl-title">{it.title}</div>
        {it.summary && <p className="atl-summary muted">{it.summary}</p>}
        {it.outcome && (
          <div className="atl-foot">
            <span className="chip chip-neutral atl-outcome">{it.outcome}</span>
          </div>
        )}
        {note && attachments.length > 0 && (
          <AttachmentChips
            items={attachments}
            transcript={note.transcript_status ? { noteId: note.id, status: note.transcript_status, text: note.transcript, canRetry } : null}
          />
        )}
      </div>
    </li>
  );
}

// Manual-note attachments are matched to note rows by timestamp (the
// generated timeline carries no note id) — ±2 min tolerance.
function noteFor(it: TimelineItem, notes: ContactNoteLite[]): ContactNoteLite | null {
  if (it.channel !== "note" || notes.length === 0) return null;
  const t = new Date(it.at).getTime();
  if (Number.isNaN(t)) return null;
  return notes.find((n) => Math.abs(new Date(n.created_at).getTime() - t) < 120_000) ?? null;
}

// viewerEmail / viewerElevated: who may Retry a failed transcript (admin /
// reviewer → any note; otherwise only the note's author). Enforced server-side too.
export default function ActivityTimeline({ contactId, initial, noteAttachments = [], viewerEmail = "", viewerElevated = false }: { contactId: string; initial: ContactSummary | null; noteAttachments?: ContactNoteLite[]; viewerEmail?: string; viewerElevated?: boolean }) {
  const [row, setRow] = useState<ContactSummary | null>(initial);
  const [phase, setPhase] = useState<Phase>("idle");
  const ticks = useRef(0);
  const requested = useRef(false);

  // Manual notes (attachments + transcript state). Re-synced when the server
  // component re-renders (router.refresh after Log activity) and refreshed by
  // the transcript poller while any note is in flight.
  const [notes, setNotes] = useState<ContactNoteLite[]>(noteAttachments);
  useEffect(() => { setNotes(noteAttachments); }, [noteAttachments]);
  const txTicks = useRef(0);
  const txPending = notes.some((n) => transcriptInFlight(n.transcript_status));
  useEffect(() => {
    if (!txPending) { txTicks.current = 0; return; }
    let stopped = false;
    const tick = async () => {
      txTicks.current += 1;
      const ids = notes.filter((n) => transcriptInFlight(n.transcript_status)).map((n) => n.id);
      if (ids.length === 0) return;
      try {
        const r = await fetch(TX_URL(ids), { cache: "no-store" });
        if (!r.ok || stopped) return;
        const d = await r.json();
        const got: { note_id: string; status: ContactNoteLite["transcript_status"]; text: string | null }[] = Array.isArray(d?.notes) ? d.notes : [];
        if (!got.length || stopped) return;
        setNotes((prev) => {
          let changed = false;
          const next = prev.map((n) => {
            const g = got.find((x) => x.note_id === n.id);
            if (!g || (g.status === n.transcript_status && (g.text ?? null) === n.transcript)) return n;
            changed = true;
            return { ...n, transcript_status: g.status, transcript: g.text ?? null };
          });
          return changed ? next : prev;
        });
      } catch {}
      if (!stopped && txTicks.current >= TX_POLL_MAX_TICKS) clearInterval(t);
    };
    const t = setInterval(tick, TX_POLL_MS);
    return () => { stopped = true; clearInterval(t); };
  }, [txPending, notes]);
  const canRetryFor = (n: ContactNoteLite | null) => !!n && (viewerElevated || (!!viewerEmail && !!n.author_email && n.author_email.toLowerCase() === viewerEmail.toLowerCase()));

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
        setRow({ ...(data as ContactSummary), timeline: Array.isArray(data.timeline) ? data.timeline : [] });
        setPhase("idle");
        return;
      }
      if (!r.ok && r.status !== 202) { setPhase("unavailable"); return; }
      setRow((prev) => ({
        contact_id: contactId,
        summary_md: prev?.summary_md ?? null,
        facts: prev?.facts ?? {},
        timeline: prev?.timeline ?? [],
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

  // On mount: re-read the row (the tab mounts late — the card may already have
  // triggered a generation), then auto-request once if there is still no row.
  useEffect(() => {
    let alive = true;
    (async () => {
      let current: ContactSummary | null = initial;
      try {
        const r = await fetch(STATUS_URL(contactId), { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          if (d && d.status) {
            current = { ...(d as ContactSummary), timeline: Array.isArray(d.timeline) ? d.timeline : [] };
            if (alive) setRow(current);
          }
        }
      } catch {}
      if (!alive) return;
      if (current === null) {
        if (!requested.current) { requested.current = true; void request(false); }
      } else if (current.status === "pending" || current.status === "generating") {
        setPhase("polling");
      }
    })();
    return () => { alive = false; };
  }, [contactId, initial, request]);

  const inflight = row?.status === "pending" || row?.status === "generating";
  useEffect(() => {
    if (phase !== "polling" || !inflight) return;
    let stopped = false;
    const tick = async () => {
      ticks.current += 1;
      try {
        const r = await fetch(STATUS_URL(contactId), { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (stopped) return;
        if (d.status && d.status !== "pending" && d.status !== "generating") {
          setRow({ ...(d as ContactSummary), timeline: Array.isArray(d.timeline) ? d.timeline : [] });
          setPhase("idle");
          return;
        }
      } catch {}
      if (!stopped && ticks.current >= POLL_MAX_TICKS) setPhase("timeout");
    };
    const t = setInterval(tick, POLL_MS);
    return () => { stopped = true; clearInterval(t); };
  }, [phase, inflight, contactId]);

  const items = row?.timeline ?? [];
  const busy = phase === "requesting" || (phase === "polling" && inflight);
  const hasItems = items.length > 0;
  const ready = row?.status === "ready" || row?.status === "skipped";

  return (
    <section className="atl" aria-labelledby="atl-title">
      <div className="section-head">
        <div>
          <p id="atl-title" className="section-title">Activity timeline</p>
          <p className="section-sub">Emails, calls, meetings, campaign touches and stage moves — newest first.</p>
        </div>
        <div className="atl-actions">
          {busy && <span className="chip chip-queued atl-state"><span className="btn-spin" aria-hidden="true" />Updating</span>}
          {!busy && phase !== "unavailable" && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void request(true)}>
              {row?.status === "error" ? "Retry" : "Refresh"}
            </button>
          )}
        </div>
      </div>

      {phase === "unavailable" && <p className="help">Activity service not available yet.</p>}

      {phase !== "unavailable" && busy && !hasItems && (
        <div className="atl-skel" aria-live="polite">
          <p className="help">Building the timeline…</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="atl-skel-row">
              <span className="skel atl-skel-dot" />
              <div className="atl-skel-lines">
                <span className="skel atl-skel-line short" />
                <span className="skel atl-skel-line" />
              </div>
            </div>
          ))}
        </div>
      )}

      {phase === "timeout" && !hasItems && <p className="help">Still working — check back in a minute.</p>}

      {row?.status === "error" && !busy && (
        <p className="help atl-error">
          Couldn&apos;t build the timeline{row.error ? ` — ${row.error}` : ""}. Use Retry to try again.
        </p>
      )}

      {!busy && ready && !hasItems && phase !== "unavailable" && (
        <p className="muted" style={{ fontSize: 13 }}>No activity recorded yet.</p>
      )}

      {hasItems && (
        <ol className="atl-list">
          {items.map((it, i) => { const n = noteFor(it, notes); return <Row key={`${it.at}-${i}`} it={it} note={n} canRetry={canRetryFor(n)} />; })}
        </ol>
      )}
    </section>
  );
}
