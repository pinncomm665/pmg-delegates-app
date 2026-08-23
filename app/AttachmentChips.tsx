import { fmtDuration, type NoteAttachment } from "@/lib/notes";

// Small attachment chips for a manual note: files open in a new tab via the
// signed-URL route; voice notes render an inline player. Server-safe.
const fileUrl = (path: string) => `/api/notes/file?path=${encodeURIComponent(path)}`;

function fmtSize(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentChips({ items, compact = false }: { items: NoteAttachment[]; compact?: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <div className={`att-chips${compact ? " is-compact" : ""}`}>
      {items.map((a, i) =>
        a.kind === "voice" ? (
          <span key={`${a.path}-${i}`} className="att-voice">
            <span className="chip chip-neutral att-chip" title={a.name}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
              Voice note {a.duration_s ? `(${fmtDuration(a.duration_s)})` : ""}
            </span>
            <audio controls preload="none" src={fileUrl(a.path)} className="att-audio" />
          </span>
        ) : (
          <a key={`${a.path}-${i}`} className="chip chip-neutral att-chip" href={fileUrl(a.path)} target="_blank" rel="noreferrer" title={`${a.name}${a.size ? ` · ${fmtSize(a.size)}` : ""}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.5 12.5 21a5 5 0 0 1-7-7L14 5.5a3.5 3.5 0 0 1 5 5L10.5 19a2 2 0 0 1-3-3L16 7.5" /></svg>
            <span className="att-name">{a.name}</span>
          </a>
        )
      )}
    </div>
  );
}
