import { supabaseAdmin } from "./supabaseAdmin";

// Manual activity notes ("Log activity" on the contact header) → pmg-agent
// table `contact_notes`. Columns `channel`, `author_email` and `attachments`
// arrive with pmg-agent migration 217; until it lands, the insert falls back
// column-by-column (PostgREST names the missing column in its error) so the
// note is never lost — the channel is then prefixed into the text.

export const NOTE_CHANNELS = ["WhatsApp", "Phone", "Meeting", "Note", "Other"] as const;
export type NoteChannel = (typeof NOTE_CHANNELS)[number];
export const isNoteChannel = (v: string): v is NoteChannel => (NOTE_CHANNELS as readonly string[]).includes(v);

export type NoteAttachment = {
  name: string;
  path: string; // storage object path inside the `contact-notes` bucket
  type: string; // mime
  size: number;
  kind: "file" | "voice";
  duration_s?: number;
};

export const NOTES_BUCKET = "contact-notes";
export const NOTE_FILE_MAX_BYTES = 25 * 1024 * 1024;

export function isAllowedNoteMime(type: string): boolean {
  const t = (type || "").toLowerCase();
  return (
    t.startsWith("image/") ||
    t.startsWith("audio/") ||
    t.startsWith("video/") ||
    t === "application/pdf" ||
    t === "text/plain" ||
    t === "text/csv" ||
    t.startsWith("application/vnd.openxmlformats-officedocument") ||
    t === "application/msword" ||
    t === "application/vnd.ms-excel" ||
    t === "application/vnd.ms-powerpoint" ||
    t === "application/octet-stream"
  );
}

export function slugFilename(name: string): string {
  const base = (name || "file").replace(/[/\\]/g, "_");
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
  const ext = dot > 0 ? base.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10) : "";
  return `${stem}${ext}`;
}

export function notePath(contactId: string, filename: string): string {
  return `contacts/${contactId}/${Date.now()}-${slugFilename(filename)}`;
}

// A storage path this app may sign: must be under contacts/<uuid>/ — the
// caller then checks that contact is visible in this app.
export function contactIdFromNotePath(path: string): string | null {
  const m = /^contacts\/([0-9a-f-]{36})\/[^/]+$/i.exec(path);
  return m ? m[1].toLowerCase() : null;
}

export function fmtDuration(s: number | null | undefined): string {
  if (!s || !Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

// PostgREST: "Could not find the 'channel' column of 'contact_notes' in the schema cache"
function missingColumn(err: any): string | null {
  const m = /Could not find the '([^']+)' column/i.exec(String(err?.message ?? ""));
  if (m) return m[1];
  const m2 = /column "?([a-z_]+)"? of relation "contact_notes" does not exist/i.exec(String(err?.message ?? ""));
  return m2 ? m2[1] : null;
}

export type InsertNoteInput = {
  contactId: string;
  channel: NoteChannel;
  text: string;
  at: string; // ISO
  authorEmail: string;
  attachments: NoteAttachment[];
};

export type InsertNoteResult = { ok: true; id: string | null; degraded: string[] } | { ok: false; error: string };

export async function insertContactNote(input: InsertNoteInput): Promise<InsertNoteResult> {
  const sb = supabaseAdmin();
  const degraded: string[] = [];
  let row: Record<string, unknown> = {
    contact_id: input.contactId,
    note_text: input.text,
    channel: input.channel,
    author_email: input.authorEmail,
    attachments: input.attachments,
    created_at: input.at,
  };
  // Up to 4 retries, dropping whichever column PostgREST says is missing.
  for (let i = 0; i < 5; i++) {
    const { data, error } = await sb.from("contact_notes").insert(row).select("id").maybeSingle();
    if (!error) return { ok: true, id: (data as any)?.id ?? null, degraded };
    const col = missingColumn(error);
    if (!col || !(col in row)) return { ok: false, error: error.message };
    degraded.push(col);
    const next = { ...row };
    delete next[col];
    if (col === "channel") next.note_text = `[${input.channel}] ${input.text}`;
    if (col === "author_email") next.note_text = `${next.note_text} — ${input.authorEmail}`;
    if (col === "attachments" && input.attachments.length) {
      next.note_text = `${next.note_text}\n${input.attachments.map((a) => `[attachment: ${a.name} · ${a.path}]`).join("\n")}`;
    }
    row = next;
  }
  return { ok: false, error: "Could not save the note (schema mismatch)" };
}

