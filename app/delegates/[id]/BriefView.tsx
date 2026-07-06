import { generateBrief } from "./actions";
import type { ContactProfile } from "@/lib/data";

// Structural renderer — all data-driven, never raw markdown (no pipes bug).
function Para({ label, text }: { label: string; text?: string | null }) {
  if (!text) return null;
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, color: "var(--muted)" }}>{label}</div>
      <p style={{ fontSize: 13.5, margin: "3px 0 0", lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}

function Points({ points }: { points?: string[] }) {
  if (!points?.length) return null;
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, color: "var(--muted)" }}>Talking points</div>
      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
        {points.map((p, i) => <li key={i} style={{ fontSize: 13.5, marginBottom: 3 }}>{p}</li>)}
      </ul>
    </div>
  );
}

function Cautions({ rows }: { rows?: { caution: string; handling: string }[] }) {
  if (!rows?.length) return null;
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, color: "var(--muted)", marginBottom: 4 }}>Cautions</div>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid var(--border)", width: "45%" }}>Caution</th>
            <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid var(--border)" }}>How to handle</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>{r.caution}</td>
              <td style={{ padding: "5px 8px", borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>{r.handling}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function Sources({ sources }: { sources?: { title: string | null; url: string }[] }) {
  if (!sources?.length) return null;
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, color: "var(--muted)" }}>Sources</div>
      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
        {sources.map((s, i) => (
          <li key={i} style={{ fontSize: 12.5 }}><a href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a></li>
        ))}
      </ul>
    </div>
  );
}

export default function BriefView({ profile, delegateId, ret }: { profile: ContactProfile | null; delegateId: string; ret: string }) {
  const b = profile?.brief && typeof profile.brief === "object" ? profile.brief : null;
  const status = profile?.status ?? null;
  const generating = status === "pending" || status === "generating";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Attend-value research — why invite them to this summit.
          {profile?.generated_at ? ` · updated ${new Date(profile.generated_at).toLocaleDateString()}` : ""}
        </p>
        <form action={generateBrief}>
          <input type="hidden" name="delegateId" value={delegateId} />
          <input type="hidden" name="return" value={ret} />
          <button className="btn" type="submit" style={{ padding: "6px 10px" }}>{b ? "↻ Regenerate" : "Generate"}</button>
        </form>
      </div>

      {generating ? (
        <p className="muted" style={{ fontSize: 13 }}>Research in progress — refresh in ~1 minute.</p>
      ) : !b ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No background notes yet. Click <strong>Generate</strong> to research this delegate — the brief appears here in ~1 minute.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Para label="Summary" text={b.summary} />
          <Para label="Relevance" text={b.relevance} />
          <Para label="Engagement angle" text={b.angle} />
          <Points points={Array.isArray(b.talking_points) ? b.talking_points : undefined} />
          <Cautions rows={Array.isArray(b.cautions) ? b.cautions : undefined} />
          <Sources sources={Array.isArray(b.sources) ? b.sources : undefined} />
        </div>
      )}
    </div>
  );
}
