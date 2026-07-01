"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateCompany } from "./actions";

type Company = { id: string; name: string };

export default function UpdateCompany({
  delegateId,
  current,
}: {
  delegateId: string;
  current: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/companies?q=${encodeURIComponent(q)}`);
        const d = (await r.json()) as Company[];
        if (active) setResults(d);
      } finally {
        if (active) setLoading(false);
      }
    }, 150);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q, open]);

  async function pick(c: Company) {
    setSaving(true);
    await updateCompany(delegateId, c.id);
    setOpen(false);
    setQ("");
    setSaving(false);
    router.refresh();
  }

  return (
    <div ref={boxRef} style={{ marginBottom: 18 }}>
      {!open ? (
        <button
          className="btn"
          type="button"
          onClick={() => setOpen(true)}
          disabled={saving}
        >
          Update company
        </button>
      ) : (
        <div className="card" style={{ padding: 10 }}>
          <label>Search companies in the CRM</label>
          <input
            autoFocus
            value={q}
            placeholder="Start typing…"
            onChange={(e) => setQ(e.target.value)}
          />
          <div
            style={{
              maxHeight: 200,
              overflowY: "auto",
              marginTop: 8,
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
          >
            {loading && (
              <div className="muted" style={{ padding: 10, fontSize: 13 }}>
                Searching…
              </div>
            )}
            {!loading && results.length === 0 && (
              <div className="muted" style={{ padding: 10, fontSize: 13 }}>
                No matches. (To add a new company, use “Flag: changed role”.)
              </div>
            )}
            {!loading &&
              results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c)}
                  disabled={saving}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  {c.name}
                </button>
              ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setOpen(false);
                setQ("");
              }}
              style={{ padding: "6px 10px" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
