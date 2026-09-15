"use client";

// ════════════════════════════════════════════════════════════════════════════
// UNIVERSAL ADD CONTACT — MASTER COPY
//
// This file is IDENTICAL, byte for byte, in the delegates, speakers and
// roundtables apps (Syed, 2026-09-15: one button, one function, one format —
// the three apps are due to merge into one). Change it in one app, then copy
// it unchanged to the other two.
//
// Nothing app-specific belongs in this file. What differs per app lives in
// that app's server routes:
//   /api/intake-locate — where "Open record" goes in this app
//   /api/intake-attach — may also write this app's activity log
// The sales app keeps its own copy with the same rules plus what only sales
// needs (the restricted view, prefill from a deal or company page).
//
// The rules, in every app:
//   · LinkedIn URL only — the server pulls name, title and company.
//   · Brand, edition and role are REQUIRED picks. Nothing is preselected: a
//     default is how contacts were silently mis-tagged (e.g. everything
//     landing in "10DX Kenya 2027").
//   · An exact LinkedIn match blocks a new record; the existing one can be
//     added to the chosen edition instead. There is no "add anyway": the same
//     LinkedIn URL is the same person.
//   · A same-name-same-company match is shown first; submitting anyway sends
//     it to review, never straight in.
//   · PMG Roundtables takes no sponsors (Syed, 2026-09-15): the Sponsor role is
//     not offered for that brand. Every other role is.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type DupContact = {
  id: string;
  full_name_clean?: string | null;
  job_title?: string | null;
  company_name?: string | null;
  event_brand?: string | null;
  participant_type?: string | null;
};

type SoftMatch = { id: string; full_name_clean?: string | null; job_title?: string | null; company_name?: string | null };

type CheckResult =
  | { duplicate: true; contact: DupContact }
  | { duplicate: false; pending_intake: boolean; soft_matches?: SoftMatch[] };

type HydratedCard = {
  id?: string;
  full_name_clean?: string | null;
  job_title?: string | null;
  company_name?: string | null;
  profile_image_url?: string | null;
};

type SubmitOutcome =
  | { outcome: "added"; contact_id: string; contact?: HydratedCard; gates?: Record<string, unknown> }
  | { outcome: "pending_review"; request_id: string; gates?: Record<string, unknown>; duplicate_candidates?: unknown[]; reason?: { code?: string; text?: string } | null }
  | { outcome: "duplicate"; contact: DupContact }
  | { outcome: "attached"; contact_id?: string; contact: HydratedCard; already_existed?: boolean };

// Where a CRM contact lives in THIS app (see /api/intake-locate).
type Locate = { href: string | null; kind?: string; edition?: string | null; role_id?: string | null };

// One row of the Edition select (see /api/intake-events). client_roundtable:
// a single client's roundtable — no sponsor can be recorded against it.
type EventOption = { id: string; name: string; client_roundtable?: boolean };

type IntakeRequest = {
  id: string;
  linkedin_url: string;
  event_brand: string;
  participant_type: string;
  status: "pending" | "approved" | "merged" | "rejected" | "auto_approved";
  reject_reason?: string | null;
  created_at: string;
  hydrated?: { full_name_clean?: string; job_title?: string; company_name?: string } | null;
};

// ─── Brand/Role constants ─────────────────────────────────────────────────────

const BRANDS = ["10DX", "VERIFY", "4WARD", "PMG Roundtables"] as const;
type Brand = (typeof BRANDS)[number];

const ROLES = ["Delegate", "Speaker", "Sponsor", "Moderator", "Emcee", "Media", "VIP"] as const;
type Role = (typeof ROLES)[number];

// PMG Roundtables takes no sponsors (Syed, 2026-09-15) — every other role.
const rolesFor = (brand: Brand | ""): readonly Role[] =>
  brand === "PMG Roundtables" ? ROLES.filter((r) => r !== "Sponsor") : ROLES;

