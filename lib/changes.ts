// Activity log + review-queue plumbing on top of `contact_change_requests`.
//
// Every write the team makes through this app (Tier A, applied Tier B) lands
// here with status 'auto_applied'; writes that need a reviewer land as
// 'pending'. The Activity tab, /my-changes and the admin queue all read it.
// Logging must never break the user's write — errors are swallowed (and
// surfaced in the server log).

import { supabaseAdmin } from "./supabaseAdmin";
import type { AppUser } from "./session";
import { RATE_GUARD_LIMIT, RATE_GUARD_WINDOW_MIN } from "./policy";

// Allowed `kind` values (DB CHECK constraint): email, phone, role, stage,
// stage_revert, logistics, registration, company, company_new, attach, brief,
// promo, other. Delegates use `registration` for RegistrationForm saves.
export type ChangeKind =
  | "stage"
  | "stage_revert"
  | "logistics"
  | "registration"
  | "phone"
  | "email"
  | "company"
  | "company_new"
  | "attach"
  | "role"
  | "brief"
  | "promo"
  | "other";

export type ChangeStatus = "pending" | "auto_applied" | "approved" | "rejected";

export type ChangeInput = {
  contact_id: string | null;
  delegate_id?: string | null;
  event_id?: string | null;
  event_edition?: string | null;
  kind: ChangeKind;
  field?: string | null;
  current_value?: string | null;
  proposed_value?: string | null;
  proposed_company?: string | null;
  mv_result?: string | null;
};

export type ChangeRow = {
  id: string;
  contact_id: string | null;
  delegate_id: string | null;
  event_id: string | null;
  event_edition: string | null;
  kind: string;
  field: string | null;
  current_value: string | null;
  proposed_value: string | null;
  proposed_company: string | null;
  mv_result: string | null;
  status: ChangeStatus;
  submitted_by: string | null;
  submitted_by_email: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

// Insert one row. status 'auto_applied' stamps reviewed_at (self-applied);
// 'pending' leaves it for the queue. Returns the error message (if any) so
// callers that NEED the queue row (stage_revert, company_new) can surface it.
export async function logChange(
  user: AppUser,
  input: ChangeInput,
  status: "auto_applied" | "pending" = "auto_applied"
): Promise<string | null> {
  const sb = supabaseAdmin();
  const { error } = await sb.from("contact_change_requests").insert({
    contact_id: input.contact_id,
    delegate_id: input.delegate_id ?? null,
    event_id: input.event_id ?? null,
    event_edition: input.event_edition ?? null,
    kind: input.kind,
    field: input.field ?? null,
    current_value: input.current_value ?? null,
    proposed_value: input.proposed_value ?? null,
    proposed_company: input.proposed_company ?? null,
    mv_result: input.mv_result ?? null,
    status,
    submitted_by: user.id,
    submitted_by_email: user.email,
    reviewed_at: status === "auto_applied" ? new Date().toISOString() : null,
  });
  if (error) {
    console.error("[changes] log failed", input.kind, error.message);
    return error.message;
  }
  return null;
}

// Rate guard: true when the user has exceeded RATE_GUARD_LIMIT auto-applied
// writes in the trailing window. Admins are exempt.
export async function isRateGuarded(user: AppUser): Promise<boolean> {
  if (user.role === "admin") return false;
  const sb = supabaseAdmin();
  const since = new Date(Date.now() - RATE_GUARD_WINDOW_MIN * 60_000).toISOString();
  const { count } = await sb
    .from("contact_change_requests")
    .select("id", { count: "exact", head: true })
    .eq("submitted_by", user.id)
    .eq("status", "auto_applied")
    .gte("created_at", since);
  return (count ?? 0) > RATE_GUARD_LIMIT;
}

export const RATE_GUARD_MSG = "Held for review (rate guard)";

// Activity for one contact (all its delegate rows), newest first.
export async function getContactActivity(contactId: string, limit = 100): Promise<ChangeRow[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("contact_change_requests")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ChangeRow[];
}

// The current user's own rows (for /my-changes).
export async function getMyChanges(userId: string, kind?: string, limit = 200): Promise<ChangeRow[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from("contact_change_requests")
    .select("*")
    .eq("submitted_by", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (kind) q = q.eq("kind", kind);
  const { data } = await q;
  return (data ?? []) as ChangeRow[];
}

export const KIND_LABEL: Record<string, string> = {
  stage: "Stage",
  stage_revert: "Stage (revert)",
  registration: "Registration",
  logistics: "Logistics",
  phone: "Phone",
  email: "Email",
  company: "Company",
  company_new: "New company",
  attach: "Attached to event",
  role: "Role / title",
  brief: "Brief",
  promo: "Promotion",
  other: "Other",
};

export function kindLabel(k: string | null | undefined): string {
  return (k && KIND_LABEL[k]) || k || "—";
}

// "3d ago" / "2h ago" / "just now" — compact relative time for lists.
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

export function hoursSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}
