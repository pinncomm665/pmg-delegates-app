// Server-side bridge to the PMG Agent staff-intake queue.
//
// New contacts submitted via the Add Contact form land in the agent's
// `contact_intake_requests` table (NOT `contact_change_requests`, which is
// this app's field-edit approval flow). This helper lets the admin Review
// queue list + action those intake requests via the agent's existing
// internal endpoints — the same processReview core the operator app uses.
//
// Auth: x-cron-secret (same pattern as intake-submit / my-intake).

const AGENT_BASE = process.env.AGENT_BASE_URL ?? "https://agent.pmgapphub.com";

export type DuplicateCandidate = {
  contact_id: string;
  full_name?: string | null;
  job_title?: string | null;
  reason?: string | null;
  confidence?: string | null;
};

export type IntakeRequest = {
  id: string;
  linkedin_url: string | null;
  event_brand: string | null;
  participant_type: string | null;
  submitted_by_email: string | null;
  submitter_note: string | null;
  created_at: string;
  hydrated: {
    full_name_clean: string | null;
    job_title: string | null;
    company_name: string | null;
    email: string | null;
    email_source: string | null;
  } | null;
  duplicate_candidates: DuplicateCandidate[] | null;
};

export type IntakeAction = "approve" | "merge" | "reject";

/** Fetch pending new-contact intake requests from the agent (all submitters). */
export async function fetchPendingIntake(): Promise<IntakeRequest[]> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return [];
  try {
    const res = await fetch(
      `${AGENT_BASE}/api/internal/intake-requests?status=pending&limit=200`,
      { headers: { "x-cron-secret": secret }, cache: "no-store" },
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.requests ?? []) as IntakeRequest[];
  } catch {
    return [];
  }
}

/**
 * Execute a review action against the agent's shared processReview core.
 * approve → insert new contact + role; merge → attach role to an existing
 * contact; reject → mark rejected.
 */
export async function postIntakeReview(input: {
  request_id: string;
  action: IntakeAction;
  reviewed_by: string;
  merge_into_contact_id?: string | null;
  reject_reason?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch(`${AGENT_BASE}/api/internal/intake-review`, {
      method: "POST",
      headers: { "x-cron-secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.error ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch_failed" };
  }
}
