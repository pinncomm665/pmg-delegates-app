"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Hit = {
  id: string;
  name: string;
  job_title: string | null;
  company: string | null;
  edition: string | null;
};

export default function DelegateSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // debounced fetch
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/delegates/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((d) => {
          setHits(d.results ?? []);
          setActive(0);
          setOpen(true);
        })
        .catch(() => setHits([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  // close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (h: Hit) => router.push(`/delegates/${h.id}`);

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        placeholder="Search a delegate by name or company…"
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); if (hits[active]) go(hits[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />

      {open && (q.trim().length >= 2) && (
        <div
          className="card"
          style={{ position: "absolute", zIndex: 20, top: "calc(100% + 4px)", left: 0, right: 0, padding: 4, boxShadow: "0 6px 24px rgba(0,0,0,0.12)", maxHeight: 320, overflowY: "auto" }}
        >
          {loading && hits.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, padding: "8px 10px" }}>Searching…</div>
          ) : hits.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, padding: "8px 10px" }}>No delegates found.</div>
          ) : (
            hits.map((h, i) => (
              <button
                key={h.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h)}
                style={{
                  display: "block", width: "100%", textAlign: "left", border: "none",
                  background: i === active ? "var(--hover, #f1efe8)" : "transparent",
                  padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600 }}>{h.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {[h.job_title, h.company].filter(Boolean).join(" · ") || "—"}
                  {h.edition ? `  ·  ${h.edition}` : ""}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
