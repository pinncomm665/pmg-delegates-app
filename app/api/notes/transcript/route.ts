import { NextRequest, NextResponse } from "next/server";
import { requireUser, isReviewer } from "@/lib/session";
import { supabaseAdmin } from "@pmg/team-ui/lib/supabaseAdmin";
import { getNoteTranscripts, requestTranscription } from "@pmg/team-ui/lib/notes";

export const dynamic = "force-dynamic";

// Voice-note transcription state (pmg-agent contact_notes.transcript*).
//   GET  /api/notes/transcript?ids=<uuid>,<uuid>  → { notes: [{ note_id, status, text }] }
//        — the detail-page poller (15 s while any note is pending/processing).
//   POST /api/notes/transcript { note_id }         → 202 — re-requests a
//        transcription (error/skipped). Admin / reviewer / note author only.
// Gate: signed in AND the note's contact is visible in this app.

const UUID = /^[0-9a-f-]{36}$/i;

async function visible(contactId: string): Promise<boolean> {
  const sb = supabaseAdmin();
  const { data: role } = await sb.from("delegates").select("id").eq("contact_id", contactId).limit(1).maybeSingle();
  return !!role;
}

export async function GET(request: NextRequest) {
  await requireUser();
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => UUID.test(s)).slice(0, 100);
  if (ids.length === 0) return NextResponse.json({ notes: [] });
  const rows = await getNoteTranscripts(ids);
  return NextResponse.json({ notes: rows.map((r) => ({ note_id: r.note_id, status: r.status, text: r.text })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  let body: any = null;
  try { body = await request.json(); } catch {}
  const noteId = String(body?.note_id ?? "").toLowerCase();
  if (!UUID.test(noteId)) return NextResponse.json({ error: "note_id required" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: note, error } = await sb.from("contact_notes").select("id, contact_id, author_email").eq("id", noteId).is("deleted_at", null).maybeSingle();
  if (error || !note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!note.contact_id || !(await visible(String(note.contact_id)))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const author = String((note as any).author_email ?? "").toLowerCase();
  if (!isReviewer(user) && (!author || author !== user.email.toLowerCase())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const sent = await requestTranscription(noteId);
  if (!sent) return NextResponse.json({ error: "Transcription service not configured" }, { status: 502 });
  return NextResponse.json({ ok: true, note_id: noteId, status: "pending" }, { status: 202 });
}
