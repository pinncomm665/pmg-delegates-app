import Link from "next/link";
import { STAGES, type StageCounts } from "@/lib/data";

// Stage-tab strip shown when an event is selected. Each tab links to the same
// list with a different `status`, preserving the other filters (brand/edition/
// search/has-*) and the sort, and resetting to page 1. Horizontally scrollable
// on mobile.
const KEEP = ["brand", "edition", "q", "has_valid_email", "has_phone", "has_linkedin", "sort", "dir"] as const;

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
      <Link href={href(status)} className={`stage-tab${active ? " active" : ""}`}>
        {label}
        <span className="stage-tab-count">{count}</span>
      </Link>
    );
  };

  return (
    <div className="stage-tabs" role="tablist" aria-label="Delegate stages">
      <Tab label="All" count={counts.total} />
      {STAGES.map((s) => (
        <Tab key={s.value} label={s.label} count={counts.byStage[s.value] ?? 0} status={s.value} />
      ))}
    </div>
  );
}
