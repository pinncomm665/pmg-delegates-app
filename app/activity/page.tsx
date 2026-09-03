import { requireUser, isReviewer } from "@/lib/session";
import {
  getActivityFeed,
  getActivityOwners,
  getActivitySummary,
  ALL_OWNERS_PARAM,
  defaultSince,
  isActivityType,
  periodSince,
  DEFAULT_PERIOD,
  SUMMARY_PERIODS,
  SCOPE_NOUN,
  type SummaryPeriod,
} from "@/lib/data";
import Shell from "../Shell";
import Breadcrumb from "@pmg/team-ui/ui/Breadcrumb";
import ActivityReport from "./ActivityReport";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SCOPE_NOTE = `Only activity on ${SCOPE_NOUN} is shown.`;

// Activity Report — one consolidated, chronological log of team activity on
// the contacts that hold a role in THIS app (the accountability view, scoped
// per app — see lib/activityFeed.ts SCOPE). Data = pmg-agent view
// `team_activity_feed`; filters live in the URL so the page is shareable and
// the back button restores it. Server-paginated, 50 per page.
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: {
    q?: string;
    activity?: string | string[];
    owner?: string;
    since?: string;
    until?: string;
    sort?: string;
    page?: string;
    period?: string;
  };
}) {
  const user = await requireUser();
  const q = (searchParams.q ?? "").trim();
  const rawTypes = Array.isArray(searchParams.activity)
    ? searchParams.activity
    : searchParams.activity
      ? searchParams.activity.split(",")
      : [];
  const activity = rawTypes.map((s) => s.trim()).filter(isActivityType);
  // Owner: "" = all tracked owners (default); a tracked owner's email; or
  // "all" = every row incl. system/untracked — admin/reviewer escape hatch.
  let owner = (searchParams.owner ?? "").trim().toLowerCase();
  if (owner === ALL_OWNERS_PARAM && !isReviewer(user)) owner = "";
  const since = DAY.test(searchParams.since ?? "") ? (searchParams.since as string) : defaultSince(30);
  const until = DAY.test(searchParams.until ?? "") ? (searchParams.until as string) : "";
  const sort: "asc" | "desc" = searchParams.sort === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const period: SummaryPeriod = SUMMARY_PERIODS.some((p) => p.k === searchParams.period)
    ? (searchParams.period as SummaryPeriod)
    : DEFAULT_PERIOD;

  const [feed, owners, summary] = await Promise.all([
    getActivityFeed({ q, activity, owner, since, until: until || undefined, sort, page, pageSize: PAGE_SIZE }),
    getActivityOwners({ since }),
    getActivitySummary({ since: periodSince(period) }),
  ]);
  const pageCount = Math.max(1, Math.ceil(feed.total / PAGE_SIZE));

  return (
    <Shell user={user}>
      <div className="page-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <Breadcrumb items={[{ label: "Home", href: "/dashboard" }, { label: "Activity Report" }]} />
          <p className="muted" style={{ fontSize: 13, margin: "2px 0 0" }}>{SCOPE_NOTE}</p>
        </div>
        <span className="muted page-head-aside" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
          {feed.available ? (
            <>
              <strong style={{ color: "var(--text)", fontSize: 15 }}>{feed.total.toLocaleString()}</strong>{" "}
              {feed.total === 1 ? "activity" : "activities"}
            </>
          ) : null}
        </span>
      </div>

      <ActivityReport
        rows={feed.rows}
        total={feed.total}
        available={feed.available}
        error={feed.error ?? null}
        owners={owners}
        summary={summary}
        period={period}
        filters={{ q, activity, owner, since, until, sort }}
        page={page}
        pageCount={pageCount}
        pageSize={PAGE_SIZE}
        viewerEmail={user.email}
        viewerElevated={isReviewer(user)}
        scopeNote={SCOPE_NOTE}
      />
    </Shell>
  );
}
