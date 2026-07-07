"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type CheckResult =
  | { duplicate: true; pending_intake?: never; contact: DupContact }
  | { duplicate: false; pending_intake: true; contact?: never }
  | { duplicate: false; pending_intake: false; contact?: never };

type DupContact = {
  id: string;
  full_name_clean: string;
  job_title?: string | null;
  company_name?: string | null;
  event_brand?: string | null;
  participant_type?: string | null;
};

type Edition = { id: string; edition_name: string; event_date_start: string };

type OutcomeAdded = {
  outcome: "added";
  contact_id: string;
  contact?: {
    full_name_clean?: string | null;
    job_title?: string | null;
    company_name?: string | null;
    profile_image_url?: string | null;
  };
};
type OutcomePending = { outcome: "pending_review"; request_id: string };
type OutcomeDuplicate = { outcome: "duplicate"; contact: DupContact };
type SubmitOutcome = OutcomeAdded | OutcomePending | OutcomeDuplicate;

type IntakeRequest = {
  id: string;
  linkedin_url: string;
  event_brand: string;
  participant_type: string;
  status: string;
  reject_reason?: string | null;
  created_at: string;
  hydrated?: { full_name_clean?: string | null; job_title?: string | null; company_name?: string | null } | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const BRANDS = ["10DX", "FraudSense", "4WARD", "PMG Roundtables"];
const ROLES = ["Delegate", "Speaker", "Sponsor"];

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  auto_approved: "Added",
  approved: "Added",
  merged: "Merged",
  rejected: "Rejected",
};

