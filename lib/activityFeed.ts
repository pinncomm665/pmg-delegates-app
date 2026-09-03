import { supabaseAdmin } from "@pmg/team-ui/lib/supabaseAdmin";
import { getAttachmentsForFeed, type NoteAttachment, type TranscriptStatus } from "@pmg/team-ui/lib/notes";
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
// (mig 217) with the service key. One row per team touch (emails, calls,
// meetings, LinkedIn, WhatsApp/notes, registrations, stage moves). The view is
// built in the pmg-agent repo; this module codes against its column contract
// and degrades to `available: false` when the view has not been deployed yet
// (42P01 / "does not exist").
//
// SCOPE (feat/activity-scope): this app only shows activity on contacts that
// hold a role in THIS app. The view carries per-role flags (`is_speaker`,
// `is_delegate`, `is_roundtable`) + `role_editions text[]` + a one-sentence
// `one_liner`. Those columns land in parallel with this code — when they are
// not there yet (42703 / "column does not exist") the module falls back to
// filtering by the app's role table (`contact_id IN (role table)`), with the
// page over-fetched 2× and trimmed client-side. Prefer the flag path.

// ── App-specific block (the ONLY thing that differs between the three apps) ──
// Which role table maps contact_id → detail row id, the detail/list routes, the
// view flag column that says "this contact holds a role in this app", and the
// wording used in the page subtitle.
const ROLE_TABLE = "delegates";
const DETAIL_BASE = "/delegates";
const SCOPE_FLAG = "is_delegate";
export const SCOPE_NOUN = "delegates";
// Fallback-path restriction on the role table (roundtables excludes/keeps
// roundtable editions; summits exclude them). null = whole table.
const ROLE_TABLE_EDITION_FILTER: { op: "ilike" | "not_ilike"; pattern: string } | null = { op: "not_ilike", pattern: "%roundtable%" };
// ─────────────────────────────────────────────────────────────────────────────

export const ACTIVITY_LIST_FALLBACK = (name: string) => `${DETAIL_BASE}?q=${encodeURIComponent(name)}`;

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
  // One-sentence "what happened" from the view (null until the view ships it).
  one_liner: string | null;
  source: string | null;
  event_edition: string | null;
  // Editions the contact holds a role in (null until the view ships it).
  role_editions: string[] | null;
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
  // Roundtables only: per-user market scoping (substring match on event_edition
  // OR overlap between role_editions and the editions in those markets).
  markets?: string[] | null;
};

export type ActivityFeedPage = {
  rows: ActivityFeedRow[];
  total: number;
  available: boolean;
  error?: string | null;
  // true when the role flags are missing from the view and the page was
  // scoped client-side (total is then an upper bound, not an exact count).
  approximate?: boolean;
};

export type ActivityOwner = { email: string; name: string | null };

const DEFAULT_PAGE_SIZE = 50;
let viewMissing = false;
// null = not probed yet; true = view has the role flag columns; false = legacy view.
let scopeFlagsAvailable: boolean | null = null;
const IN_CHUNK = 200; // PostgREST .in() ceiling ~215 uuids per request

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
function isColumnMissing(error: any): boolean {
  if (!error) return false;
  const msg = String(error.message ?? "");
  return (error as any).code === "42703" || (error as any).code === "PGRST204" || /column .* does not exist|could not find the .* column/i.test(msg);
}

// Probe once per process whether the view carries the role-scope columns.
// A relation-missing error is left for the callers to classify (viewMissing).
async function probeScopeFlags(sb: ReturnType<typeof supabaseAdmin>): Promise<boolean> {
  if (scopeFlagsAvailable !== null) return scopeFlagsAvailable;
  const { error } = await sb.from("team_activity_feed").select(`${SCOPE_FLAG}, role_editions`).limit(1);
  if (!error) { scopeFlagsAvailable = true; return true; }
  // Column-missing is checked FIRST — its message also says "does not exist".
  if (isColumnMissing(error)) { scopeFlagsAvailable = false; return false; }
  if (isMissing(error)) { viewMissing = true; return false; }
  // Transient error: don't cache, behave as legacy for this call.
  return false;
}