// Progress card steps (the server does all three inside ONE request; the ticks
// advance on a timer so the wait reads as progress, and all complete on reply).
const STEPS = ["Pulling profile", "Checking duplicates", "Creating record"] as const;
const STEP_MS = [0, 2600, 5200];

// Human reason for "saved for review" from the agent's gate results.
function reviewReason(gates?: Record<string, unknown>, reason?: { code?: string; text?: string } | null): string {
  // Prefer the server's own decision reason (policy v2); gate-derived text is the fallback.
  if (reason?.text) return reason.text.replace(/\s*—\s*held for review\.?$/i, "").replace(/\.$/, "");
  if (!gates) return "needs a reviewer’s eyes";
  const bad: string[] = [];
  const g = gates as Record<string, string | unknown[]>;
  if (g.hydration && g.hydration !== "ok" && g.hydration !== "ok_holding_edition") bad.push("profile couldn’t be pulled");
  if (g.name && g.name !== "ok") bad.push("name needs cleaning");
  if (g.title && g.title !== "ok") bad.push(g.title === "missing" ? "no job title" : "job title needs cleaning");
  if (g.company && g.company !== "ok") bad.push("company couldn’t be resolved");
  if (Array.isArray(g.fuzzy_dup) && g.fuzzy_dup.length) bad.push("possible duplicate");
  if (g.quality && g.quality !== "ok") bad.push("data quality flags");
  return bad.length ? bad.join(", ") : "needs a reviewer’s eyes";
}

// ─── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: IntakeRequest["status"] }) {
  const map: Record<IntakeRequest["status"], { label: string; cls: string }> = {
    pending: { label: "Pending", cls: "badge-warn" },
    approved: { label: "Added", cls: "badge-success" },
    auto_approved: { label: "Added", cls: "badge-success" },
    merged: { label: "Merged", cls: "badge-success" },
    rejected: { label: "Rejected", cls: "badge" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "badge" };
  return <span className={`badge ${cls}`}>{label}</span>;
}

