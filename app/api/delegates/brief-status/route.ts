import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getDelegate, getDelegateBriefStatus } from "@/lib/data";

export const dynamic = "force-dynamic";

// GET /api/delegates/brief-status?id=<delegate_id> → { status, generated_at }
// Polled by the detail page every 10 s while background research is in flight.
export async function GET(request: NextRequest) {
  await requireUser();
  const id = (request.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const d = await getDelegate(id);
  if (!d?.contact?.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const s = await getDelegateBriefStatus(d.contact.id as string, d.event_id ?? null);
  return NextResponse.json(s ?? { status: null, generated_at: null }, { headers: { "Cache-Control": "no-store" } });
}
