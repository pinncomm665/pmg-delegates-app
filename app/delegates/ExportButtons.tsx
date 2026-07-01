"use client";

import { useState } from "react";

// Export the current filtered delegate view — XLSX download or save to Google
// Drive as a Sheet (lands in the "PMG Delegate Exports" folder). filterQs is the
// active filter querystring so the export matches exactly what's on screen.
export default function ExportButtons({ filterQs, count }: { filterQs: string; count: number }) {
  const [drive, setDrive] = useState<{ state: "idle" | "saving" | "done" | "error"; url?: string; msg?: string }>({ state: "idle" });
  const qs = filterQs ? `&${filterQs}` : "";

  const saveToDrive = async () => {
    setDrive({ state: "saving" });
    try {
      const r = await fetch(`/api/delegates/export?mode=drive${qs}`);
      const d = await r.json();
      if (d.url) setDrive({ state: "done", url: d.url });
      else setDrive({ state: "error", msg: d.error ?? "failed" });
    } catch {
      setDrive({ state: "error", msg: "failed" });
    }
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <a className="btn" href={`/api/delegates/export?mode=xlsx${qs}`} title={`Export ${count} delegates to Excel`}>
        ⬇ Export XLSX
      </a>
      <button type="button" className="btn" onClick={saveToDrive} disabled={drive.state === "saving"}>
        {drive.state === "saving" ? "Saving to Drive…" : "Save to Drive"}
      </button>
      {drive.state === "done" && drive.url && (
        <a href={drive.url} target="_blank" rel="noreferrer" className="badge badge-success" style={{ textDecoration: "none" }}>
          ✓ Open Sheet
        </a>
      )}
      {drive.state === "error" && <span className="badge badge-warn" title={drive.msg}>Drive save failed</span>}
    </div>
  );
}
