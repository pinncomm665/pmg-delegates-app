// Route-level skeleton for the delegate detail page (header + tab strip + fields).
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading delegate" style={{ padding: "20px 24px", maxWidth: 1100 }}>
      <div className="skel" style={{ height: 14, width: 140, marginBottom: 14 }} />
      <div className="card">
        <div className="section" style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div className="skel" style={{ width: 56, height: 56, borderRadius: 999, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skel" style={{ height: 22, width: "50%", marginBottom: 8 }} />
            <div className="skel" style={{ height: 14, width: "70%", marginBottom: 6 }} />
            <div className="skel" style={{ height: 12, width: "40%" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skel" style={{ height: 14, width: 90, margin: "14px 0" }} />
          ))}
        </div>
        <div className="section grid2">
          {Array.from({ length: 2 }).map((_, col) => (
            <div key={col} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skel" style={{ height: 38 }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
