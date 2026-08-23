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

// ONE search box, two behaviours:
//   • type → typeahead suggestions; ↓/↑ to highlight, Enter/click on a highlighted
//     suggestion → open that delegate (with ?return= so "back" lands on this view)
//   • Enter with NO suggestion highlighted → the surrounding filter form submits
//     and the list is filtered by ?q= (this input is the form's `q` field).
// Each keystroke aborts the previous fetch (AbortController).
export default function DelegateSearch({
  initialQ = "",
  returnQs = "",
}: {
  initialQ?: string;
  returnQs?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1); // -1 = nothing highlighted → Enter submits the form
  const boxRef = useRef<HTMLDivElement>(null);
  const typed = useRef(false); // only fetch after the user types (not for the initial ?q)

  // debounced + abortable fetch
  useEffect(() => {
    if (!typed.current) return;
    if (q.trim().length < 2) {
      setHits([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/delegates/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => {
          setHits(d.results ?? []);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => { /* aborted or failed — keep previous hits */ })
        .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  // close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (h: Hit) => {
    setOpen(false);
    const ret = returnQs ? `?return=${encodeURIComponent(returnQs)}` : "";
    router.push(`/delegates/${h.id}${ret}`);
  };

  const listId = "dlg-search-list";

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        name="q"
        value={q}
        onChange={(e) => { typed.current = true; setQ(e.target.value); }}
        onFocus={() => hits.length && setOpen(true)}
        placeholder="Search by name or company — Enter to filter the list"
        aria-label="Search delegates"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 && hits[active] ? `dlg-opt-${hits[active].id}` : undefined}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); return; }
          if (!open || hits.length === 0) return; // Enter → native form submit (filter by q)
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
          else if (e.key === "Enter" && active >= 0 && hits[active]) { e.preventDefault(); go(hits[active]); }
        }}
      />

      {open && (q.trim().length >= 2) && (
        <div
          id={listId}
          role="listbox"
          className="card"
          style={{ position: "absolute", zIndex: 20, top: "calc(100% + 4px)", left: 0, right: 0, padding: 4, boxShadow: "0 6px 24px rgba(0,0,0,0.12)", maxHeight: 320, overflowY: "auto" }}
        >
          {loading && hits.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, padding: "8px 10px" }}>Searching…</div>
          ) : hits.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, padding: "8px 10px" }}>No delegates found — press Enter to filter the list anyway.</div>
          ) : (
            <>
              {hits.map((h, i) => (
                <button
                  key={h.id}
                  id={`dlg-opt-${h.id}`}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", border: "none",
                    background: i === active ? "var(--hover)" : "transparent",
                    padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{h.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {[h.job_title, h.company].filter(Boolean).join(" · ") || "—"}
                    {h.edition ? `  ·  ${h.edition}` : ""}
                  </div>
                </button>
              ))}
              <div className="muted" style={{ fontSize: 11, padding: "6px 10px", borderTop: "1px solid var(--border)" }}>
                ↑↓ pick a delegate · Enter filters the list by “{q.trim()}”
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
