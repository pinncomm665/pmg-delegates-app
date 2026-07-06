import { requireUser } from "@/lib/session";
import { getDashboard } from "@/lib/data";
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
  const gapStr = summary.avgGap > 0 ? `+${summary.avgGap}` : `${summary.avgGap}`;

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
          accent={summary.weakOrCritical ? "#c0392b" : undefined}
        />
        <Metric label="Avg delegate health" value={`${summary.avgHealthPct}%`} />
        <Metric
          label="Avg gap to pace"
          value={gapStr}
          accent={summary.avgGap < 0 ? "#c0392b" : "#3a9e80"}
        />
      </div>

      <DashboardTable summits={summits} />
    </Shell>
  );
}
