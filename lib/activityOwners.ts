// Tracked account owners for the Activity Report + Activity Summary.
//
// Syed's rule: the report tracks ONLY these people, in this order. Every
// mailbox a person uses (@grouppmg.com AND @pmgmea.com) rolls up to ONE owner
// row via `ownerAliases`. Anyone not listed here (hafsa, system sources such as
// Luma/Webflow/Instantly, stage moves by other users) is hidden by default —
// that is intended. Admins can still see everything with `?owner=all`.

export type TrackedOwner = { email: string; name: string };

export const TRACKED_OWNERS: TrackedOwner[] = [
  { email: "safia@grouppmg.com", name: "Safia Bano" },
  { email: "julita@grouppmg.com", name: "Julita Anggraeni" },
  { email: "rahul@grouppmg.com", name: "Rahul Jayawant" },
];

// alias mailbox (lower-case) → canonical tracked email. The canonical email is
// always its own alias.
export const ownerAliases: Record<string, string> = {
  "safia@grouppmg.com": "safia@grouppmg.com",
  "safia@pmgmea.com": "safia@grouppmg.com",
  "julita@grouppmg.com": "julita@grouppmg.com",
  "julita@pmgmea.com": "julita@grouppmg.com",
  "rahul@grouppmg.com": "rahul@grouppmg.com",
  "rahul@pmgmea.com": "rahul@grouppmg.com",
};

export const ALL_OWNERS_PARAM = "all";

const norm = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase();
const normName = (s: string | null | undefined) => norm(s).replace(/\s+/g, " ");

/** All alias mailboxes that roll up to `canonical` (canonical included). */
export function aliasesFor(canonical: string): string[] {
  const c = norm(canonical);
  return Object.entries(ownerAliases).filter(([, v]) => v === c).map(([k]) => k);
}

/** Every alias mailbox across all tracked owners. */
export function allTrackedAliases(): string[] {
  return Object.keys(ownerAliases);
}

export function isTrackedOwnerEmail(email: string | null | undefined): boolean {
  return !!ownerAliases[norm(email)];
}

/**
 * Resolve a feed row's (owner_email, owner_name) to a tracked owner, or null
 * when the row belongs to nobody tracked. Email (any alias, case-insensitive)
 * wins; owner_name is consulted only when owner_email is null.
 */
export function resolveTrackedOwner(ownerEmail: string | null | undefined, ownerName: string | null | undefined): TrackedOwner | null {
  const e = norm(ownerEmail);
  if (e) {
    const canon = ownerAliases[e];
    return canon ? TRACKED_OWNERS.find((o) => o.email === canon) ?? null : null;
  }
  const n = normName(ownerName);
  if (!n) return null;
  return TRACKED_OWNERS.find((o) => normName(o.name) === n) ?? null;
}

// PostgREST .or() filter strings — escape commas/parens out of values.
const safeVal = (s: string) => s.replace(/[,()]/g, " ").trim();

/**
 * PostgREST `.or()` expression selecting rows owned by the given tracked
 * owners: owner_email in their aliases, OR (owner_email null AND owner_name
 * matches, case-insensitively).
 */
export function trackedOwnerOrFilter(owners: TrackedOwner[] = TRACKED_OWNERS): string {
  const aliases = owners.flatMap((o) => aliasesFor(o.email)).map(safeVal);
  const names = owners.map((o) => safeVal(o.name));
  const parts: string[] = [];
  if (aliases.length) parts.push(`owner_email.in.(${aliases.join(",")})`);
  for (const n of names) parts.push(`and(owner_email.is.null,owner_name.ilike.${n})`);
  return parts.join(",");
}
