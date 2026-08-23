import { supabaseAdmin } from "./supabaseAdmin";
import {
  buildSummit,
  CONFIRMED_STAGES,
  DEFAULT_TARGET_DELEGATES,
  type SummitPulse,
} from "./pulse";
import { SUMMIT_BRANDS, normalizeBrand, brandOf } from "./brands";

export interface DashboardData {
  summits: SummitPulse[];
  summary: {
    total: number;
    onTrack: number; // Good / On Target / Ahead
    weakOrCritical: number; // Weak / Critical
    avgHealthPct: number;
    avgGap: number; // avg delegates still needed to reach target
  };
}

// ── Grouped counts view ─────────────────────────────────────────────────────
// `delegate_edition_counts` (pmg-agent mig 211): one row per
// (event_id, event_edition, stage) with n = count. Replaces the 20k-row pulls
// for the dashboard, stage tabs and filter options. Returns null when the view
// is missing (deploy-order safety) so callers can fall back to the old path.
export type EditionCount = { event_id: string | null; event_edition: string | null; stage: string | null; n: number };

let editionCountsMissing = false;
export async function readEditionCounts(): Promise<EditionCount[] | null> {
  if (editionCountsMissing) return null;
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("delegate_edition_counts")
      .select("event_id, event_edition, stage, n")
      .limit(5000);
    if (error) {
      // 42P01 = undefined_table (view not deployed yet) → remember, fall back.
      if ((error as any).code === "42P01" || /does not exist/i.test(error.message)) editionCountsMissing = true;
      return null;
    }
    return (data ?? []).map((r: any) => ({
      event_id: r.event_id ?? null,
      event_edition: r.event_edition ?? null,
      stage: r.stage ?? null,
      n: Number(r.n ?? 0),
    }));
  } catch {
    return null;
  }
}

export async function getDashboard(): Promise<DashboardData> {
  const sb = supabaseAdmin();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  // Track EVERY active, upcoming, non-roundtable edition — not just the ones
  // that already have delegates — so 0-delegate events still show (as 0/target).
  // Roundtables are excluded from the delegates app (separate app).
  const [{ data: events }, viewCounts] = await Promise.all([
    sb
      .from("events")
      .select("id, brand, edition_name, event_date_start, delegate_target")
      .in("brand", SUMMIT_BRANDS)
      .eq("is_active", true)
      .not("edition_name", "is", null)
      .not("edition_name", "ilike", "%roundtable%")
      .gte("event_date_start", todayStr),
    readEditionCounts(),
  ]);

  // Delegate counts per event (0 when an event has none yet) — grouped view
  // first, row pull as fallback.
  const byEvent = new Map<string, { confirmed: number; total: number }>();
  if (viewCounts) {
    for (const r of viewCounts) {
      if (!r.event_id) continue;
      const g = byEvent.get(r.event_id) ?? { confirmed: 0, total: 0 };
      g.total += r.n;
      if (CONFIRMED_STAGES.includes((r.stage ?? "").toLowerCase())) g.confirmed += r.n;
      byEvent.set(r.event_id, g);
    }
  } else {
    const { data: del } = await sb
      .from("delegates")
      .select("event_id, stage")
      .not("event_id", "is", null)
      .limit(20000);
    for (const d of del ?? []) {
      const g = byEvent.get(d.event_id) ?? { confirmed: 0, total: 0 };
      g.total++;
      if (CONFIRMED_STAGES.includes((d.stage ?? "").toLowerCase())) g.confirmed++;
      byEvent.set(d.event_id, g);
    }
  }

  const summits = (events ?? [])
    .filter((e) => e.event_date_start && (e.edition_name ?? "").trim() !== "")
    .map((e) => {
      const d = new Date(e.event_date_start as string);
      const daysLeft = Math.round((d.getTime() - today.getTime()) / 86400000);
      const counts = byEvent.get(e.id) ?? { confirmed: 0, total: 0 };
      return buildSummit({
        event_id: e.id,
        name: e.edition_name ?? "—",
        brand: normalizeBrand(e.brand) ?? null,
        date: e.event_date_start as string,
        daysLeft,
        confirmed: counts.confirmed,
        total: counts.total,
        target: (e as any).delegate_target ?? DEFAULT_TARGET_DELEGATES,
      });
    })
    .filter((s) => s.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const total = summits.length;
  const onTrack = summits.filter((s) =>
    ["Good", "On Target", "Ahead"].includes(s.label)
  ).length;
  const weakOrCritical = summits.filter((s) =>
    ["Weak", "Critical"].includes(s.label)
  ).length;
  const avgHealthPct = total
    ? Math.round(summits.reduce((a, s) => a + s.progressPct, 0) / total)
    : 0;
  const avgGap = total
    ? Math.round((summits.reduce((a, s) => a + s.gap, 0) / total) * 10) / 10
    : 0;

  return { summits, summary: { total, onTrack, weakOrCritical, avgHealthPct, avgGap } };
}

// Whitelisted contact fields the Delegates app is allowed to read.
const CONTACT_FIELDS =
  "id, full_name_clean, first_name_clean, last_name_clean, job_title, email, personal_email, phone, mobile, office_phone, other_phone, linkedin_url_canonical, location_country, email_source, email_mv_result, email_verified_status, scrubby_result, profile_brief, company_id, company_name_submitted, user_managed_fields, profile_image_url";

export async function searchCompanies(
  q: string
): Promise<{ id: string; name: string; domain: string | null }[]> {
  const sb = supabaseAdmin();
  let query = sb
    .from("companies")
    .select("id, name:company_name_canonical, domain:domain_root")
    .not("company_name_canonical", "is", null)
    .order("company_name_canonical", { ascending: true })
    .limit(25);
  if (q) query = query.ilike("company_name_canonical", `${q}%`);
  const { data } = await query;
  return (data ?? []) as { id: string; name: string; domain: string | null }[];
}

export async function getCompanyById(id: string): Promise<{ id: string; name: string; domain: string | null } | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("companies")
    .select("id, name:company_name_canonical, domain:domain_root")
    .eq("id", id)
    .maybeSingle();
  return (data as any) ?? null;
}

