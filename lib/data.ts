import { supabaseAdmin } from "./supabaseAdmin";
import {
  buildSummit,
  CONFIRMED_STAGES,
  DEFAULT_TARGET_DELEGATES,
  type SummitPulse,
} from "./pulse";

export interface DashboardData {
  summits: SummitPulse[];
  summary: {
    total: number;
    onTrack: number; // Good / On Target / Ahead
    weakOrCritical: number; // Weak / Critical
    avgHealthPct: number;
    avgGap: number;
  };
}

export async function getDashboard(): Promise<DashboardData> {
  const sb = supabaseAdmin();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  // Track EVERY active, upcoming, non-roundtable edition — not just the ones
  // that already have delegates — so 0-delegate events still show (as 0/target).
  // Roundtables are excluded from the delegates app (separate app).
  const { data: events } = await sb
    .from("events")
    .select("id, brand, edition_name, event_date_start, delegate_target")
    .in("brand", ["10DX", "FraudSense", "4WARD"])
    .eq("is_active", true)
    .not("edition_name", "is", null)
    .not("edition_name", "ilike", "%roundtable%")
    .gte("event_date_start", todayStr);

  // Delegate counts per event (0 when an event has none yet).
  const { data: del } = await sb
    .from("delegates")
    .select("event_id, stage")
    .not("event_id", "is", null)
    .limit(20000);
  const byEvent = new Map<string, { confirmed: number; total: number }>();
  for (const d of del ?? []) {
    const g = byEvent.get(d.event_id) ?? { confirmed: 0, total: 0 };
    g.total++;
    if (CONFIRMED_STAGES.includes((d.stage ?? "").toLowerCase())) g.confirmed++;
    byEvent.set(d.event_id, g);
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
        brand: e.brand ?? null,
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
  "id, full_name_clean, job_title, email, personal_email, phone, mobile, office_phone, other_phone, linkedin_url_canonical, location_country, email_mv_result, email_verified_status, scrubby_result, profile_brief, company_id, company_name_submitted, user_managed_fields";

export async function searchCompanies(
  q: string
): Promise<{ id: string; name: string }[]> {
  const sb = supabaseAdmin();
  let query = sb
    .from("companies")
    .select("id, name:company_name_canonical")
    .not("company_name_canonical", "is", null)
    .order("company_name_canonical", { ascending: true })
    .limit(25);
  if (q) query = query.ilike("company_name_canonical", `${q}%`);
  const { data } = await query;
  return (data ?? []) as { id: string; name: string }[];
}

export type DelegateRow = {
  id: string;
  stage: string | null;
  event_brand: string | null;
  event_edition: string | null;
  event_id: string | null;
  contact: any;
  company: { name: string | null } | null;
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

export async function getDelegate(id: string): Promise<DelegateRow | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("delegates")
    .select(
      `id, stage, event_brand, event_edition, event_id, ${REGISTRATION_FIELDS},
       contact:contacts(${CONTACT_FIELDS}, company:companies(name:company_name_canonical))`
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as DelegateRow) ?? null;
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

const APP_BRANDS = ["10DX", "FraudSense", "4WARD"];

export async function getFilterOptions(): Promise<{
  brands: string[];
  editions: string[];
}> {
  const sb = supabaseAdmin();
  // Brands come from the canonical events registry, not from role rows — so every
  // real brand shows (incl. 4WARD) even when it has few/no delegates yet.
  // Roundtables are a separate app.
  const { data: ev } = await sb
    .from("events")
    .select("brand")
    .in("brand", APP_BRANDS);
  const brands = new Set<string>();
  (ev ?? []).forEach((e: any) => { if (e.brand) brands.add(e.brand); });

  // Editions come from the actual (backfilled → canonical) delegate data, so past
  // editions that have delegates still appear and empty-result editions don't.
  const { data } = await sb.from("delegates").select("event_edition").limit(20000);
  const editions = new Set<string>();
  (data ?? []).forEach((r: any) => {
    const ed = (r.event_edition ?? "").trim();
    if (!ed || /roundtable/i.test(ed)) return; // drop blanks + roundtables
    editions.add(ed);
  });
  return {
    brands: Array.from(brands).sort(),
    editions: Array.from(editions).sort(),
  };
}

// Delegate registration lifecycle. Registration-and-payment oriented (not the
// speaker briefed/ready track).
export const STAGES: { value: string; label: string }[] = [
  { value: "identified", label: "Identified" },
  { value: "invited", label: "Invited" },
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
