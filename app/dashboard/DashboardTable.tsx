"use client";

import { useState } from "react";
import {
  healthColors,
  type SummitPulse,
  type HealthLabel,
} from "@/lib/pulse";

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function Pill({ label, pct }: { label: HealthLabel; pct: number }) {
  const c = healthColors(label);
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {label} · {Math.round(pct)}%
    </span>
  );
}

function PulseBar({ s, width = 160 }: { s: SummitPulse; width?: number }) {
  const c = healthColors(s.label);
  const fill = Math.min(s.confirmed / s.target, 1) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          position: "relative",
          height: 11,
          width,
          flexShrink: 0,
          background: "#ecebe4",
          borderRadius: 6,
          overflow: "hidden",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.08)",
        }}
        title={`${s.confirmed} of ${s.target} confirmed`}
      >
        {/* quarter gridlines for visual scale */}
        {[25, 50, 75].map((p) => (
          <div
            key={p}
            style={{ position: "absolute", left: `${p}%`, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.5)" }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${fill}%`,
            background: `linear-gradient(90deg, ${c.bar}b3, ${c.bar})`,
            borderRadius: 6,
            transition: "width .55s cubic-bezier(.4,0,.2,1)",
            boxShadow: fill > 0 ? `0 0 7px ${c.bar}55` : "none",
          }}
        />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: c.fg, minWidth: 30, textAlign: "right" }}>
        {Math.round(fill)}%
      </span>
    </div>
  );
}

function gapNode(gap: number) {
  if (gap === 0)
    return <span style={{ color: "#0f6e56", fontWeight: 600 }}>✓ met</span>;
  return (
    <span style={{ fontWeight: 500 }}>
      {gap}
      <span className="muted" style={{ fontSize: 11 }}> to go</span>
    </span>
  );
}

export default function DashboardTable({ summits }: { summits: SummitPulse[] }) {
  const [sel, setSel] = useState<SummitPulse | null>(null);

  if (summits.length === 0) {
    return (
      <div className="card section" style={{ color: "var(--muted)" }}>
        No upcoming summits with delegates yet.
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Summit</th>
              <th>Date</th>
              <th style={{ textAlign: "right" }}>Confirmed</th>
              <th>Progress</th>
              <th style={{ textAlign: "right" }}>Gap</th>
              <th>Health</th>
            </tr>
          </thead>
          <tbody>
            {summits.map((s) => (
              <tr
                key={s.event_id}
                onClick={() => setSel(s)}
                style={{ cursor: "pointer" }}
              >
                <td style={{ fontWeight: 500 }}>{s.name}</td>
                <td className="muted">
                  {fmtDate(s.date)}
                  <div style={{ fontSize: 11 }}>{s.daysLeft} days left</div>
                </td>
                <td style={{ textAlign: "right" }}>
                  {s.confirmed}
                  <span className="muted" style={{ fontSize: 11 }}> / {s.target}</span>
                </td>
                <td><PulseBar s={s} /></td>
                <td style={{ textAlign: "right" }}>{gapNode(s.gap)}</td>
                <td><Pill label={s.label} pct={s.progressPct} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && (
        <>
          <div
            onClick={() => setSel(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(20,20,18,0.28)",
              zIndex: 40,
            }}
          />
          <aside
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              height: "100%",
              width: 380,
              maxWidth: "90vw",
              background: "var(--card)",
              borderLeft: "1px solid var(--border)",
              boxShadow: "-8px 0 30px rgba(0,0,0,0.08)",
              zIndex: 50,
              padding: "22px 24px",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 500 }}>{sel.name}</div>
                <div className="muted" style={{ fontSize: 13 }}>{fmtDate(sel.date)}</div>
              </div>
              <button className="btn" style={{ padding: "4px 10px" }} onClick={() => setSel(null)}>
                Close
              </button>
            </div>

            <div style={{ margin: "18px 0" }}>
              <Pill label={sel.label} pct={sel.progressPct} />
            </div>

            <PulseBar s={sel} width={300} />
            <div className="muted" style={{ fontSize: 11, marginTop: 6, display: "flex", justifyContent: "space-between" }}>
              <span>{sel.confirmed} confirmed</span>
              <span>target {sel.target}</span>
            </div>

            <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 1 }}>
              {[
                ["Days left", `${sel.daysLeft}`],
                ["Confirmed delegates", `${sel.confirmed}`],
                ["Gap to target", `${sel.gap}`],
                ["Target progress", `${Math.round(sel.finalProgress * 100)}%`],
                ["Total delegates (all stages)", `${sel.total}`],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
                  <span className="muted">{k}</span>
                  <span style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>

            <p className="muted" style={{ fontSize: 12, marginTop: 18 }}>
              Delegate trend will appear here once history is tracked.
            </p>
          </aside>
        </>
      )}
    </>
  );
}
