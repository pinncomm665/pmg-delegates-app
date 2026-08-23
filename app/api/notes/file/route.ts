import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NOTES_BUCKET, contactIdFromNotePath } from "@/lib/notes";

export const dynamic = "force-dynamic";

// GET /api/notes/file?path=contacts/<contact_id>/<file> → 302 to a 1-hour
// signed URL for the private `contact-notes` object. Gate: signed in AND the
// contact is visible in this app (has a delegate role row). Used by the
// attachment chips (files open in a new tab; <audio src> follows the redirect).
export async function GET(request: NextRequest) {
  await requireUser();
  const path = (new URL(request.url).searchParams.get("path") ?? "").trim();
  const contactId = contactIdFromNotePath(path);
  if (!contactId) return NextResponse.json({ error: "Invalid path" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: role } = await sb.from("delegates").select("id").eq("contact_id", contactId).limit(1).maybeSingle();
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await sb.storage.from(NOTES_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