export type DelegateRow = {
  id: string;
  stage: string | null;
  stage_updated_at?: string | null;
  event_brand: string | null;
  event_edition: string | null;
  event_id: string | null;
  contact: any;
  company: { name: string | null; domain_root?: string | null } | null;
  // registration (delegates columns)
  delegate_type?: string | null;
  ticket_type?: string | null;
  registration_date?: string | null;
  badge_name?: string | null;
  seating_assignment?: string | null;
  special_access?: string | null;
  dietary_requirements?: string | null;
  invoice_sent?: boolean | null;
  invoice_sent_at?: string | null;
  payment_received?: boolean | null;
  payment_received_at?: string | null;
  payment_amount?: number | null;
  complimentary?: boolean | null;
  complimentary_reason?: string | null;
  notes?: string | null;
};

const REGISTRATION_FIELDS =
  "delegate_type, ticket_type, registration_date, badge_name, seating_assignment, special_access, dietary_requirements, invoice_sent, invoice_sent_at, payment_received, payment_received_at, payment_amount, complimentary, complimentary_reason, notes";

export type SortKey = "name" | "job_title" | "company" | "edition" | "stage";

const SORT_COLUMN: Record<SortKey, string> = {
  name: "full_name_clean",
  job_title: "job_title",
  company: "company_name",
  edition: "event_edition",
  stage: "stage_rank",
};

