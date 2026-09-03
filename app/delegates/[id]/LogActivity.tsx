"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDialog } from "@pmg/team-ui/ui/useDialog";
import { useToast } from "@pmg/team-ui/ui/Toast";
import { NOTE_CHANNELS, NOTE_FILE_MAX_BYTES, fmtDuration, type NoteAttachment, type NoteChannel } from "@pmg/team-ui/lib/notes";
import { logActivity } from "./actions";

// "Log activity" — the quick action next to the stage pill. Three ways to log:
// type text, attach files (multi, ≤ 25 MB each) and/or record a voice note in
// the browser (MediaRecorder). Attachments upload first (POST /api/notes/upload,
// one per file), then the server action writes contact_notes (+ the change log)
// and the page refreshes so the feed / timeline pick it up on next regen.

type Pending = { file: Blob; name: string; type: string; kind: "file" | "voice"; duration_s?: number; size: number; id: string };

function localNowValue(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch {}
  }
  return "";
}
function extFor(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export default function LogActivity({ delegateId, contactId, ret, disabled = false }: { delegateId: string; contactId: string; ret: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm log-act-btn"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "Read-only" : "Log a call, WhatsApp, meeting or note"}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        Log activity
      </button>
      {open && <Dialog delegateId={delegateId} contactId={contactId} ret={ret} onClose={() => setOpen(false)} />}
    </>
  );
}

function Dialog({ delegateId, contactId, ret, onClose }: { delegateId: string; contactId: string; ret: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const ref = useDialog(onClose);
  const [channel, setChannel] = useState<NoteChannel>("WhatsApp");
  const [text, setText] = useState("");
  const [at, setAt] = useState(localNowValue());
  const [files, setFiles] = useState<Pending[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // ── Voice note (MediaRecorder) ─────────────────────────────────────────
  const canRecord = typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const [recState, setRecState] = useState<"idle" | "recording" | "done">("idle");
  const [recSecs, setRecSecs] = useState(0);
  const [voice, setVoice] = useState<{ blob: Blob; url: string; duration_s: number; mime: string } | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const stopTracks = () => { recRef.current?.stream.getTracks().forEach((t) => t.stop()); };

  const startRec = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.current.push(e.data); };
      mr.onstop = () => {
        const m = mr.mimeType || mime || "audio/webm";
        const blob = new Blob(chunks.current, { type: m });
        const dur = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
        if (voice?.url) URL.revokeObjectURL(voice.url);
        setVoice({ blob, url: URL.createObjectURL(blob), duration_s: dur, mime: m });
        setRecState("done");
        stream.getTracks().forEach((t) => t.stop());
      };
      recRef.current = mr;
      startedAt.current = Date.now();
      setRecSecs(0);
      mr.start(250);
      setRecState("recording");
      timer.current = setInterval(() => setRecSecs(Math.round((Date.now() - startedAt.current) / 1000)), 500);
    } catch (e: any) {
      setErr(e?.name === "NotAllowedError" ? "Microphone access was blocked — allow it in the browser to record." : "Couldn’t start recording.");
    }
  };
  const stopRec = () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    try { recRef.current?.stop(); } catch {}
  };
  const discardVoice = () => {
    if (voice?.url) URL.revokeObjectURL(voice.url);
    setVoice(null); setRecState("idle"); setRecSecs(0);
  };
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); stopTracks(); if (voice?.url) URL.revokeObjectURL(voice.url); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Files ───────────────────────────────────────────────────────────────
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next: Pending[] = [];
    for (const f of Array.from(list)) {
      if (f.size > NOTE_FILE_MAX_BYTES) { setErr(`${f.name} is larger than 25 MB`); continue; }
      next.push({ file: f, name: f.name, type: f.type || "application/octet-stream", kind: "file", size: f.size, id: `${f.name}-${f.size}-${f.lastModified}` });
    }
    setFiles((xs) => [...xs, ...next.filter((n) => !xs.some((x) => x.id === n.id))]);
    if (fileInput.current) fileInput.current.value = "";
  };
  const removeFile = (id: string) => setFiles((xs) => xs.filter((x) => x.id !== id));

  const upload = useCallback(async (p: Pending): Promise<NoteAttachment> => {
    const fd = new FormData();
    fd.set("contact_id", contactId);
    fd.set("file", p.file, p.name);
    fd.set("kind", p.kind);
    if (p.duration_s) fd.set("duration_s", String(p.duration_s));
    const r = await fetch("/api/notes/upload", { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? `Upload failed (${r.status})`);
    return { name: d.name ?? p.name, path: d.path, type: d.type ?? p.type, size: d.size ?? p.size, kind: p.kind, duration_s: p.duration_s };
  }, [contactId]);

  const canSave = !saving && (text.trim().length > 0 || files.length > 0 || !!voice) && recState !== "recording";

  const save = async () => {
    if (!canSave) return;
    setSaving(true); setErr(null);
    try {
      const toUpload: Pending[] = [...files];
      if (voice) toUpload.push({ file: voice.blob, name: `voice-note-${Date.now()}.${extFor(voice.mime)}`, type: voice.mime, kind: "voice", duration_s: voice.duration_s, size: voice.blob.size, id: "voice" });
      const attachments: NoteAttachment[] = [];
      for (let i = 0; i < toUpload.length; i++) {
        setProgress(`Uploading ${i + 1} of ${toUpload.length}…`);
        attachments.push(await upload(toUpload[i]));
      }
      setProgress(toUpload.length ? "Saving note…" : null);
      const atIso = at ? new Date(at).toISOString() : new Date().toISOString();
      const res = await logActivity({ delegateId, contactId, channel, text: text.trim(), at: atIso, attachments, ret });
      if (!res.ok) { setErr(res.error); return; }
      toast.push({ message: res.message ?? "Activity logged" });
      onClose();
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Couldn’t save the note");
    } finally {
      setSaving(false); setProgress(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="log-act-title" tabIndex={-1} onClick={(e) => e.stopPropagation()} className="card modal log-act" style={{ maxWidth: 480 }}>
        <h3 id="log-act-title" style={{ marginTop: 0, fontSize: "var(--fs-lg)" }}>Log activity</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>A WhatsApp, call, meeting or note that the system can’t capture on its own. It appears in the contact’s timeline and the team Activity Report.</p>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="log-act-channel">Channel</label>
            <select id="log-act-channel" value={channel} onChange={(e) => setChannel(e.target.value as NoteChannel)}>
              {NOTE_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="log-act-at">When</label>
            <input id="log-act-at" className="input" type="datetime-local" value={at} max={localNowValue()} onChange={(e) => setAt(e.target.value)} />
          </div>
          <div className="field span-2">
            <label htmlFor="log-act-text">What happened{(files.length || voice) ? " (optional)" : ""}</label>
            <textarea id="log-act-text" className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. WhatsApped about the panel slot — will confirm by Friday" autoFocus />
          </div>
        </div>

        {/* Attachments */}
        <div className="log-act-att">
          <div className="log-act-att-row">
            <button type="button" className="btn btn-sm" onClick={() => fileInput.current?.click()} disabled={saving}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.5 12.5 21a5 5 0 0 1-7-7L14 5.5a3.5 3.5 0 0 1 5 5L10.5 19a2 2 0 0 1-3-3L16 7.5" /></svg>
              Attach files
            </button>
            <input ref={fileInput} type="file" multiple hidden accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={(e) => addFiles(e.target.files)} />
            {canRecord && recState === "idle" && (
              <button type="button" className="btn btn-sm" onClick={startRec} disabled={saving}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                Record voice note
              </button>
            )}
            {recState === "recording" && (
              <button type="button" className="btn btn-sm btn-danger log-act-rec" onClick={stopRec}>
                <span className="log-act-dot" aria-hidden="true" /> Stop · {fmtDuration(recSecs)}
              </button>
            )}
            {recState === "done" && (
              <button type="button" className="btn btn-sm" onClick={() => { discardVoice(); void startRec(); }} disabled={saving}>Re-record</button>
            )}
          </div>
          {voice && (
            <div className="log-act-voice">
              <span className="chip chip-neutral">Voice note · {fmtDuration(voice.duration_s)}</span>
              <audio controls src={voice.url} className="att-audio" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={discardVoice} disabled={saving} aria-label="Remove voice note">Remove</button>
            </div>
          )}
          {files.length > 0 && (
            <ul className="log-act-files">
              {files.map((f) => (
                <li key={f.id}>
                  <span className="att-name">{f.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{(f.size / 1024 / 1024).toFixed(f.size > 1024 * 1024 ? 1 : 2)} MB</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeFile(f.id)} disabled={saving} aria-label={`Remove ${f.name}`}>×</button>
                </li>
              ))}
            </ul>
          )}
          {!canRecord && <p className="help" style={{ margin: "4px 0 0" }}>Voice recording isn’t supported in this browser.</p>}
        </div>

        {err && <p style={{ color: "var(--danger)", fontSize: 13 }} role="alert">{err}</p>}
        {progress && <p className="help" aria-live="polite">{progress}</p>}

        <div className="form-actions log-act-actions" style={{ justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={save} disabled={!canSave}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
