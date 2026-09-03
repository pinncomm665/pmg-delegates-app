import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { supabaseAdmin } from "@pmg/team-ui/lib/supabaseAdmin";
import { NOTES_BUCKET, NOTE_FILE_MAX_BYTES, isAllowedNoteMime, notePath } from "@pmg/team-ui/lib/notes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST multipart { contact_id, file, kind?: 'file'|'voice', duration_s? } →
// uploads ONE object into the private `contact-notes` bucket (pmg-agent mig
// 217) at contacts/<contact_id>/<ts>-<slug>. Returns { path, name, type, size }.
// The dialog calls this once per attachment before the note itself is saved.
export async function POST(request: NextRequest) {
  await requireUser();
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 }); }
  const contactId = String(form.get("contact_id") ?? "").trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(contactId)) return NextResponse.json({ error: "contact_id required" }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "file required" }, { status: 400 });
  const name = (file as File).name || String(form.get("name") ?? "attachment");
  const type = file.type || String(form.get("type") ?? "application/octet-stream");
  if (file.size <= 0) return NextResponse.json({ error: "Empty file" }, { status: 400 });
  if (file.size > NOTE_FILE_MAX_BYTES) return NextResponse.json({ error: "File is larger than 25 MB" }, { status: 413 });
  if (!isAllowedNoteMime(type)) return NextResponse.json({ error: `Unsupported file type (${type})` }, { status: 415 });

  const path = notePath(contactId, name);
  const sb = supabaseAdmin();
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await sb.storage.from(NOTES_BUCKET).upload(path, buf, { contentType: type, upsert: false });
  if (error) {
    const msg = String(error.message ?? "upload failed");
    if (/bucket not found|not found/i.test(msg)) {
      return NextResponse.json({ error: "Attachment storage not available yet (bucket contact-notes missing)" }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  return NextResponse.json({ path, name, type, size: file.size });
}