// Flatten a delegate_list_view row back into the nested DelegateRow the UI
// (list / search / export) already consumes.
function mapDelegateView(v: any): DelegateRow {
  const company = v.company_name ? { name: v.company_name as string } : null;
  return {
    id: v.id,
    stage: v.stage,
    event_brand: v.event_brand,
    event_edition: v.event_edition,
    event_id: v.event_id,
    ticket_type: v.ticket_type,
    payment_received: v.payment_received,
    company,
    contact: {
      id: v.contact_id,
      full_name_clean: v.full_name_clean,
      job_title: v.job_title,
      email: v.email,
      personal_email: v.personal_email,
      phone: v.phone,
      mobile: v.mobile,
      office_phone: v.office_phone,
      other_phone: v.other_phone,
      linkedin_url_canonical: v.linkedin_url_canonical,
      location_country: v.location_country,
      company_name_submitted: v.company_name_submitted,
      profile_image_url: v.profile_image_url ?? null,
      company,
    },
  };
}

export type DelegatePage = { rows: DelegateRow[]; total: number };

// Server-side paginated + sorted query against delegate_list_view. Filtering,
// sorting and the exact count all run in SQL, so it scales to any list size
// (only one page is ever sent to the browser). Roundtables live in a separate app.
export async function getDelegates(filters: {
  brand?: string;
  edition?: string;
  status?: string;
  q?: string;
  hasValidEmail?: boolean;
  hasPhone?: boolean;
  hasLinkedin?: boolean;
  page?: number;
  pageSize?: number;
  sort?: SortKey;
  dir?: "asc" | "desc";
}): Promise<DelegatePage> {
  const sb = supabaseAdmin();
  const pageSize = filters.pageSize ?? 100;
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const sortCol = SORT_COLUMN[filters.sort ?? "name"];
  const asc = (filters.dir ?? "asc") !== "desc";

  let query = sb
    .from("delegate_list_view")
    .select("*", { count: "exact" })
    .not("event_edition", "ilike", "%roundtable%");

  if (filters.brand) query = query.eq("event_brand", filters.brand);
  if (filters.edition) query = query.eq("event_edition", filters.edition);
  if (filters.status) query = query.eq("stage", filters.status.toLowerCase());
  // search_text = lower(name + denormalised company); the ILIKE is served by
  // the functional pg_trgm GIN index (mig 107).
  if (filters.q) query = query.ilike("search_text", `%${filters.q.toLowerCase()}%`);
  if (filters.hasValidEmail) query = query.eq("email_status", "Valid");
  if (filters.hasPhone) query = query.eq("has_phone", true);
  if (filters.hasLinkedin) query = query.eq("has_linkedin", true);

  query = query.order(sortCol, { ascending: asc, nullsFirst: false });
  if (sortCol !== "full_name_clean") {
    query = query.order("full_name_clean", { ascending: true, nullsFirst: false });
  }
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []).map(mapDelegateView), total: count ?? 0 };
}

export type StageCounts = { total: number; byStage: Record<string, number> };

// Per-stage delegate counts for the CURRENT filter set (minus status) — powers
// the stage-tab strip (per edition AND in the all-editions view). When only
// brand/edition are set the grouped view answers it (no row pull); with a
// search or has-* filter it falls back to the same filters/view as getDelegates
// so the tab counts always match the list.
export async function getStageCounts(filters: {
  brand?: string;
  edition?: string;
  q?: string;
  hasValidEmail?: boolean;
  hasPhone?: boolean;
  hasLinkedin?: boolean;
}): Promise<StageCounts> {
  const simple = !filters.q && !filters.hasValidEmail && !filters.hasPhone && !filters.hasLinkedin;
  if (simple) {
    const view = await readEditionCounts();
    if (view) {
      const byStage: Record<string, number> = {};
      let total = 0;
      for (const r of view) {
        const ed = r.event_edition ?? "";
        if (/roundtable/i.test(ed)) continue;
        if (filters.edition && ed !== filters.edition) continue;
        if (filters.brand && brandOf(ed) !== normalizeBrand(filters.brand)) continue;
        const s = (r.stage ?? "identified").toLowerCase();
        byStage[s] = (byStage[s] ?? 0) + r.n;
        total += r.n;
      }
      return { total, byStage };
    }
  }
  const sb = supabaseAdmin();
  let query = sb
    .from("delegate_list_view")
    .select("stage")
    .not("event_edition", "ilike", "%roundtable%");
  if (filters.brand) query = query.eq("event_brand", filters.brand);
  if (filters.edition) query = query.eq("event_edition", filters.edition);
  if (filters.q) query = query.ilike("search_text", `%${filters.q.toLowerCase()}%`);
  if (filters.hasValidEmail) query = query.eq("email_status", "Valid");
  if (filters.hasPhone) query = query.eq("has_phone", true);
  if (filters.hasLinkedin) query = query.eq("has_linkedin", true);

  const { data, error } = await query.limit(20000);
  if (error) throw new Error(error.message);
  const byStage: Record<string, number> = {};
  for (const r of data ?? []) {
    const s = ((r as { stage: string | null }).stage ?? "identified").toLowerCase();
    byStage[s] = (byStage[s] ?? 0) + 1;
  }
  return { total: (data ?? []).length, byStage };
}

