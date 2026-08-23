import { requireUser } from "@/lib/session";
import { getDashboard } from "@/lib/data";
import { healthColors, healthLabel } from "@/lib/pulse";
import Shell from "../Shell";
import DashboardTable from "./DashboardTable";

export const dynamic = "force-dynamic";

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "16px 18px",
      }}
    >
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 27, fontWeight: 500, marginTop: 5, color: accent ?? "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const { summits, summary } = await getDashboard();
  // Tiles are coloured by the portfolio's health band, not by sign.
  const band = healthColors(healthLabel(summary.avgHealthPct));

  return (
    <Shell user={user}>
      <h2 style={{ margin: "0 0 4px" }}>Pulse dashboard</h2>
      <p className="muted" style={{ margin: "0 0 20px", fontSize: 13 }}>
        Is each summit’s delegate registration healthy against its target?
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(158px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <Metric label="Summits tracked" value={summary.total} />
        <Metric label="On track or ahead" value={summary.onTrack} accent="#3a9e80" />
        <Metric
          label="Weak or critical"
          value={summary.weakOrCritical}
          accent={summary.weakOrCritical ? "var(--danger)" : undefined}
        />
        <Metric label="Avg delegate health" value={`${summary.avgHealthPct}%`} accent={band.fg} />
        <Metric
          label="Avg remaining to target"
          value={summary.avgGap}
          accent={band.fg}
        />
      </div>

      <DashboardTable summits={summits} />
    </Shell>
  );
}
