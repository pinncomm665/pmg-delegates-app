"use client";

import { useEffect, useState } from "react";
import type { TranscriptStatus } from "@/lib/notes";

// Voice-note transcript state under the attachment chips:
//   pending / processing → muted "Transcribing…" pill
//   ready                → transcript text, clamped to 2 lines with "more"
//   error / skipped      → muted "Transcript unavailable" + ghost "Retry"
//                          (admin / reviewer / note author only — the API
//                          route enforces the same rule)
// `showText=false` (Activity Report) keeps only the pill/retry — the feed
// view already coalesces the transcript into the row's summary.

export type TranscriptProps = {
  noteId: string;
  status: TranscriptStatus | null;
  text: string | null;
  canRetry?: boolean;
  showText?: boolean;
  compact?: boolean;
};

export default function TranscriptNote({ noteId, status, text, canRetry = false, showText = true, compact = false }: TranscriptProps) {
  const [local, setLocal] = useState<TranscriptStatus | null>(status);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setLocal(status); }, [status]);

  if (!local) return null;
  const cls = `att-transcript${compact ? " is-compact" : ""}`;

  if (local === "pending" || local === "processing") {
    return (
      <div className={cls}>
        <span className="chip chip-neutral att-tx-pill" aria-live="polite"><span className="btn-spin" aria-hidden="true" />Transcribing…</span>
      </div>
    );
  }

  if (local === "ready") {
    if (!showText || !text) return null;
    const long = text.length > 160 || text.split("\n").length > 2;
    return (
      <div className={cls}>
        <p className={`att-tx-text${open || !long ? "" : " is-clamped"}`}>{text}</p>
        {long && (
          <button type="button" className="att-tx-more" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "less" : "more"}
          </button>
        )}
      </div>
    );
  }

  // error / skipped
  const retry = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/notes/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_id: noteId }),
        cache: "no-store",
      });
      if (r.ok) setLocal("pending");
    } catch {}
    setBusy(false);
  };
  return (
    <div className={cls}>
      <span className="muted att-tx-unavail">Transcript unavailable</span>
      {canRetry && (
        <button type="button" className="btn btn-ghost btn-sm att-tx-retry" onClick={() => void retry()} disabled={busy}>
          {busy ? "Retrying…" : "Retry"}
        </button>
      )}
    </div>
  );
}
