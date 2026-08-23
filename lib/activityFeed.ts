import { supabaseAdmin } from "./supabaseAdmin";
import { getAttachmentsForFeed, type NoteAttachment, type TranscriptStatus } from "./notes";
import {
  ALL_OWNERS_PARAM,
  TRACKED_OWNERS,
  isTrackedOwnerEmail,
  ownerAliases,
  resolveTrackedOwner,
  trackedOwnerOrFilter,
  type TrackedOwner,
} from "./activityOwners";

// Activity Report — reads the pmg-agent VIEW `public.team_activity_feed`
// (mig 217) with the service key. One row per team touch across ALL contacts
// (emails, calls, meetings, LinkedIn, WhatsApp/notes, registrations, stage
// moves). The view is built in the pmg-agent repo; this module codes against
// its column contract and degrades to `available: false` when the view has not
// been deployed yet (42P01 / "does not exist").

export const ACTIVITY_TYPES = [
  "Email",
  "Phone",
  "Meeting",
  "LinkedIn",
  "WhatsApp",
  "Note",
  "Registration",
  "Stage",
  "Other",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export const isActivityType = (v: string): v is ActivityType => (ACTIVITY_TYPES as readonly string[]).includes(v);

export type ActivityFeedRow = {
  id: string;
  at: string;
  contact_id: string | null;
  contact_name: string | null;
  company_id: string | null;
  company_name: string | null;
  activity: ActivityType | string;
  direction: string | null;
  owner_email: string | null;
  owner_name: string | null;
  title: string | null;
  summary: string | null;
  source: string | null;
  event_edition: string | null;
  // Resolved by the app: the detail page for this contact (role row id), or
  // null when the contact has no role row in this app → list search fallback.
  detail_href: string | null;
  // Manual-note attachments (files / voice notes), when the row is a contact_note.
  attachments: NoteAttachment[];
  // The underlying contact_note (when matched) + its voice-transcript state.
  note_id: string | null;
  note_author: string | null;
  transcript_status: TranscriptStatus | null;
  transcript: string | null;
};

export type ActivityFeedFilters = {
  q?: string;
  activity?: string[];
  // Tracked owner's canonical email (any alias mailbox rolls up), "" = all
  // tracked owners (default), or ALL_OWNERS_PARAM ("all") = no owner filter
  // at all (admin escape hatch — shows system/untracked rows too).
  owner?: string;
  since?: string; // YYYY-MM-DD (inclusive, local day start)
  until?: string; // YYYY-MM-DD (inclusive, local day end)
  sort?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  // Roundtables only: per-user market scoping (substring match on event_edition).
  markets?: string[] | null;
};

export type ActivityFeedPage = {
  rows: ActivityFeedRow[];
  total: number;
  available: boolean;
  error?: string | null;
};

export type ActivityOwner = { email: string; name: string | null };

// App-specific: which role table maps contact_id → detail row id, and the
// detail/list routes. Kept in one place so the three apps can share this file.
const ROLE_TABLE = "delegates";
const DETAIL_BASE = "/delegates";
export const ACTIVITY_LIST_FALLBACK = (name: string) => `${DETAIL_BASE}?q=${encodeURIComponent(name)}`;

const DEFAULT_PAGE_SIZE = 50;
let viewMissing = false;

// Whole-day bounds, expressed in UTC — the team reads dates as calendar days.
function dayStart(d: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return `${d}T00:00:00.000Z`;
}
function dayEnd(d: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return `${d}T23:59:59.999Z`;
}
export function defaultSince(days = 30): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// PostgREST .or() is comma/paren delimited — strip anything that could break
// the filter string out of the free-text search.
function safeLike(q: string): string {
  return q.replace(/[,()%]/g, " ").replace(/\s+/g, " ").trim();
}

function isMissing(error: any): boolean {
  return !!error && ((error as any).code === "42P01" || /does not exist|schema cache/i.test(String(error.message ?? "")));
}

export async function getActivityFeed(filters: ActivityFeedFilters): Promise<ActivityFeedPage> {
  if (viewMissing) return { rows: [], total: 0, available: false };
  const sb = supabaseAdmin();
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const asc = filters.sort === "asc";

  try {
    let query = sb.from("team_activity_feed").select("*", { count: "exact" });

    const types = (filters.activity ?? []).filter(isActivityType);
    if (types.length) query = query.in("activity", types);
    // Owner scoping — default = tracked team only (see lib/activityOwners.ts).
    const owner = String(filters.owner ?? "").trim().toLowerCase();
    if (owner === ALL_OWNERS_PARAM) {
      // no owner filter: every row, including system-originated ones
    } else if (owner) {
      const canon = ownerAliases[owner];
      const tracked = canon ? TRACKED_OWNERS.find((o) => o.email === canon) : null;
      if (tracked) query = query.or(trackedOwnerOrFilter([tracked]));
      else query = query.eq("owner_email", owner); // untracked mailbox typed by hand: exact match
    } else {
      query = query.or(trackedOwnerOrFilter());
    }
    const since = filters.since ? dayStart(filters.since) : null;
    const until = filters.until ? dayEnd(filters.until) : null;
    if (since) query = query.gte("at", since);
    if (until) query = query.lte("at", until);
    const q = filters.q ? safeLike(filters.q) : "";
    if (q) query = query.or(`contact_name.ilike.%${q}%,company_name.ilike.%${q}%`);
    if (filters.markets && filters.markets.length) {
      query = query.or(filters.markets.map((m) => `event_edition.ilike.%${m}%`).join(","));
    }
    query = query.order("at", { ascending: asc, nullsFirst: false }).order("id", { ascending: true }).range(from, to);

    const { data, count, error } = await query;
    if (error) {
      if (isMissing(error)) { viewMissing = true; return { rows: [], total: 0, available: false }; }
      return { rows: [], total: 0, available: true, error: error.message };
    }
    const raw = (data ?? []) as any[];

    // contact_id → this app's role row id (one per contact; newest role wins).
    const ids = Array.from(new Set(raw.map((r) => r.contact_id).filter(Boolean))) as string[];
    const roleByContact = new Map<string, string>();
    if (ids.length) {
      const { data: roles } = await sb
        .from(ROLE_TABLE)
        .select("id, contact_id, created_at")
        .in("contact_id", ids)
        .order("created_at", { ascending: false })
        .limit(ids.length * 4);
      for (const r of (roles ?? []) as any[]) {
        if (r.contact_id && !roleByContact.has(r.contact_id)) roleByContact.set(r.contact_id, r.id);
      }
    }

    const att = await getAttachmentsForFeed(raw.map((r) => ({ id: String(r.id ?? ""), contact_id: r.contact_id ?? null, at: r.at, source: r.source ?? null })));
    const rows: ActivityFeedRow[] = raw.map((r) => {
      const roleId = r.contact_id ? roleByContact.get(r.contact_id) : undefined;
      const id = String(r.id ?? `${r.source ?? "row"}:${r.at ?? ""}:${r.contact_id ?? ""}`);
      return {
        id,
        attachments: att.get(String(r.id ?? ""))?.attachments ?? [],
        note_id: att.get(String(r.id ?? ""))?.note_id ?? null,
        note_author: att.get(String(r.id ?? ""))?.author_email ?? null,
        transcript_status: att.get(String(r.id ?? ""))?.transcript_status ?? null,
        transcript: att.get(String(r.id ?? ""))?.transcript ?? null,
        at: r.at,
        contact_id: r.contact_id ?? null,
        contact_name: r.contact_name ?? null,
        company_id: r.company_id ?? null,
        company_name: r.company_name ?? null,
        activity: r.activity ?? "Other",
        direction: r.direction ?? null,
        owner_email: r.owner_email ?? null,
        owner_name: r.owner_name ?? null,
        title: r.title ?? null,
        summary: r.summary ?? null,
        source: r.source ?? null,
        event_edition: r.event_edition ?? null,
        detail_href: roleId ? `${DETAIL_BASE}/${roleId}` : null,
      };
    });
    return { rows, total: count ?? 0, available: true };
  } catch (e: any) {
    if (isMissing(e)) { viewMissing = true; return { rows: [], total: 0, available: false }; }
    return { rows: [], total: 0, available: true, error: e?.message ?? "Unknown error" };
  }
}

// The tracked account owners, in the fixed order from lib/activityOwners.ts.
// (Was a distinct query over the feed; the report now tracks a fixed team.)
export async function getActivityOwners(_opts: { since?: string; markets?: string[] | null } = {}): Promise<ActivityOwner[]> {
  return TRACKED_OWNERS.map((o) => ({ email: o.email, name: o.name }));
}
export { ALL_OWNERS_PARAM, TRACKED_OWNERS, isTrackedOwnerEmail };
export type { TrackedOwner };

// ── Activity summary matrix (owner × type counts for a period) ──────────────
export type ActivitySummaryRow = { owner_email: string | null; owner_name: string | null; counts: Record<string, number>; total: number };
export type ActivitySummary = {
  rows: ActivitySummaryRow[];
  totals: Record<string, number>;
  grandTotal: number;
  max: number; // largest single cell (heat scale)
  available: boolean;
};

export const SUMMARY_PERIODS = [
  { k: "today", label: "Today", days: 0 },
  { k: "7d", label: "Last 7 days", days: 7 },
  { k: "14d", label: "Last 14 days", days: 14 },
  { k: "30d", label: "Last 30 days", days: 30 },
] as const;
export type SummaryPeriod = (typeof SUMMARY_PERIODS)[number]["k"];
export const DEFAULT_PERIOD: SummaryPeriod = "7d";
export function periodSince(k: SummaryPeriod): string {
  const p = SUMMARY_PERIODS.find((x) => x.k === k) ?? SUMMARY_PERIODS[1];
  // "Today" = today only; "Last N days" = today + the N-1 previous days.
  return defaultSince(Math.max(0, p.days - 1));
}

// Aggregates server-side from minimal columns. PostgREST caps every response
// at 1000 rows regardless of .limit(), so page with .range() until a short page.
const SUMMARY_PAGE = 1000;
const SUMMARY_MAX_ROWS = 50_000;
export async function getActivitySummary(opts: { since?: string; until?: string; markets?: string[] | null }): Promise<ActivitySummary> {
  const empty: ActivitySummary = { rows: [], totals: {}, grandTotal: 0, max: 0, available: true };
  if (viewMissing) return { ...empty, available: false };
  const sb = supabaseAdmin();
  const since = opts.since ? dayStart(opts.since) : null;
  const until = opts.until ? dayEnd(opts.until) : null;
  // Exactly one row per tracked owner, in the fixed order; rows belonging to
  // nobody tracked (system sources, other users) are not counted.
  const byOwner = new Map<string, ActivitySummaryRow>();
  for (const o of TRACKED_OWNERS) byOwner.set(o.email, { owner_email: o.email, owner_name: o.name, counts: {}, total: 0 });
  const totals: Record<string, number> = {};
  let grand = 0;
  let max = 0;
  try {
    for (let from = 0; from < SUMMARY_MAX_ROWS; from += SUMMARY_PAGE) {
      let query = sb.from("team_activity_feed").select("owner_email, owner_name, activity").or(trackedOwnerOrFilter());
      if (since) query = query.gte("at", since);
      if (until) query = query.lte("at", until);
      if (opts.markets && opts.markets.length) {
        query = query.or(opts.markets.map((m) => `event_edition.ilike.%${m}%`).join(","));
      }
      const { data, error } = await query.order("at", { ascending: false }).range(from, from + SUMMARY_PAGE - 1);
      if (error) {
        if (isMissing(error)) { viewMissing = true; return { ...empty, available: false }; }
        break;
      }
      const rows = (data ?? []) as any[];
      for (const r of rows) {
        const tracked = resolveTrackedOwner(r.owner_email ?? null, r.owner_name ?? null);
        if (!tracked) continue;
        const type = isActivityType(String(r.activity ?? "")) ? String(r.activity) : "Other";
        const row = byOwner.get(tracked.email)!;
        row.counts[type] = (row.counts[type] ?? 0) + 1;
        row.total += 1;
        totals[type] = (totals[type] ?? 0) + 1;
        grand += 1;
        if (row.counts[type] > max) max = row.counts[type];
      }
      if (rows.length < SUMMARY_PAGE) break;
    }
  } catch (e: any) {
    if (isMissing(e)) { viewMissing = true; return { ...empty, available: false }; }
  }
  // Fixed tracked order (Map preserves insertion order); zeros are shown as "·".
  return { rows: Array.from(byOwner.values()), totals, grandTotal: grand, max, available: true };
}
