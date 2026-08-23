// Route-level skeleton for the delegates list (breadcrumb + filter bar + rows).
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading delegates" style={{ padding: "20px 24px", maxWidth: 1100 }}>
      <div className="skel" style={{ height: 28, width: 280, marginBottom: 16 }} />
      <div className="card section" style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        <div className="skel" style={{ height: 38, flex: 1 }} />
        <div className="skel" style={{ height: 38, flex: 1 }} />
        <div className="skel" style={{ height: 38, width: 80 }} />
      </div>
      <div className="card" style={{ padding: "4px 0" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
            <div className="skel" style={{ width: 28, height: 28, borderRadius: 999 }} />
            <div className="skel" style={{ height: 14, flex: 2 }} />
            <div className="skel" style={{ height: 14, flex: 2 }} />
            <div className="skel" style={{ height: 14, flex: 1 }} />
            <div className="skel" style={{ height: 24, width: 90 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
