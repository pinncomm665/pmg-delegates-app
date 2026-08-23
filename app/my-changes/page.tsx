import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getMyChanges, KIND_LABEL } from "@/lib/changes";
import Shell from "../Shell";
import Breadcrumb from "../Breadcrumb";
import ActivityList from "../ActivityList";

export const dynamic = "force-dynamic";

// The current user's own writes (last 200), filterable by kind — their personal
// audit trail, including anything held for review.
export default async function MyChangesPage({ searchParams }: { searchParams: { kind?: string } }) {
  const user = await requireUser();
  const kind = searchParams.kind && KIND_LABEL[searchParams.kind] ? searchParams.kind : undefined;
  const rows = await getMyChanges(user.id, kind);
  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <Shell user={user}>
      <div className="page-head">
        <Breadcrumb items={[{ label: "Home", href: "/dashboard" }, { label: "My changes" }]} />
        <span className="muted page-head-aside" style={{ fontSize: 13 }}>
          {rows.length} shown{pending ? ` · ${pending} awaiting review` : ""}
        </span>
      </div>
      <nav className="stage-tabs" aria-label="Filter by kind">
        <Link href="/my-changes" className={`stage-tab${!kind ? " active" : ""}`} aria-current={!kind ? "page" : undefined}>All</Link>
        {Object.entries(KIND_LABEL).map(([k, label]) => (
          <Link
            key={k}
            href={`/my-changes?kind=${k}`}
            className={`stage-tab${kind === k ? " active" : ""}`}
            aria-current={kind === k ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="card section">
        <ActivityList rows={rows} showSubject emptyText="You haven’t made any changes yet." />
      </div>
    </Shell>
  );
}
