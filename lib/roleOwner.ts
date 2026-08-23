// Role-row owner (account manager) helpers.
//
// pmg-agent adds `delegates.owner_email` (+ owner_assigned_at / owner_assigned_by)
// — the person responsible for THAT role row. This file maps an owner email to
// a display name (tracked owners first, else the mailbox local-part) and holds
// the `?owner=` filter vocabulary shared by the list page, the export and the
// "Select all matching" action. The data layer tolerates the columns not being
// deployed yet (see lib/data.ts — owner reads/filters degrade, never throw).

import { TRACKED_OWNERS, resolveTrackedOwner, type TrackedOwner } from "./activityOwners";

/** `?owner=unassigned` → rows with no owner. Anything else is an email. */
export const OWNER_UNASSIGNED = "unassigned";

const norm = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase();

/** Canonical tracked email for an owner mailbox (aliases roll up), else the lower-cased input. */
export function canonicalOwnerEmail(email: string | null | undefined): string | null {
  const e = norm(email);
  if (!e) return null;
  return resolveTrackedOwner(e, null)?.email ?? e;
}

/** Full display name: tracked owner's name, else the mailbox local-part. */
export function ownerDisplayName(email: string | null | undefined): string | null {
  const e = norm(email);
  if (!e) return null;
  const t = resolveTrackedOwner(e, null);
  if (t) return t.name;
  return e.split("@")[0] || e;
}

/** First name only (what the list column + header chip show). */
export function ownerFirstName(email: string | null | undefined): string | null {
  const full = ownerDisplayName(email);
  if (!full) return null;
  return full.split(/\s+/)[0] || full;
}

/** Options for the Owner filter select / picker: tracked owners in Syed's order. */
export function ownerOptions(): TrackedOwner[] {
  return TRACKED_OWNERS;
}

/**
 * Parse the `?owner=` query value. Returns:
 *   undefined      — no filter ("Anyone")
 *   { unassigned } — rows with owner_email null
 *   { email }      — rows owned by that mailbox (canonicalised)
 */
export type OwnerFilter = { unassigned: true } | { email: string } | undefined;
export function parseOwnerFilter(raw: string | null | undefined): OwnerFilter {
  const v = norm(raw);
  if (!v) return undefined;
  if (v === OWNER_UNASSIGNED) return { unassigned: true };
  return { email: canonicalOwnerEmail(v) ?? v };
}