function Person({ c }: { c: { full_name_clean?: string | null; job_title?: string | null; company_name?: string | null } }) {
  return (
    <>
      <div style={{ fontWeight: 600 }}>{c.full_name_clean ?? "—"}</div>
      <div className="muted" style={{ fontSize: 13 }}>
        {[c.job_title, c.company_name].filter(Boolean).join(" · ") || "—"}
      </div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AddContactForm() {
  const router = useRouter();

  // Form fields — all three selects start empty on purpose (see header).
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [brand, setBrand] = useState<Brand | "">("");
  const [eventId, setEventId] = useState<string>("");
  const [role, setRole] = useState<Role | "">("");
  const [note, setNote] = useState("");

  // Duplicate check state
  const [checkState, setCheckState] = useState<
    | { status: "idle" }
    | { status: "checking" }
    | { status: "clear"; soft: SoftMatch[] }
    | { status: "dup"; contact: DupContact }
    | { status: "pending_intake" }
    | { status: "error" }
  >({ status: "idle" });
  // Where each matched contact lives in this app (by contact id).
  const [located, setLocated] = useState<Record<string, Locate | undefined>>({});

  // Edition list
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(false);

  // Submit / holding pattern
  const [phase, setPhase] = useState<"form" | "working" | "done">("form");
  const [workingName, setWorkingName] = useState<string | null>(null);
  const [workingWhat, setWorkingWhat] = useState<"add" | "attach">("add");
  const [stepDone, setStepDone] = useState(0); // how many steps ticked
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The edition + role the last add went to (the form resets after a success).
  const [doneWhere, setDoneWhere] = useState<{ edition: string; role: string } | null>(null);

  // My submissions
  const [submissions, setSubmissions] = useState<IntakeRequest[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Load my submissions on mount ──────────────────────────────────────────
  const loadSubmissions = useCallback(async () => {
    try {
      const res = await fetch("/api/my-intake");
      if (res.ok) {
        const data = await res.json();
        setSubmissions(Array.isArray(data.requests) ? data.requests : Array.isArray(data) ? data : []);
      }
    } catch {
      // non-critical
    } finally {
      setSubmissionsLoading(false);
    }
  }, []);
  useEffect(() => { loadSubmissions(); }, [loadSubmissions]);

  // A role the chosen brand does not take is cleared, never kept silently.
  useEffect(() => {
    if (role && !rolesFor(brand).includes(role)) setRole("");
  }, [brand, role]);

  // ── Fetch editions when brand changes ──────────────────────────────────────
  useEffect(() => {
    setEventId("");
    setEvents([]);
    setEventsError(false);
    if (!brand) return;
    // Stale-response guard: rapid brand switches can resolve out of order.
    let cancelled = false;
    setEventsLoading(true);
    fetch(`/api/intake-events?brand=${encodeURIComponent(brand)}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const raw: any[] = Array.isArray(data?.events) ? data.events : [];
        setEvents(raw.map((e) => ({ id: String(e.id), name: String(e.name ?? ""), client_roundtable: e.client_roundtable === true })));
        if (data?.error) setEventsError(true);
      })
      .catch(() => { if (!cancelled) { setEvents([]); setEventsError(true); } })
      .finally(() => { if (!cancelled) setEventsLoading(false); });
    return () => { cancelled = true; };
  }, [brand]);

  // ── Locate a CRM contact inside this app (for "Open record") ──────────────
  const locate = useCallback(async (contactId: string, extra?: { event_id?: string; participant_type?: string }): Promise<Locate> => {
    try {
      const r = await fetch("/api/intake-locate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contactId, ...(extra ?? {}) }),
      });
      if (!r.ok) return { href: null };
      return (await r.json()) as Locate;
    } catch {
      return { href: null };
    }
  }, []);
  const locateMany = useCallback((ids: string[]) => {
    ids.forEach(async (id) => {
      const l = await locate(id);
      setLocated((m) => ({ ...m, [id]: l }));
    });
  }, [locate]);

  // ── Debounced dup check ────────────────────────────────────────────────────
  const runCheck = useCallback(async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed || !trimmed.includes("linkedin")) { setCheckState({ status: "idle" }); return; }
    setCheckState({ status: "checking" });
    try {
      const res = await fetch("/api/intake-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedin_url: trimmed }),
      });
      if (!res.ok) { setCheckState({ status: "error" }); return; }
      const data: CheckResult = await res.json();
      if (data.duplicate) {
        setCheckState({ status: "dup", contact: data.contact });
        locateMany([data.contact.id]);
      } else if (data.pending_intake) {
        setCheckState({ status: "pending_intake" });
      } else {
        const soft = Array.isArray(data.soft_matches) ? data.soft_matches.slice(0, 5) : [];
        setCheckState({ status: "clear", soft });
        if (soft.length) locateMany(soft.map((s) => s.id));
      }
    } catch {
      setCheckState({ status: "error" });
    }
  }, [locateMany]);

  const handleLinkedinBlur = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    runCheck(linkedinUrl);
  };
  const handleLinkedinChange = (v: string) => {
    setLinkedinUrl(v);
    setCheckState({ status: "idle" });
    setOutcome(null);
    setSubmitError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runCheck(v), 700);
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const selectedEvent = events.find((e) => e.id === eventId);
  const editionLabel = () => selectedEvent?.name ?? "the selected edition";
  // Syed, 2026-09-15: no sponsor on a roundtable (pmg-agent
  // lib/events/sponsor-eligibility). rolesFor already hides Sponsor for PMG
  // Roundtables; this also catches a roundtable filed under a summit brand.
  const sponsorBlocked = role === "Sponsor" && (brand === "PMG Roundtables" || !!selectedEvent?.client_roundtable);
  // What still has to be picked before anything can be written.
  const missingPicks = [!brand && "brand", !eventId && "edition", !role && "role"].filter(Boolean) as string[];
  const picksReady = missingPicks.length === 0 && !sponsorBlocked;

  const startWorking = (name: string | null, what: "add" | "attach") => {
    setWorkingName(name);
    setWorkingWhat(what);
    setStepDone(0);
    setPhase("working");
    setOutcome(null);
    setSubmitError(null);
    stepTimers.current.forEach(clearTimeout);
    stepTimers.current = STEP_MS.slice(1).map((ms, i) => setTimeout(() => setStepDone((n) => Math.max(n, i + 1)), ms));
  };
  const stopWorking = () => {
    stepTimers.current.forEach(clearTimeout);
    stepTimers.current = [];
  };
  useEffect(() => () => stopWorking(), []);

  // Brand, edition and role stay as they were — the next person is usually
  // for the same edition. Only the person-specific fields clear.
  const resetForm = () => {
    setLinkedinUrl("");
    setNote("");
    setCheckState({ status: "idle" });
  };

  // Land on the new/attached record with a flash message, or fall back to an
  // in-place success card when it has no page in this app.
  const landOnRecord = async (contactId: string, name: string | null, verb: string): Promise<boolean> => {
    const l = await locate(contactId, { event_id: eventId, participant_type: role });
    if (!l.href) return false;
    const msg = `${verb} — ${name ?? "Contact"} added to ${l.edition ?? editionLabel()} as ${role}`;
    router.push(`${l.href}?flash=ok&msg=${encodeURIComponent(msg)}`);
    return true;
  };

  // ── Submit (new contact) ───────────────────────────────────────────────────
  const submit = async () => {
    if (busy || !picksReady) return;
    if (checkState.status === "dup") return; // hard stop — use the existing record
    setBusy(true);
    startWorking(null, "add");
    setDoneWhere({ edition: editionLabel(), role });
    try {
      const res = await fetch("/api/intake-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkedin_url: linkedinUrl.trim(),
          event_brand: brand,
          event_id: eventId,
          participant_type: role,
          note: note.trim() || undefined,
        }),
      });
      const data: SubmitOutcome | { error?: string } | null = await res.json().catch(() => null);
      stopWorking();
      setStepDone(STEPS.length);
      if (!res.ok || !data || !("outcome" in data) || !data.outcome) {
        const msg = data && "error" in data && typeof data.error === "string" ? data.error : "server unreachable";
        setSubmitError(`Submission failed (${msg}). Nothing was saved — please try again.`);
        setPhase("form");
        return;
      }

      if (data.outcome === "added") {
        const name = data.contact?.full_name_clean ?? null;
        const landed = await landOnRecord(data.contact_id, name, "Contact created");
        if (landed) return; // navigating away
        setOutcome(data);
        setPhase("done");
        resetForm();
        loadSubmissions();
        return;
      }
      if (data.outcome === "pending_review") {
        setOutcome(data);
        setPhase("done");
        resetForm();
        loadSubmissions();
        return;
      }
      if (data.outcome === "duplicate") {
        // Server-side dup (race or the pre-check didn't run) → same callout as the live check.
        setCheckState({ status: "dup", contact: data.contact });
        locateMany([data.contact.id]);
        setPhase("form");
        return;
      }
      setOutcome(data);
      setPhase("done");
    } catch {
      stopWorking();
      setSubmitError("Submission failed (network error). Nothing was saved — please try again.");
      setPhase("form");
    } finally {
      setBusy(false);
    }
  };

  // ── Attach an existing contact to the chosen edition + role ───────────────
  const attach = async (contact: { id: string; full_name_clean?: string | null }) => {
    if (busy || !picksReady) return;
    setBusy(true);
    startWorking(contact.full_name_clean ?? null, "attach");
    setStepDone(2); // nothing to pull/check — only the role row is created
    setDoneWhere({ edition: editionLabel(), role });
    try {
      const res = await fetch("/api/intake-attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contact.id,
          event_brand: brand,
          event_id: eventId,
          participant_type: role,
        }),
      });
      const data = await res.json().catch(() => null);
      stopWorking();
      setStepDone(STEPS.length);
      if (!res.ok || !data || data.outcome !== "attached") {
        const msg = data && typeof data.error === "string" ? data.error : "server error";
        setSubmitError(`Couldn’t add to the edition (${msg}).`);
        setPhase("form");
        return;
      }
      const name = data.contact?.full_name_clean ?? contact.full_name_clean ?? null;
      const landed = await landOnRecord(contact.id, name, data.already_existed ? "Already on this edition" : "Added");
      if (landed) return;
      setOutcome(data as SubmitOutcome);
      setPhase("done");
      resetForm();
    } catch {
      stopWorking();
      setSubmitError("Couldn’t add to the edition (network error).");
      setPhase("form");
    } finally {
      setBusy(false);
    }
  };

  // ── Derived flags ──────────────────────────────────────────────────────────
  const isDup = checkState.status === "dup";
  const submitDisabled = busy || isDup || !linkedinUrl.trim() || checkState.status === "checking" || !picksReady;
  const picksHint =
    missingPicks.length > 0
      ? `Pick the ${missingPicks.join(", ").replace(/, ([^,]*)$/, " and $1")} below to enable this.`
      : sponsorBlocked
      ? "A roundtable can’t have a sponsor — pick another role or edition."
      : null;

  // ── "Open record" control for a matched contact ───────────────────────────
  const OpenRecord = ({ id }: { id: string }) => {
    const l = located[id];
    if (l === undefined) return <span className="muted" style={{ fontSize: 12 }}>Locating…</span>;
    if (l.href) {
      return (
        <a className="btn btn-sm" href={l.href} target="_blank" rel="noreferrer">
          Open record{l.edition ? ` · ${l.edition}` : ""}
        </a>
      );
    }
    return (
      <button type="button" className="btn btn-sm" disabled title="This person is in the CRM but has no page you can open in this app">
        In CRM · no page in this app
      </button>
    );
  };

  // ── Holding pattern card ───────────────────────────────────────────────────
  if (phase === "working") {
    const who = workingName ?? "contact";
    return (
      <div className="card section" role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="btn-spin" aria-hidden style={{ width: 18, height: 18, borderWidth: 3 }} />
          <div style={{ fontWeight: 600 }}>{workingWhat === "attach" ? `Adding ${who} to ${editionLabel()}…` : `Adding ${who}…`}</div>
        </div>
        <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {STEPS.map((label, i) => {
            const done = i < stepDone;
            const active = i === stepDone;
            return (
              <li key={label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, opacity: done || active ? 1 : 0.5 }}>
                <span aria-hidden style={{ width: 18, textAlign: "center", color: done ? "var(--success)" : "var(--muted)" }}>
                  {done ? "✓" : active ? "…" : "○"}
                </span>
                <span>{label}{active ? "…" : ""}</span>
              </li>
            );
          })}
        </ol>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>This usually takes 5–15 seconds. You’ll be taken to the record when it’s ready.</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {phase === "done" && outcome && (
        <div style={{ marginBottom: 20 }}>
          {outcome.outcome === "added" && (
            <div className="card section" style={{ borderColor: "#8ecfbe", background: "#edfaf5" }}>
              <div style={{ fontWeight: 600, color: "var(--success)", marginBottom: 4 }}>Contact created</div>
              {outcome.contact && (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {outcome.contact.profile_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={outcome.contact.profile_image_url} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
                  )}
                  <div><Person c={outcome.contact} /></div>
                </div>
              )}
              <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
                Added to {doneWhere?.edition ?? "the edition"} as {doneWhere?.role ?? "selected role"}. There’s no page for it in this app.
              </p>
            </div>
          )}
          {outcome.outcome === "pending_review" && (
            <div className="card section" style={{ borderColor: "#f0d9a0", background: "#fff9e8" }}>
              <div style={{ fontWeight: 600, color: "var(--warn)", marginBottom: 4 }}>Saved for review — {reviewReason(outcome.gates, outcome.reason)}</div>
              <p style={{ fontSize: 13, margin: 0 }}>
                Syed will approve, merge, or reject it. Track it under <a href="#my-submissions">My Submissions</a>.
                {Array.isArray(outcome.duplicate_candidates) && outcome.duplicate_candidates.length > 0 && (
                  <>
                    {" "}{outcome.duplicate_candidates.length} possible match{outcome.duplicate_candidates.length === 1 ? "" : "es"} already
                    in the CRM will be checked first — no need to re-submit.
                  </>
                )}
              </p>
            </div>
          )}
          {outcome.outcome === "attached" && (
            <div className="card section" style={{ borderColor: "#8ecfbe", background: "#edfaf5" }}>
              <div style={{ fontWeight: 600, color: "var(--success)", marginBottom: 4 }}>
                {outcome.already_existed ? "Already on this edition" : "Added to edition"}
              </div>
              <Person c={outcome.contact} />
            </div>
          )}
          <button type="button" className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => { setPhase("form"); setOutcome(null); }}>
            Add another
          </button>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* LinkedIn URL */}
        <div>
          <label htmlFor="linkedin_url">LinkedIn Profile URL</label>
          <input
            id="linkedin_url"
            type="url"
            placeholder="https://www.linkedin.com/in/example/"
            value={linkedinUrl}
            onChange={(e) => handleLinkedinChange(e.target.value)}
            onBlur={handleLinkedinBlur}
            autoComplete="off"
            style={isDup ? { borderColor: "#c0392b" } : checkState.status === "clear" ? { borderColor: "var(--success)" } : {}}
          />
          {checkState.status === "checking" && <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Checking…</p>}
          {checkState.status === "pending_intake" && (
            <div className="flash flash-warn" style={{ marginTop: 8 }}>Already submitted — this contact is awaiting review.</div>
          )}
          {checkState.status === "error" && (
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Could not check (server unreachable). You may still submit.</p>
          )}
        </div>

        {/* Exact LinkedIn match — blocks a new record */}
        {checkState.status === "dup" && (
          <div className="card section" role="alert" style={{ borderColor: "#e8b4b4", background: "#fff5f5" }}>
            <div style={{ color: "#c0392b", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Already in the CRM</div>
            <Person c={checkState.contact} />
            {(checkState.contact.event_brand || checkState.contact.participant_type) && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {[checkState.contact.event_brand, checkState.contact.participant_type].filter(Boolean).join(" › ")}
              </div>
            )}
            <p style={{ fontSize: 13, color: "#c0392b", margin: "8px 0 0" }}>
              A new record can’t be created for the same LinkedIn profile — add this one to the edition instead.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
              <OpenRecord id={checkState.contact.id} />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => attach(checkState.contact)} disabled={busy || !picksReady}>
                {picksReady ? `Add to ${editionLabel()} · as ${role}` : "Add to the edition instead"}
              </button>
            </div>
            {picksHint && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{picksHint}</p>}
          </div>
        )}

        {/* Soft matches (same name + company, different/missing LinkedIn) */}
        {checkState.status === "clear" && checkState.soft.length > 0 && (
          <div className="card section" style={{ borderColor: "#f0d9a0", background: "#fff9e8" }}>
            <div style={{ color: "var(--warn)", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              Possible match{checkState.soft.length > 1 ? "es" : ""} already in the CRM
            </div>
            <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
              Same name and company, different (or no) LinkedIn URL. If it’s the same person, attach instead of creating a duplicate.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {checkState.soft.map((m) => (
                <div key={m.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ minWidth: 160 }}><Person c={m} /></div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <OpenRecord id={m.id} />
                    <button type="button" className="btn btn-sm" onClick={() => attach(m)} disabled={busy || !picksReady}>Attach instead</button>
                  </div>
                </div>
              ))}
            </div>
            <p className="help" style={{ marginTop: 8 }}>
              Not them? Submit below — because of the match, a reviewer checks it before it’s added.
            </p>
            {picksHint && <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>{picksHint}</p>}
          </div>
        )}

        {/* Brand select */}
        <div>
          <label htmlFor="brand">Brand</label>
          <select id="brand" value={brand} onChange={(e) => setBrand(e.target.value as Brand | "")}>
            <option value="">Select brand…</option>
            {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        {/* Edition select — for PMG Roundtables this lists the roundtables themselves */}
        <div>
          <label htmlFor="event_id">{brand === "PMG Roundtables" ? "Roundtable" : "Edition"}</label>
          <select id="event_id" value={eventId} onChange={(e) => setEventId(e.target.value)} disabled={!brand || eventsLoading}>
            {!brand && <option value="">Select a brand first</option>}
            {brand && eventsLoading && <option value="">Loading…</option>}
            {brand && !eventsLoading && events.length === 0 && <option value="">No upcoming editions</option>}
            {brand && !eventsLoading && events.length > 0 && (
              <option value="">{brand === "PMG Roundtables" ? "Select roundtable…" : "Select edition…"}</option>
            )}
            {brand && !eventsLoading && events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
          {brand && !eventsLoading && events.length === 0 && (
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {eventsError
                ? "Couldn’t load editions — reload the page to try again."
                : brand === "PMG Roundtables"
                ? "No upcoming roundtable you can add to (roundtables are limited to your markets)."
                : "No upcoming edition for this brand."}
            </p>
          )}
        </div>

        {/* Role select */}
        <div>
          <label htmlFor="role">Role</label>
          <select id="role" value={role} onChange={(e) => setRole(e.target.value as Role | "")}>
            <option value="">Select role…</option>
            {rolesFor(brand).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {brand === "PMG Roundtables" && (
            <p className="help" style={{ marginTop: 4 }}>Roundtables take no sponsors, so Sponsor isn’t offered here.</p>
          )}
          {sponsorBlocked && brand !== "PMG Roundtables" && (
            <p className="muted" style={{ fontSize: 12, marginTop: 4, color: "#c0392b" }}>
              {editionLabel()} is a roundtable — no sponsor can be added to it.
            </p>
          )}
        </div>

        {/* Optional note */}
        <div>
          <label htmlFor="note">Note (optional)</label>
          <input id="note" type="text" placeholder="e.g. met at IAFPC Jakarta" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitDisabled} aria-busy={busy} style={{ alignSelf: "flex-start", minWidth: 120 }}>
          {busy ? "Submitting…" : "Add contact"}
        </button>
      </form>

      {submitError && <div className="flash flash-warn" style={{ marginTop: 20 }} role="alert">{submitError}</div>}

      {/* ── My Submissions ────────────────────────────────────────────────── */}
      <div id="my-submissions" style={{ marginTop: 36 }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>My Submissions</h3>
        {submissionsLoading && <p className="muted" style={{ fontSize: 13 }}>Loading…</p>}
        {!submissionsLoading && submissions.length === 0 && (
          <p className="muted" style={{ fontSize: 13 }}>No submissions yet. Use the form above to add a contact.</p>
        )}
        {!submissionsLoading && submissions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {submissions.map((s) => {
              const name = s.hydrated?.full_name_clean;
              const title = s.hydrated?.job_title;
              const company = s.hydrated?.company_name;
              return (
                <div key={s.id} className="card section" style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{name ?? <span className="muted">Pending enrichment</span>}</div>
                    {(title || company) && <div className="muted" style={{ fontSize: 13 }}>{[title, company].filter(Boolean).join(" · ")}</div>}
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{s.event_brand} › {s.participant_type}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2, wordBreak: "break-all" }}>{s.linkedin_url}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <StatusChip status={s.status} />
                    {s.status === "rejected" && s.reject_reason && (
                      <div style={{ fontSize: 12, color: "#c0392b", maxWidth: 200, textAlign: "right" }}>{s.reject_reason}</div>
                    )}
                    <div className="muted" style={{ fontSize: 11 }}>
                      {new Date(s.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
