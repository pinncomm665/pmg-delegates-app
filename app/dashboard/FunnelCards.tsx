import Link from "next/link";
import type { EventFunnel } from "@/lib/funnel";

// Sequential single-hue ramp (the app accent, light → dark with funnel depth) —
// the same treatment as the roundtables Pulse so the three apps read alike.
const RAMP = ["#cfe8df", "#a7d4c4", "#7dc0a8", "#54a98c", "#2f8f70", "#0f6e56", "#0b5a46"];

function FunnelBars({ edition, rows }: { edition: string; rows: EventFunnel["rows"] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {rows.map((r, i) => {
        const pct = Math.max((r.count / max) * 100, r.count > 0 ? 4 : 1.5);
        return (
          <Link
            key={r.stage}
            href={`/delegates?edition=${encodeURIComponent(edition)}&status=${r.stage}`}
            title={`${r.label}: ${r.count} — open this stage on the list`}
            className="funnel-row"
            style={{ display: "grid", gridTemplateColumns: "120px 1fr 44px", alignItems: "center", gap: 10, padding: "3px 6px", margin: "0 -6px", borderRadius: 8, color: "inherit", textDecoration: "none" }}
          >
            <span style={{ fontSize: 13 }}>{r.label}</span>
            <span aria-hidden style={{ display: "flex", justifyContent: "center", minWidth: 0 }}>
              <span style={{ width: `${pct}%`, height: 16, borderRadius: 4, background: r.count > 0 ? RAMP[Math.min(i, RAMP.length - 1)] : "var(--border, #e3ded2)" }} />
            </span>
            <span style={{ fontSize: 13, whiteSpace: "nowrap", textAlign: "right" }}><strong>{r.count}</strong></span>
          </Link>
        );
      })}
    </div>
  );
}

// One card per upcoming summit: where every delegate currently sits. Each bar is
// the same count as that stage's tab on the list, and links straight to it.
export default function FunnelCards({ items }: { items: { name: string; funnel: EventFunnel }[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <h3 style={{ margin: "28px 0 4px", fontSize: "var(--fs-lg)" }}>Pipeline by stage</h3>
      <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>Every bar is clickable — it opens that stage on the list.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        {items.map(({ name, funnel }) => (
          <div key={funnel.event_id} className="card" style={{ padding: 16 }}>
            <h4 style={{ margin: "0 0 2px", fontSize: 15 }}>{name}</h4>
            <p className="muted" style={{ margin: "0 0 10px", fontSize: 12 }}>{funnel.total.toLocaleString()} delegate{funnel.total === 1 ? "" : "s"} on this edition</p>
            <FunnelBars edition={name} rows={funnel.rows} />
          </div>
        ))}
      </div>
    </>
  );
}
