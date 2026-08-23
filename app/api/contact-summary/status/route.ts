import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getContactSummary } from "@/lib/data";

export const dynamic = "force-dynamic";

// GET /api/contact-summary/status?contact_id=<uuid> → the contact_summaries row
// (or { status: null } when none). Polled by the AI summary card every 10 s
// while a generation is in flight.
export async function GET(request: NextRequest) {
  await requireUser();
  const id = (request.nextUrl.searchParams.get("contact_id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "contact_id required" }, { status: 400 });
  const row = await getContactSummary(id);
  return NextResponse.json(row ?? { contact_id: id, status: null }, { headers: { "Cache-Control": "no-store" } });
}