export async function getDelegate(id: string): Promise<DelegateRow | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("delegates")
    .select(
      `id, stage, stage_updated_at, event_brand, event_edition, event_id, ${REGISTRATION_FIELDS},
       contact:contacts(${CONTACT_FIELDS}, company:companies(name:company_name_canonical, domain_root))`
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as DelegateRow) ?? null;
}

// Brief status only — polled by the detail page while a research job is in flight.
export async function getDelegateBriefStatus(
  contactId: string,
  eventId: string | null
): Promise<{ status: string | null; generated_at: string | null } | null> {
  const sb = supabaseAdmin();
  let q = sb
    .from("contact_profiles")
    .select("status, generated_at")
    .eq("contact_id", contactId)
    .eq("kind", "delegate");
  q = eventId ? q.eq("event_id", eventId) : q.is("event_id", null);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  return { status: (data as any).status ?? null, generated_at: (data as any).generated_at ?? null };
}

// Ids of EVERY delegate matching the filter set (for "Select all N matching"),
// capped so a runaway filter can't pull the whole table into the browser.
export const SELECT_ALL_CAP = 2000;
export async function getDelegateIdsMatching(filters: {
  brand?: string;
  edition?: string;
  status?: string;
  q?: string;
  hasValidEmail?: boolean;
  hasPhone?: boolean;
  hasLinkedin?: boolean;
}): Promise<{ ids: string[]; capped: boolean }> {
  const sb = supabaseAdmin();
  let query = sb
    .from("delegate_list_view")
    .select("id")
    .not("event_edition", "ilike", "%roundtable%");
  if (filters.brand) query = query.eq("event_brand", filters.brand);
  if (filters.edition) query = query.eq("event_edition", filters.edition);
  if (filters.status) query = query.eq("stage", filters.status.toLowerCase());
  if (filters.q) query = query.ilike("search_text", `%${filters.q.toLowerCase()}%`);
  if (filters.hasValidEmail) query = query.eq("email_status", "Valid");
  if (filters.hasPhone) query = query.eq("has_phone", true);
  if (filters.hasLinkedin) query = query.eq("has_linkedin", true);
  const { data, error } = await query.order("full_name_clean", { ascending: true }).limit(SELECT_ALL_CAP + 1);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r: any) => r.id as string);
  return { ids: ids.slice(0, SELECT_ALL_CAP), capped: ids.length > SELECT_ALL_CAP };
}

// Role-scoped profile (contact_profiles) for the Background Notes tab.
export type ContactProfile = { brief: any; status: string | null; generated_at: string | null };

export async function getContactProfile(
  contactId: string,
  kind: string,
  eventId: string | null
): Promise<ContactProfile | null> {
  const sb = supabaseAdmin();
  let q = sb
    .from("contact_profiles")
    .select("brief, status, generated_at")
    .eq("contact_id", contactId)
    .eq("kind", kind);
  q = eventId ? q.eq("event_id", eventId) : q.is("event_id", null);
  const { data } = await q.maybeSingle();
  return (data as ContactProfile) ?? null;
}

export type Enrolment = {
  campaign_id: string | null;
  campaign_name: string | null;
  event_brand: string | null;
  pushed_at: string | null;
  status: string | null;
};