export type ContactNoteLite = { id: string; created_at: string; channel: string | null; attachments: NoteAttachment[] };

function parseAttachments(v: unknown): NoteAttachment[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((a) => a && typeof a === "object" && typeof (a as any).path === "string")
    .map((a: any) => ({
      name: String(a.name ?? "file"),
      path: String(a.path),
      type: String(a.type ?? "application/octet-stream"),
      size: Number(a.size ?? 0),
      kind: a.kind === "voice" ? "voice" : "file",
      duration_s: typeof a.duration_s === "number" ? a.duration_s : undefined,
    }));
}

// Notes with attachments for one contact (timeline chips). Best-effort: the
// attachments column may not exist yet → [].
let attachmentsColumnMissing = false;
export async function getContactNoteAttachments(contactId: string): Promise<ContactNoteLite[]> {
  if (attachmentsColumnMissing) return [];
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("contact_notes")
      .select("id, created_at, channel, attachments")
      .eq("contact_id", contactId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      if (/attachments|channel/.test(error.message) && /does not exist|schema cache/i.test(error.message)) attachmentsColumnMissing = true;
      return [];
    }
    return (data ?? [])
      .map((r: any) => ({ id: r.id, created_at: r.created_at, channel: r.channel ?? null, attachments: parseAttachments(r.attachments) }))
      .filter((r) => r.attachments.length > 0);
  } catch {
    return [];
  }
}

// Attachments for a page of feed rows. The view's `id` is text — we match
// either an embedded note uuid or (contact_id, at) pairs. Best-effort.
export async function getAttachmentsForFeed(rows: { id: string; contact_id: string | null; at: string; source: string | null }[]): Promise<Map<string, NoteAttachment[]>> {
  const out = new Map<string, NoteAttachment[]>();
  if (attachmentsColumnMissing) return out;
  const cand = rows.filter((r) => r.contact_id && (!r.source || /note/i.test(r.source)));
  if (cand.length === 0) return out;
  try {
    const sb = supabaseAdmin();
    const ids = Array.from(new Set(cand.map((r) => r.contact_id as string)));
    const ats = cand.map((r) => new Date(r.at).getTime()).filter((n) => !Number.isNaN(n));
    const lo = new Date(Math.min(...ats) - 120_000).toISOString();
    const hi = new Date(Math.max(...ats) + 120_000).toISOString();
    const { data, error } = await sb
      .from("contact_notes")
      .select("id, contact_id, created_at, attachments")
      .in("contact_id", ids)
      .gte("created_at", lo)
      .lte("created_at", hi)
      .is("deleted_at", null)
      .limit(500);
    if (error) {
      if (/attachments/.test(error.message) && /does not exist|schema cache/i.test(error.message)) attachmentsColumnMissing = true;
      return out;
    }
    const notes = (data ?? []).map((r: any) => ({ id: String(r.id), contact_id: r.contact_id, t: new Date(r.created_at).getTime(), attachments: parseAttachments(r.attachments) })).filter((n) => n.attachments.length);
    if (!notes.length) return out;
    for (const r of cand) {
      const byId = notes.find((n) => r.id.toLowerCase().includes(n.id.toLowerCase()));
      if (byId) { out.set(r.id, byId.attachments); continue; }
      const t = new Date(r.at).getTime();
      const near = notes.find((n) => n.contact_id === r.contact_id && Math.abs(n.t - t) < 2_000);
      if (near) out.set(r.id, near.attachments);
    }
  } catch {}
  return out;
}
