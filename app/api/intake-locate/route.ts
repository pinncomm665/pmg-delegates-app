import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// POST { contact_id, event_id?, participant_type? }
// Resolve where a CRM contact "lives" in THIS app so the Add Contact flow can
// deep-link to it: a delegate seat (preferring the requested event_id)
// → /delegates/<row id>, else { href: null } — exists in the CRM but holds no
// delegate seat visible in this app.
export async function POST(request: NextRequest) {
  await requireUser();
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const contactId = String(body?.contact_id ?? "");
  const eventId = body?.event_id ? String(body.event_id) : null;
  if (!contactId) return NextResponse.json({ error: "contact_id required" }, { status: 400 });

  const sb = supabaseAdmin();
  type Row = { id: string; event_id: string | null; event_edition: string | null; stage: string | null };

  const rowFor = async (evId: string | null): Promise<Row | null> => {
    let q = sb.from("delegates").select("id, event_id, event_edition, stage").eq("contact_id", contactId);
    if (evId) q = q.eq("event_id", evId);
    const { data } = await q.order("created_at", { ascending: false }).limit(1);
    return (data?.[0] as Row) ?? null;
  };

  const row = (eventId ? await rowFor(eventId) : null) ?? (await rowFor(null));
  if (row) {
    return NextResponse.json({
      href: `/delegates/${row.id}`,
      kind: "delegate",
      role_id: row.id,
      event_id: row.event_id,
      edition: row.event_edition,
      stage: row.stage,
    });
  }
  return NextResponse.json({ href: null });
}