export async function getEnrolments(contactId: string): Promise<Enrolment[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("instantly_push_log")
    .select("campaign_id, campaign_name, event_brand, pushed_at, status")
    .eq("contact_id", contactId)
    .order("pushed_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as Enrolment[];
}

export type EditionOption = { name: string; brand: string | null; date: string | null; upcoming: boolean };

export async function getFilterOptions(): Promise<{
  brands: string[];
  editions: string[];
  editionOptions: EditionOption[];
}> {
  const sb = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  // Brands + editions come from the canonical events registry (active/upcoming
  // first), UNIONed with the distinct editions that actually have delegate rows
  // (grouped view — no 20k-row pull) so past editions with delegates still appear.
  // Roundtables are a separate app.
  const [{ data: ev }, view] = await Promise.all([
    sb
      .from("events")
      .select("brand, edition_name, event_date_start, is_active")
      .in("brand", SUMMIT_BRANDS)
      .not("edition_name", "is", null)
      .not("edition_name", "ilike", "%roundtable%"),
    readEditionCounts(),
  ]);
  const brands = new Set<string>();
  const byName = new Map<string, EditionOption>();
  (ev ?? []).forEach((e: any) => {
    const b = normalizeBrand(e.brand as string | null);
    if (b) brands.add(b);
    const name = (e.edition_name ?? "").trim();
    if (!name) return;
    const date = (e.event_date_start as string | null) ?? null;
    byName.set(name, { name, brand: b ?? null, date, upcoming: !!e.is_active && !!date && date >= today });
  });

  const seen = new Set<string>();
  if (view) {
    for (const r of view) {
      const ed = (r.event_edition ?? "").trim();
      if (!ed || /roundtable/i.test(ed)) continue;
      seen.add(ed);
    }
  } else {
    const { data } = await sb.from("delegates").select("event_edition").limit(20000);
    (data ?? []).forEach((r: any) => {
      const ed = (r.event_edition ?? "").trim();
      if (ed && !/roundtable/i.test(ed)) seen.add(ed);
    });
  }
  for (const ed of seen) {
    if (!byName.has(ed)) byName.set(ed, { name: ed, brand: brandOf(ed), date: null, upcoming: false });
  }
  // Only editions that are upcoming OR have delegates — registry stubs with no
  // rows and a past date are noise.
  const editionOptions = Array.from(byName.values())
    .filter((o) => o.upcoming || seen.has(o.name))
    .sort((a, b) => {
      if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1;
      if (a.upcoming && a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  return {
    brands: Array.from(brands).sort(),
    editions: editionOptions.map((o) => o.name),
    editionOptions,
  };
}

// Delegate registration lifecycle. Registration-and-payment oriented (not the
// speaker briefed/ready track). 'applied' is the Webflow → Luma bridge's
// self-service path (delegate submitted the application form and is sitting
// pending-approval in Luma) — parallel to invited, not a replacement for it.
export const STAGES: { value: string; label: string }[] = [
  { value: "identified", label: "Identified" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "invited", label: "Invited" },
  { value: "applied", label: "Applied" },
  { value: "registered", label: "Registered" },
  { value: "confirmed", label: "Confirmed" },
  { value: "attended", label: "Attended" },
  { value: "cancelled", label: "Cancelled" },
  { value: "declined", label: "Declined" },
  { value: "no_show", label: "No Show" },
];

export const STAGE_VALUES = STAGES.map((s) => s.value);

export function stageLabel(stage: string | null): string {
  const v = (stage ?? "").toLowerCase();
  return STAGES.find((s) => s.value === v)?.label ?? (stage || "—");
}

export function stageBadgeClass(stage: string | null): string {
  const s = (stage ?? "").toLowerCase();
  if (["registered", "confirmed", "attended"].includes(s))
    return "badge badge-success";
  if (["cancelled", "declined", "no_show"].includes(s)) return "badge";
  return "badge badge-warn";
}