function statusChipStyle(status: string): React.CSSProperties {
  if (status === "auto_approved" || status === "approved")
    return { background: "var(--success-bg)", color: "var(--success)" };
  if (status === "rejected")
    return { background: "#fce8e8", color: "#9b2c2c" };
  if (status === "merged")
    return { background: "var(--info-bg)", color: "var(--info)" };
  return { background: "var(--warn-bg)", color: "var(--warn)" };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DupCard({ c, label = "Already in CRM" }: { c: DupContact; label?: string }) {
  return (
    <div
      style={{
        border: "1.5px solid #f4a4a4",
        background: "#fef6f6",
        borderRadius: 10,
        padding: "12px 14px",
        marginTop: 8,
      }}
    >
      <p style={{ margin: "0 0 4px", fontWeight: 600, color: "#9b2c2c", fontSize: 13 }}>
        {label}
      </p>
      <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{c.full_name_clean || "—"}</p>
      {c.job_title && (
        <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--muted)" }}>
          {c.job_title}
          {c.company_name ? ` · ${c.company_name}` : ""}
        </p>
      )}
      {(c.event_brand || c.participant_type) && (
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
          {[c.participant_type, c.event_brand].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

function AddedCard({ c }: { c: OutcomeAdded["contact"] }) {
  return (
    <div
      style={{
        border: "1.5px solid #a4d4bc",
        background: "var(--success-bg)",
        borderRadius: 10,
        padding: "12px 14px",
        marginTop: 8,
      }}
    >
      <p style={{ margin: "0 0 4px", fontWeight: 600, color: "var(--success)", fontSize: 13 }}>
        Added to CRM
      </p>
      {c?.profile_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.profile_image_url}
          alt=""
          width={44}
          height={44}
          style={{ borderRadius: "50%", objectFit: "cover", marginBottom: 6, display: "block" }}
        />
      )}
      <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{c?.full_name_clean || "—"}</p>
      {c?.job_title && (
        <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--muted)" }}>
          {c.job_title}
          {c.company_name ? ` · ${c.company_name}` : ""}
        </p>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 8,
        display: "inline-block",
        ...statusChipStyle(status),
      }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AddContactForm() {
  // Form fields
  const [linkedIn, setLinkedIn] = useState("");
  const [brand, setBrand] = useState("");
  const [role, setRole] = useState("");
  const [eventId, setEventId] = useState("");
  const [note, setNote] = useState("");

  // Dup-check state
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);

  // Edition list
  const [editions, setEditions] = useState<Edition[]>([]);
  const [loadingEditions, setLoadingEditions] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // My submissions
  const [mySubmissions, setMySubmissions] = useState<IntakeRequest[] | null>(null);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const subsLoaded = useRef(false);

  // ── Fetch editions when brand changes ──────────────────────────────────────
  useEffect(() => {
    setEventId("");
    setEditions([]);
    if (!brand || brand === "PMG Roundtables") return;
    setLoadingEditions(true);
    fetch(`/api/events?brand=${encodeURIComponent(brand)}`)
      .then((r) => r.json())
      .then((d: Edition[]) => setEditions(Array.isArray(d) ? d : []))
      .catch(() => setEditions([]))
      .finally(() => setLoadingEditions(false));
  }, [brand]);

  // ── Debounced dup-check on blur ────────────────────────────────────────────
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runCheck = useCallback((url: string) => {
    const trimmed = url.trim();
    if (!trimmed) { setCheckResult(null); return; }
    setChecking(true);
    setCheckResult(null);
    fetch("/api/intake-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkedin_url: trimmed }),
    })
      .then((r) => r.json())
      .then((d: CheckResult) => setCheckResult(d))
      .catch(() => setCheckResult(null))
      .finally(() => setChecking(false));
  }, []);

  const handleLinkedInBlur = () => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    runCheck(linkedIn);
  };

  const handleLinkedInChange = (v: string) => {
    setLinkedIn(v);
    setCheckResult(null);
    setOutcome(null);
    if (checkTimer.current) clearTimeout(checkTimer.current);
    checkTimer.current = setTimeout(() => runCheck(v), 600);
  };

  // ── Load my submissions once ───────────────────────────────────────────────
  const loadMySubmissions = useCallback(() => {
    if (subsLoaded.current) return;
    subsLoaded.current = true;
    setLoadingSubs(true);
    fetch("/api/my-intake")
      .then((r) => r.json())
      .then((d: IntakeRequest[] | { requests?: IntakeRequest[] }) => {
        // The agent may return { requests: [...] } or a bare array.
        const arr = Array.isArray(d) ? d : (d as any).requests ?? [];
        setMySubmissions(arr);
      })
      .catch(() => setMySubmissions([]))
      .finally(() => setLoadingSubs(false));
  }, []);

  useEffect(() => { loadMySubmissions(); }, [loadMySubmissions]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const isDupBlocked =
    checkResult !== null && checkResult.duplicate === true;

  const canSubmit =
    !isDupBlocked &&
    linkedIn.trim().length > 10 &&
    brand !== "" &&
    role !== "" &&
    !submitting &&
    !checking &&
    outcome === null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    setOutcome(null);
    try {
      const body: Record<string, string> = {
        linkedin_url: linkedIn.trim(),
        event_brand: brand,
        participant_type: role,
      };
      if (eventId) body.event_id = eventId;
      if (note.trim()) body.note = note.trim();

      const res = await fetch("/api/intake-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: SubmitOutcome = await res.json();
      setOutcome(data);
      // Refresh submissions list after submit.
      subsLoaded.current = false;
      loadMySubmissions();
    } catch {
      setSubmitError("Submit failed — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Reset form after a successful submission ───────────────────────────────
  const handleReset = () => {
    setLinkedIn(""); setBrand(""); setRole(""); setEventId(""); setNote("");
    setCheckResult(null); setOutcome(null); setSubmitError(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const showEditionSelect = brand && brand !== "PMG Roundtables";

  return (
    <div style={{ maxWidth: 560 }}>
      {/* ── Outcome banner ─────────────────────────────────────────────── */}
      {outcome?.outcome === "added" && (
        <div style={{ marginBottom: 20 }}>
          <AddedCard c={outcome.contact ?? undefined} />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleReset}
            style={{ marginTop: 12 }}
          >
            Add another
          </button>
        </div>
      )}

      {outcome?.outcome === "pending_review" && (
        <div
          style={{
            border: "1.5px solid #b8d4f0",
            background: "var(--info-bg)",
            borderRadius: 10,
            padding: "14px 16px",
            marginBottom: 20,
          }}
        >
          <p style={{ margin: "0 0 4px", fontWeight: 600, color: "var(--info)" }}>
            Sent for review
          </p>
          <p style={{ margin: 0, fontSize: 13 }}>
            Syed will approve, merge, or reject. You'll see the outcome under My Submissions below.
          </p>
          <button
            type="button"
            className="btn"
            onClick={handleReset}
            style={{ marginTop: 10 }}
          >
            Add another
          </button>
        </div>
      )}

      {outcome?.outcome === "duplicate" && (
        <div style={{ marginBottom: 20 }}>
          <DupCard c={outcome.contact} label="Already in CRM — not added" />
          <button
            type="button"
            className="btn"
            onClick={handleReset}
            style={{ marginTop: 10 }}
          >
            Try again
          </button>
        </div>
      )}

      {/* ── Form (hide after a successful terminal outcome) ─────────────── */}
      {!outcome && (
        <form onSubmit={handleSubmit} className="card section" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* LinkedIn URL */}
          <div>
            <label htmlFor="linkedin_url">LinkedIn URL *</label>
            <input
              id="linkedin_url"
              type="url"
              value={linkedIn}
              onChange={(e) => handleLinkedInChange(e.target.value)}
              onBlur={handleLinkedInBlur}
              placeholder="https://linkedin.com/in/…"
              required
              style={isDupBlocked ? { borderColor: "#f4a4a4", background: "#fef6f6" } : undefined}
            />
            {checking && (
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>Checking…</p>
            )}
            {checkResult?.duplicate === true && (
              <DupCard c={checkResult.contact} />
            )}
            {checkResult?.duplicate === false && checkResult.pending_intake && (
              <div
                style={{
                  marginTop: 8,
                  padding: "9px 12px",
                  borderRadius: 8,
                  background: "var(--warn-bg)",
                  color: "var(--warn)",
                  fontSize: 13,
                }}
              >
                This person has already been submitted and is awaiting review.
              </div>
            )}
          </div>

          {/* Brand */}
          <div>
            <label htmlFor="brand">Brand *</label>
            <select
              id="brand"
              value={brand}
              onChange={(e) => { setBrand(e.target.value); setEventId(""); }}
              required
            >
              <option value="">Select brand…</option>
              {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {/* Edition (hidden for PMG Roundtables) */}
          {showEditionSelect && (
            <div>
              <label htmlFor="edition">Edition</label>
              <select
                id="edition"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                disabled={loadingEditions}
              >
                <option value="">{loadingEditions ? "Loading editions…" : "Select edition (optional)…"}</option>
                {editions.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.edition_name} — {fmtDate(ev.event_date_start)}
                  </option>
                ))}
              </select>
              {editions.length === 0 && !loadingEditions && brand && (
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
                  No upcoming editions found for {brand}.
                </p>
              )}
            </div>
          )}

          {/* Role */}
          <div>
            <label htmlFor="role">Role *</label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              required
            >
              <option value="">Select role…</option>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Optional note */}
          <div>
            <label htmlFor="note">Note (optional)</label>
            <input
              id="note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. met at IAFPC Jakarta"
              maxLength={200}
            />
          </div>

          {submitError && (
            <p style={{ margin: 0, fontSize: 13, color: "#9b2c2c" }}>{submitError}</p>
          )}

          {isDupBlocked && (
            <p style={{ margin: 0, fontSize: 13, color: "#9b2c2c" }}>
              This person is already in the CRM. Remove the URL to submit a different contact.
            </p>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={!canSubmit}
            style={{ alignSelf: "flex-start" }}
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </form>
      )}

      {/* ── My Submissions ──────────────────────────────────────────────── */}
      <div style={{ marginTop: 32 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>My Submissions</h3>

        {loadingSubs ? (
          <p className="muted" style={{ fontSize: 13 }}>Loading…</p>
        ) : mySubmissions === null || mySubmissions.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No submissions yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {mySubmissions.map((req) => {
              const name =
                req.hydrated?.full_name_clean ??
                req.linkedin_url.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, "").replace(/\/$/, "");
              const sub = req.hydrated?.job_title
                ? `${req.hydrated.job_title}${req.hydrated.company_name ? ` · ${req.hydrated.company_name}` : ""}`
                : null;
              return (
                <div
                  key={req.id}
                  className="card"
                  style={{ padding: "10px 14px", display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{name}</p>
                    {sub && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted)" }}>{sub}</p>}
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted)" }}>
                      {req.participant_type} · {req.event_brand} · {fmtDate(req.created_at)}
                    </p>
                    {req.status === "rejected" && req.reject_reason && (
                      <p style={{ margin: "6px 0 0", fontSize: 12, color: "#9b2c2c" }}>
                        Reason: {req.reject_reason}
                      </p>
                    )}
                  </div>
                  <StatusChip status={req.status} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
