import Link from "next/link";
import { kindLabel, timeAgo, type ChangeRow } from "@/lib/changes";

// Compact who/when/what list of contact_change_requests rows — used by the
// detail page's Activity tab and by /my-changes. Server-safe.
function fmtValue(v: string | null): string {
  if (v == null || v === "") return "—";
  // registration rows carry a JSON before/after map — render as "k: v, k: v"
  if (v.startsWith("{")) {
    try {
      const o = JSON.parse(v) as Record<string, unknown>;
      const parts = Object.entries(o).map(([k, x]) => `${k}: ${x === null || x === "" ? "—" : String(x)}`);
      return parts.join(" · ") || "—";
    } catch {
      return v;
    }
  }
  return v;
}

function statusBadge(s: string) {
  if (s === "auto_applied" || s === "approved") return <span className="badge badge-success">{s === "approved" ? "approved" : "applied"}</span>;
  if (s === "pending") return <span className="badge badge-warn">pending review</span>;
  if (s === "rejected") return <span className="badge">rejected</span>;
  return <span className="badge">{s}</span>;
}

export default function ActivityList({
  rows,
  showSubject = false,
  emptyText = "No activity yet.",
}: {
  rows: ChangeRow[];
  showSubject?: boolean;
  emptyText?: string;
}) {
  if (rows.length === 0) return <p className="muted" style={{ fontSize: 13, margin: 0 }}>{emptyText}</p>;
  return (
    <ul className="activity">
      {rows.map((r) => {
        const proposed = r.kind === "company" && r.proposed_company ? r.proposed_company : fmtValue(r.proposed_value);
        const subject = r.proposed_company && r.kind !== "company" ? ` @ ${r.proposed_company}` : "";
        return (
          <li key={r.id} className="activity-row">
            <div className="activity-main">
              <span className="badge badge-info">{kindLabel(r.kind)}</span>
              {r.field && r.kind !== "stage" && r.kind !== "stage_revert" ? (
                <span className="muted" style={{ fontSize: 12 }}>{r.field}</span>
              ) : null}
              <span className="activity-diff">
                <span className="muted">{fmtValue(r.current_value)}</span>
                <span aria-hidden="true"> → </span>
                <strong>{proposed}{subject}</strong>
              </span>
              {statusBadge(r.status)}
            </div>
            <div className="activity-meta muted">
              {r.submitted_by_email ?? "—"} · <time dateTime={r.created_at} title={new Date(r.created_at).toLocaleString()}>{timeAgo(r.created_at)}</time>
              {showSubject && r.delegate_id ? (
                <> · <Link href={`/delegates/${r.delegate_id}?tab=activity`}>{r.event_edition ?? "delegate"} ›</Link></>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
