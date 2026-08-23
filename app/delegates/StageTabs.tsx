import Link from "next/link";
import { STAGES, type StageCounts } from "@/lib/data";

// Stage-tab strip — shown for a selected edition AND in the all-editions view
// (aggregate counts from the grouped view). Each tab links to the same list
// with a different `status`, preserving the other filters (brand/edition/
// search/has-*), sort and page size, and resetting to page 1. Horizontally
// scrollable on mobile. These are links (navigation), so the strip is a <nav>
// with aria-current rather than a tablist.
const KEEP = ["brand", "edition", "q", "has_valid_email", "has_phone", "has_linkedin", "sort", "dir", "pageSize"] as const;

export default function StageTabs({
  counts,
  current,
  searchParams,
}: {
  counts: StageCounts;
  current?: string;
  searchParams: Record<string, string | undefined>;
}) {
  const href = (status?: string) => {
    const p = new URLSearchParams();
    for (const k of KEEP) {
      const v = searchParams[k];
      if (v) p.set(k, v);
    }
    if (status) p.set("status", status); // omit → "All" (page resets by dropping ?page)
    const s = p.toString();
    return `/delegates${s ? `?${s}` : ""}`;
  };

  const Tab = ({ label, count, status }: { label: string; count: number; status?: string }) => {
    const active = status ? current === status : !current;
    return (
      <Link href={href(status)} className={`stage-tab${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
        {label}
        <span className="stage-tab-count">{count}</span>
      </Link>
    );
  };

  // These are links (full navigations), not ARIA tabs — so a <nav> with
  // aria-current on the active one, not role="tablist".
  return (
    <nav className="stage-tabs" aria-label="Stages">
      <Tab label="All" count={counts.total} />
      {STAGES.map((s) => (
        <Tab key={s.value} label={s.label} count={counts.byStage[s.value] ?? 0} status={s.value} />
      ))}
    </nav>
  );
}