// Roundtables: the editions (registry names) that fall in the user's markets,
// for the role_editions overlap. Cached briefly — the registry rarely changes.
let marketEditionsCache: { key: string; at: number; editions: string[] } | null = null;
async function editionsForMarkets(sb: ReturnType<typeof supabaseAdmin>, markets: string[]): Promise<string[]> {
  const key = markets.join("|");
  if (marketEditionsCache && marketEditionsCache.key === key && Date.now() - marketEditionsCache.at < 60_000) return marketEditionsCache.editions;
  const { data } = await sb
    .from("events")
    .select("edition_name")
    .not("edition_name", "is", null)
    .or(markets.map((m) => `edition_name.ilike.%${m}%`).join(","));
  // Only names that survive a PostgREST array literal unquoted-safe (no quotes/backslashes).
  const editions = Array.from(new Set((data ?? []).map((e: any) => String(e.edition_name ?? "").trim()).filter((n) => n && !/["\\]/.test(n))));
  marketEditionsCache = { key, at: Date.now(), editions };
  return editions;
}

// Market scoping (roundtables): row's own edition matches a market substring
// OR (flag path, `editions` given) the contact holds a role in an edition of
// that market. Synchronous on purpose — awaiting a Supabase builder executes it.
function applyMarketScope<T>(query: T, markets: string[] | null | undefined, editions: string[] | null): T {
  if (!markets || !markets.length) return query;
  const parts = markets.map((m) => `event_edition.ilike.%${m}%`);
  if (editions && editions.length) parts.push(`role_editions.ov.{${editions.map((e) => `"${e}"`).join(",")}}`);
  return (query as any).or(parts.join(",")) as T;
}

// Fallback path: which of these contact_ids hold a role in this app?
async function roleMembers(sb: ReturnType<typeof supabaseAdmin>, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    let q = sb.from(ROLE_TABLE).select("contact_id").in("contact_id", chunk);
    if (ROLE_TABLE_EDITION_FILTER) {
      q = ROLE_TABLE_EDITION_FILTER.op === "ilike"
        ? q.ilike("event_edition", ROLE_TABLE_EDITION_FILTER.pattern)
        : q.not("event_edition", "ilike", ROLE_TABLE_EDITION_FILTER.pattern);
    }
    const { data } = await q;
    for (const r of (data ?? []) as any[]) if (r.contact_id) out.add(String(r.contact_id));
  }
  return out;
}

export async function getActivityFeed(filters: ActivityFeedFilters): Promise<ActivityFeedPage> {
  if (viewMissing) return { rows: [], total: 0, available: false };
  const sb = supabaseAdmin();
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * pageSize;
  const asc = filters.sort === "asc";

  try {
    const flags = await probeScopeFlags(sb);
    if (viewMissing) return { rows: [], total: 0, available: false };
    // Legacy view: over-fetch 2× and trim to contacts with a role in this app.
    const fetchSize = flags ? pageSize : pageSize * 2;
    const to = from + fetchSize - 1;

    const since = filters.since ? dayStart(filters.since) : null;
    const until = filters.until ? dayEnd(filters.until) : null;
    const types = (filters.activity ?? []).filter(isActivityType);
    const owner = String(filters.owner ?? "").trim().toLowerCase();
    const q = filters.q ? safeLike(filters.q) : "";
    const marketEditions = flags && filters.markets?.length ? await editionsForMarkets(sb, filters.markets) : null;
    // Supabase builders are single-use — build fresh per attempt.
    const build = async (overlap: boolean) => {
      let query = sb.from("team_activity_feed").select("*", { count: "exact" });
      if (flags) query = query.eq(SCOPE_FLAG, true);
      if (types.length) query = query.in("activity", types);
      // Owner scoping — default = tracked team only (see lib/activityOwners.ts).
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
      if (since) query = query.gte("at", since);
      if (until) query = query.lte("at", until);
      if (q) query = query.or(`contact_name.ilike.%${q}%,company_name.ilike.%${q}%`);
      query = applyMarketScope(query, filters.markets, overlap ? marketEditions : null);
      return await query.order("at", { ascending: asc, nullsFirst: false }).order("id", { ascending: true }).range(from, to);
    };

    let { data, count, error } = await build(flags);
    // If the role_editions overlap clause is rejected, retry on edition substring alone.
    if (error && flags && filters.markets?.length && !isMissing(error)) {
      ({ data, count, error } = await build(false));
    }
    if (error) {
      if (isMissing(error)) { viewMissing = true; return { rows: [], total: 0, available: false }; }
      return { rows: [], total: 0, available: true, error: error.message };
    }
    let raw = (data ?? []) as any[];

    // contact_id → this app's role row id (one per contact; newest role wins).
    const ids = Array.from(new Set(raw.map((r) => r.contact_id).filter(Boolean))) as string[];
    const roleByContact = new Map<string, string>();
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      const chunk = ids.slice(i, i + IN_CHUNK);
      const { data: roles } = await sb
        .from(ROLE_TABLE)
        .select("id, contact_id, created_at")
        .in("contact_id", chunk)
        .order("created_at", { ascending: false })
        .limit(chunk.length * 4);
      for (const r of (roles ?? []) as any[]) {
        if (r.contact_id && !roleByContact.has(r.contact_id)) roleByContact.set(r.contact_id, r.id);
      }
    }
    if (!flags) {
      // Legacy scoping: keep only rows whose contact holds a role in this app.
      const members = await roleMembers(sb, ids);
      raw = raw.filter((r) => r.contact_id && members.has(String(r.contact_id))).slice(0, pageSize);
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
        one_liner: typeof r.one_liner === "string" && r.one_liner.trim() ? r.one_liner.trim() : null,
        source: r.source ?? null,
        event_edition: r.event_edition ?? null,
        role_editions: Array.isArray(r.role_editions) ? (r.role_editions as any[]).map(String) : null,
        detail_href: roleId ? `${DETAIL_BASE}/${roleId}` : null,
      };
    });
    return { rows, total: count ?? 0, available: true, approximate: !flags };
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

// Aggregates server-side from minimal columns, under the SAME scope as the
// feed (role flag / role-table fallback + markets). PostgREST caps every
// response at 1000 rows regardless of .limit(), so page with .range() until a
// short page.
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
    const flags = await probeScopeFlags(sb);
    if (viewMissing) return { ...empty, available: false };
    const collected: { owner_email: string | null; owner_name: string | null; activity: string; contact_id: string | null }[] = [];
    const marketEditions = flags && opts.markets?.length ? await editionsForMarkets(sb, opts.markets) : null;
    let overlap = flags;
    for (let from = 0; from < SUMMARY_MAX_ROWS; from += SUMMARY_PAGE) {
      const build = async (ov: boolean) => {
        let query = sb.from("team_activity_feed").select("owner_email, owner_name, activity, contact_id").or(trackedOwnerOrFilter());
        if (flags) query = query.eq(SCOPE_FLAG, true);
        if (since) query = query.gte("at", since);
        if (until) query = query.lte("at", until);
        query = applyMarketScope(query, opts.markets, ov ? marketEditions : null);
        return await query.order("at", { ascending: false }).range(from, from + SUMMARY_PAGE - 1);
      };
      let { data, error } = await build(overlap);
      if (error && overlap && opts.markets?.length && !isMissing(error)) {
        overlap = false;
        ({ data, error } = await build(false));
      }
      if (error) {
        if (isMissing(error)) { viewMissing = true; return { ...empty, available: false }; }
        break;
      }
      const rows = (data ?? []) as any[];
      for (const r of rows) collected.push({ owner_email: r.owner_email ?? null, owner_name: r.owner_name ?? null, activity: String(r.activity ?? ""), contact_id: r.contact_id ?? null });
      if (rows.length < SUMMARY_PAGE) break;
    }
    // Legacy view: keep only rows whose contact holds a role in this app.
    let members: Set<string> | null = null;
    if (!flags) {
      const ids = Array.from(new Set(collected.map((r) => r.contact_id).filter(Boolean))) as string[];
      members = await roleMembers(sb, ids);
    }
    for (const r of collected) {
      if (members && !(r.contact_id && members.has(r.contact_id))) continue;
      const tracked = resolveTrackedOwner(r.owner_email, r.owner_name);
      if (!tracked) continue;
      const type = isActivityType(r.activity) ? r.activity : "Other";
      const row = byOwner.get(tracked.email)!;
      row.counts[type] = (row.counts[type] ?? 0) + 1;
      row.total += 1;
      totals[type] = (totals[type] ?? 0) + 1;
      grand += 1;
      if (row.counts[type] > max) max = row.counts[type];
    }
  } catch (e: any) {
    if (isMissing(e)) { viewMissing = true; return { ...empty, available: false }; }
  }
  // Fixed tracked order (Map preserves insertion order); zeros are shown as "·".
  return { rows: Array.from(byOwner.values()), totals, grandTotal: grand, max, available: true };
}
